# RAG 架構分析：Navigator 專案適用性評估

> 初稿日期：2026-05-29 ／ 最後更新：2026-06-17  
> 評估範圍：本專案現有程式碼（agents/poi-verifier、agents/contingency-handler、src/data）

---

## 什麼是 RAG？

RAG（Retrieval-Augmented Generation）的嚴格定義是三個步驟的組合，缺一不可：

```
① Retrieval   — 在 query time 從外部知識庫「搜尋」相關片段
② Augmented   — 把搜尋到的片段注入 LLM 的 prompt 作為 context
③ Generation  — LLM 基於這份 context 生成答案
```

關鍵在「Retrieval」：必須有一個知識庫，且必須有一個動態的「搜尋/取得相關片段」動作。

---

## 四種架構：定義 × 本專案現狀

---

### ① 基礎 RAG

**定義**

```
文件 → 切塊（chunking）→ embedding → 向量資料庫
查詢 → embedding → 相似度搜尋（cosine/dot）→ top-K 片段 → 注入 prompt → LLM
```

適合：FAQ、知識庫問答、文件搜尋。

**本專案現狀**

| 元素 | 狀態 | 說明 |
|------|------|------|
| 知識庫原料 | ✅ 已備好 | `src/data/pois.ts` 每筆 POI 有精心撰寫的 `semantic_description` |
| Embedding 生成 | ✅ 已實作 | `basic-rag.ts` 呼叫 `gemini-embedding-001`（768 維），結果存於本地 `results/poi-embeddings.json` |
| 向量儲存 | ✅ 已實作 | Supabase `poi_catalog` 表加入 `embedding vector(768)`，並建立 HNSW index（migration `005`） |
| 相似度搜尋 | ✅ 已實作 | Supabase `match_poi_catalog` RPC（cosine distance `<=>`），支援 `region` 與 `space_type` 過濾 |
| 注入 LLM prompt | ⏳ 待接線 | 搜尋層已就緒；top-K 結果尚未接入 Architect Agent prompt flow |

**實測結果（2026-06-03，`supabase-rag.test.ts` 8/8 PASS）**

| 情境 | 查詢 | Top-1 相似度 | 命中率 |
|------|------|------------|--------|
| 雨天室內親子 | 下雨天帶小孩去室內的活動景點 | 69.1% | 4/4 |
| 網美拍照打卡 | 浪漫唯美的拍照打卡網美景點 | 73.1% | 3/4 |
| 歷史文化深度 | 有歷史故事和人文深度的文化景點導覽 | 70.0% | 3/4 |
| L3 水位調節景點 | 沿途順遊快速停留的小景點 | 70.5% | 2/5 |
| 地質奇岩（戶外過濾） | 壯觀的岩石地質景觀海蝕地形 | 73.4% | 4/4 |
| 陽明山火山溫泉（地區過濾） | 火山地熱硫磺溫泉放鬆療癒 | 72.0% | 3/3 |
| 精準景點名稱命中 | 九份山城老街霧氣迷離茶樓燈籠 | 77.2% | 2/2 |
| 無關語意邊界測試 | 各景點的停車費用和交通方式比較 | 62.6%（上限 68%） | — |

> 整體相似度分佈：62%–77%（無關查詢顯著低於有關查詢，語意邊界清晰）

**結論：已實作完成。`basic-rag.ts` 提供本地 JSON 索引版（cosine similarity），`supabase-rag.test.ts` 驗證 Supabase pgvector 版。下一步是將 top-K 結果接入 Architect Agent 的 prompt context。**

**使用場景（已可用）**

使用者輸入：「我想找有文藝氣息、適合拍照的地方」  
→ 生成 query embedding（`gemini-embedding-001`）  
→ `match_poi_catalog` RPC（cosine distance，threshold=0.4）  
→ 返回：石門婚紗廣場（73.1%）、三貂角燈塔（68.6%）、老梅綠石槽（68.5%）  
→ 注入 Architect Agent prompt，產出個性化行程草案

---

### ② 結構化 RAG

**定義**

```
長文件 → 解析目錄/章節層次 → 以層次結構為索引
查詢 → 先定位結構位置（章節、標題）→ 再取精確片段 → 注入 prompt → LLM
```

適合：年報、法規手冊、技術規格書等有明確層次的長文件。

**本專案現狀**

本專案的 Contingency Handler 有「先過濾後排序」的邏輯：

```typescript
// contingency-plan-generator.ts
const { qualified, disqualified } = performStrictCheck(candidatePool, event, config)  // 硬篩選
const scored = qualified.map(poi => scoreCandidate(...))                               // 多準則排序
const strategy = selectStrategy(event, scored)                                         // 策略選擇
const narrative = await generateNarrative(..., llm)                                    // LLM 生成
```

這看起來有「結構化 → LLM」的精神，但**這是資料庫 metadata 條件過濾（SQL WHERE），不是文件結構化 RAG**：

- 結構化 RAG 的「結構」= 文件的目錄/章節/標題層次
- 本專案的「結構」= POI 的 `level`、`is_indoor`、`weather_sensitivity` 欄位

**結論：不適用。本專案沒有需要保留章節層次才能準確搜尋的長篇文件。若未來要讓 AI 理解 12 章架構書的內容，才需要這個架構。**

---

### ③ MCP + RAG

**定義**

```
不預先建索引
查詢時 → AI 透過 MCP 協議 → 即時連接資料庫 / API → 取得最新資料 → 注入 prompt → LLM
```

適合：庫存查詢、CRM、即時價格、需要永遠最新資料的場景。

**本專案現狀**

POI Verifier 在驗證時確實做了「即時查詢 + 注入 prompt」：

```typescript
// agent.ts
const validation = await crossValidate(input)          // 即時查 Google Places + OSM + DDG
const enrichOutput = await enrich(input, ..., validation.google, validation.osm, validation.blogs)
// ^ API 結果被組成 prompt context，LLM 基於此生成 enrichment
```

但這些是**直接 REST API fetch 呼叫，不是 MCP 協議**：

- `validators/google-places.ts` → `fetch('https://maps.googleapis.com/...')`
- `validators/osm.ts` → `fetch('https://nominatim.openstreetmap.org/...')`
- `validators/ptt-search.ts` → `fetch('https://www.ptt.cc/bbs/travel/search?...')`
- `validators/official-website.ts` → DDG 發現 URL + `fetch(url)`
- `validators/youtube-search.ts` → `fetch('https://www.googleapis.com/youtube/v3/search?...')`

MCP 協議需要在 LLM 與資料源之間建立一個統一的連接層（工具宣告、schema、呼叫轉發），目前專案沒有這層。

**結論：有「即時外部資料查詢 → 注入 LLM」的精神，但實作上是 Tool Use 而非 MCP 架構。若要整合 firecrawl MCP 或 Supabase MCP，才需要升級到這個架構。**

---

### ④ Agent RAG

**定義**

```
LLM 自主決定：
  要搜什麼 → 執行搜尋 → 看結果 → 決定要不要再搜、搜什麼 → 迭代直到夠用 → 生成答案
```

適合：複雜研究任務、需要跨多來源動態規劃搜尋路徑的場景。

**本專案現狀**

兩個 agent 都是**人工設計的固定 pipeline**，LLM 不決定搜尋路徑：

```
POI Verifier:
  Step 1+2（hardcoded）: 平行查 Google + OSM + DDG
  Step 3（hardcoded）: 查 PTT / 官網 / YouTube（P0/P1/P2 validators）
  Step 4+5（hardcoded）: 把結果組成 prompt → LLM enrichment
  LLM 在最後才介入，不決定「要不要再查一個來源」

Contingency Handler:
  Step 1（hardcoded）: performStrictCheck
  Step 2（hardcoded）: multi-criteria scoring
  Step 3（hardcoded）: selectStrategy
  Step 4（hardcoded）: LLM 生成敘事文字
  LLM 只負責最後 1 步的語言生成
```

**結論：是固定 pipeline + LLM 語言生成，不是 Agent RAG。真正的 Agent RAG 中，LLM 會自己判斷「Google Places 資料不夠，需要再搜部落格」或「PTT 無結果，改查 YouTube」，目前這些判斷都是 hardcoded 邏輯。**

---

## 現在系統實際在做什麼

### 機制 A：工具呼叫 + LLM 生成（POI Verifier）

```
景點名稱 + 座標
  → 工具 1: Google Places API（評分、營業時間、官方名稱）
  → 工具 2: OSM Nominatim（地名確認）
  → 工具 3: DuckDuckGo/Serper（部落格搜尋）
  → 工具 4: [P0] 景點官網（DDG 發現 URL + 抓取內容，遵守 robots.txt）
  → 工具 5: [P1] PTT 旅遊版（travel/Hiking/Taipei 版搜尋；22/45 景點有文章）
  → 工具 6: [P2] YouTube Data API（非業配影片搜尋；39/45 景點有影片）
    ↓
所有來源結果 → 組成 prompt context → Gemini Flash
    ↓
結構化輸出：level / backup_logic / tourist_description / reliability_score
```

這是多源 Tool Use，不是 RAG（知識庫不是預先建立的，是 query time 即時呼叫外部服務）。

**P0/P1/P2 批次測試結果（45 筆 POI，2026-06-04 / 2026-06-17）**

| 來源 | 覆蓋率 | 備註 |
|------|--------|------|
| [P0] 官網 | 12 / 45 (27%) | 多數小型步道無官網；12 筆中有部分為旅遊部落格而非真正官網 |
| [P1] PTT | 22 / 45 (49%) | travel + Hiking + Taipei 三版；零結果多為商業設施和冷門小景點 |
| [P2] YouTube | 39 / 45 (87%) | 消耗 4,500 / 10,000 units；零結果 6 筆多為預約制商業場所 |

### 機制 B：結構化過濾 + LLM 敘事（Contingency Handler）

```
POI 池（poi-kb.ts，靜態知識庫）
  → 嚴格硬篩選（level / space_type / hours）
  → 多準則加權排序（11 個指標，依事件動態調整權重）
    ↓
top-5 候補景點 → 組成 prompt context → Gemini
    ↓
自然語言應變建議（1-2 句積極語氣）
```

這最接近基礎 RAG 的雛形（靜態知識庫 → 過濾取出相關片段 → 注入 LLM），但「搜尋」方式是 metadata filter，不是向量相似度。

### 機制 C：基礎 RAG 語意搜尋（Supabase pgvector）✅ 新增

```
知識庫建立（一次性）：
  poi_verified.json（45 筆 POI）
    → gemini-embedding-001（768 維）
    → Supabase poi_catalog.embedding（HNSW index）

Query time：
  使用者輸入 vibe 描述
    → gemini-embedding-001（query embedding）
    → match_poi_catalog RPC（cosine distance，threshold=0.4）
    → 支援 filter：region（北海岸/陽明山/東北角）、space_type（indoor/outdoor）
    → top-K POI（可注入 Architect Agent prompt）
```

這是本專案目前唯一完整符合 RAG 嚴格定義的機制。8/8 整合測試通過，相似度分佈 62–77%。

### 機制 D：靜態知識庫（poi-kb.ts）

`src/data/poi-kb.ts` 是 auto-generated 的 TypeScript 常數，包含 45 筆 POI 的所有驗證結果。目前支援精確查詢（by ID）或 metadata 過濾，語意搜尋由機制 C（Supabase pgvector）負責。

---

## 已完成實作清單

```
✅ basic-rag.ts              本地 JSON 索引版（cosine similarity，用於離線測試）
✅ supabase-rag.test.ts      Supabase pgvector 版整合測試（8/8 PASS，2026-06-03）
✅ supabase migrations 005   poi_catalog 加入 embedding vector(768) + HNSW index
✅ validators/ptt-search.ts  [P1] PTT 旅遊版搜尋
✅ validators/official-website.ts [P0] 景點官網自動發現 + robots.txt 遵守
✅ validators/youtube-search.ts   [P2] YouTube Data API v3（業配過濾）
✅ tests/batch-new-validators-report.md  P0+P1 批次報告（45 POI）
✅ tests/batch-youtube-validators-report.md  P2 批次報告（45 POI，2026-06-17）
```

**尚未接線（已具備條件，待整合）**

```
⏳ Architect Agent prompt flow 接入 match_poi_catalog top-K 結果
⏳ P0/P1/P2 整合進完整 verifyPoi() pipeline（目前各 validator 獨立執行）
⏳ YouTube view_count（需額外 videos.list call，45×5 = 225 units，在免費額度內）
```

---

## 小結

| 架構 | 定義核心特徵 | 本專案 | 說明 |
|------|------------|--------|------|
| ① 基礎 RAG | 向量化 + 相似度搜尋 | ✅ 已實作 | Supabase pgvector HNSW + gemini-embedding-001，8/8 測試通過 |
| ② 結構化 RAG | 保留文件章節層次 | ❌ 不適用 | 資料是 POI JSON，不是長篇文件 |
| ③ MCP + RAG | MCP 協議連外部源 | ❌ 未實作 | 使用直接 REST fetch（Tool Use），非 MCP |
| ④ Agent RAG | LLM 自主規劃搜尋路徑 | ❌ 未實作 | 固定 pipeline，LLM 只做最後生成 |

**下一步優先建議**：將 `match_poi_catalog` top-K 結果接入 Architect Agent 的 prompt context，完成「使用者 vibe 描述 → 語意搜尋 → 個性化行程草案」的端到端 demo 路徑。搜尋層已驗證可用，只差最後一段接線。
