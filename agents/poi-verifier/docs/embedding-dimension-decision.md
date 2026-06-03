# Embedding 維度決策：為什麼 poi_catalog 統一用 768

> 決策日期：2026-06-03
> 適用範圍：`poi_catalog.embedding`、`match_poi_catalog` RPC、所有產生/查詢該表向量的腳本
> 一句話結論：**現階段（demo, 45 筆 POI）embedding 維度統一用 768；目前不採用 3072（無法建索引）；擴台時再用真實資料 benchmark 決定要不要升 1536。**

---

## 1. 背景：發生了什麼事

`poi_catalog` 的 embedding 維度一度在 **768 ↔ 3072** 之間來回，造成兩個實際問題：

1. **查詢直接報錯**：寫入端與查詢端維度不一致時，`match_poi_catalog` 會丟
   `different vector dimensions 3072 and 768`，語意搜尋整段失效。
2. **索引建不起來**：欄位是 3072 時，pgvector 無法建 HNSW / ivfflat 索引（見下），只能全表掃描。

根因是**兩條平行管線各用不同維度**（一條 768、一條 3072），同一張表被互相覆寫。本決策把維度收斂成單一標準，並補回索引。

---

## 2. 核心硬限制：3072 無法建索引

pgvector 的兩種向量索引（HNSW、ivfflat）對 `vector` 型別都有 **2000 維上限**。

| 維度 | 能否建 HNSW / ivfflat |
|------|----------------------|
| 768  | ✅ 可以 |
| 1536 | ✅ 可以 |
| 3072 | ❌ 超過 2000 維上限，無法建索引 |

沒有索引時，每次查詢都要跟全表每一筆算一次相似度（sequential scan）。45 筆無感，但**擴到全台數萬筆會明顯變慢**。這也是現階段不選 3072 的主要原因——比較不是偏好問題，而是工具本身的限制。

> 補充：若未來真的需要 >2000 維，pgvector 的 `halfvec` 型別 HNSW 可支援到 4000 維。但那是擴台後的進階選項，現階段不需要。

---

## 3. 768 vs 3072 優缺點對照

| 面向 | 768（採用） | 3072（棄用） |
|------|------------|-------------|
| 可建索引 | ✅ HNSW 可用 | ❌ 超過 2000 維上限 |
| 查詢速度（擴台後）| 快（走索引）| 慢（只能全表掃）|
| 儲存成本 | 約 3 KB / 筆 | 約 12 KB / 筆（4 倍）|
| 計算成本 | 每次比對 768 次乘加 | 每次 3072 次乘加 |
| 語意表達力 | 對 45 筆、概念分得開的資料**綽綽有餘** | 理論上更細，但小資料用不到 |
| 分數分離度（實測）| **較好** | 較差（見下）|

### 反直覺重點：高維不一定比較準

維度越高會遇到**維度詛咒（curse of dimensionality）**——向量之間的距離趨於「都差不多遠」，導致相關與不相關的相似度都擠在一起，門檻切不開。

我們用同一組 8 個測試情境實測（query 端維度對齊欄位）：

| 維度 | 「精準命中」相似度 (S07) | 「無關查詢」相似度 (S08) | **相關 vs 無關 落差** |
|------|------------------------|------------------------|----------------------|
| 3072 | 78.5% | 65.6% | 12.9% |
| **768** | 77.2% | **62.6%** | **14.6%** ✅ |

→ 降到 768 後，**真正相關的景點分數幾乎沒掉，但無關查詢的分數被壓低**，落差變大、門檻更好用。對 45 筆這種小而概念分散的資料，768 是甜蜜點。

---

## 4. 為什麼降維幾乎不損品質：Matryoshka

`gemini-embedding-001` 採用 **Matryoshka 表示學習（MRL）**：訓練時就把最重要的語意塞在前面的維度。因此可直接用 API 參數 `outputDimensionality: 768` 取得 768 維向量，語意內容與 3072 幾乎一致，不需要犧牲檢索品質。

實作上只是 embed 請求多帶一個參數：

```ts
body: JSON.stringify({
  content: { parts: [{ text }] },
  outputDimensionality: 768,        // ← 關鍵：不設會回滿 3072
  taskType: 'RETRIEVAL_DOCUMENT',   // query 端對應 RETRIEVAL_QUERY
})
```

> cosine 相似度本身對長度不敏感（公式已除以向量長度），所以截斷後不需額外正規化即可用 `<=>` 比對。

---

## 5. 最終決策

| 階段 | 維度 | 索引 | 說明 |
|------|------|------|------|
| 現在（demo, 45 筆）| **768** | HNSW | 已驗證 8/8、分離度最佳、與主管線 `src/ingestion.ts` 一致 |
| 擴台（數千～數萬筆）| 768 起步 | HNSW | HNSW 寫入時自動維護，加資料不必重建 |
| 全台（評估升維）| benchmark 後定 768 / 1536 | HNSW | 用**真實全台資料**實測再決定，不靠猜 |

**現階段不選 3072**：受限於索引上限無法建索引，且對小資料分離度反而較差；未來若有 `halfvec` 等做法需要時再評估。
**現在不直接上 1536**：45 筆換不到可量化好處，且 1536 是否為全台最佳仍需真實資料驗證——重生成成本極低（45 筆幾秒、免費），等有數據再一次定終身，避免多次 churn。

---

## 6. 維度切換 SOP（避免再發生 split-brain）

維度是**單一事實來源**，任何切換必須整套一起做、且只由一個人執行：

1. **DDL（Supabase SQL Editor）**：drop index → `ALTER COLUMN embedding TYPE vector(N) USING NULL`
   → 建 HNSW index → `CREATE OR REPLACE FUNCTION match_poi_catalog(... vector(N) ...)`
   （範本見 `supabase/migrations/006_embedding_768.sql`）
2. **重生成本地向量**：`npm run rag:build`（basic-rag.ts，輸出 N 維）
3. **重灌 Supabase**：`npm run rag:ingest`
4. **驗證**：抽全部列量 embedding 長度應 distinct = `[N]`；`match_poi_catalog`（N 維 query）能回結果；整合測試 `npm run test:rag:supabase` 全綠

### 幾個約定

- **poi_catalog 維度維持單一**，目前是 768。要調整的話，先在這份文件更新決策、再走上面的 SOP。
- **盡量不要同時維護兩條不同維度的 ingest 管線**，否則兩邊會互相覆寫欄位（這次就是這樣出狀況的）。
- 寫入端維度（`outputDimensionality`）必須等於查詢端維度，等於欄位 `vector(N)`，三者一致才不會報 `different vector dimensions`。

---

## 7. 相關檔案

| 檔案 | 角色 |
|------|------|
| `supabase/migrations/006_embedding_768.sql` | 欄位 768 + HNSW index + RPC（切換範本）|
| `agents/poi-verifier/basic-rag.ts` | 產生本地向量索引（`outputDimensionality:768` + 維度防呆）|
| `agents/poi-verifier/ingest-embeddings.ts` | 將向量寫入 poi_catalog |
| `agents/contingency-handler/src/poi-catalog-client.ts` | 應變 agent 查詢端（需與欄位同維度）|
| `agents/poi-verifier/tests/supabase-rag.test.ts` | 8 情境整合測試 |
