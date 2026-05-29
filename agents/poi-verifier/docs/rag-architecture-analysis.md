# RAG 架構分析：Navigator 專案適用性評估

> 分析日期：2026-05-29  
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
| Embedding 生成 | ❌ 未實作 | 沒有呼叫任何 embedding API 的程式碼 |
| 向量儲存 | ❌ 未實作 | Supabase pgvector 在架構規劃中，但 migration 未建 |
| 相似度搜尋 | ❌ 未實作 | 完全沒有 cosine similarity / dot product 邏輯 |
| 注入 LLM prompt | ❌ 不存在 | 因為搜尋沒做，也就沒有注入 |

**結論：未實作。`semantic_description` 欄位是為此設計的預留資料，但三個核心步驟（embedding、向量存儲、相似度搜尋）都還沒做。**

**使用場景（若實作後）**

使用者輸入：「我想找有文藝氣息、適合拍照的地方」  
→ 生成 query embedding  
→ 與 45 筆 POI 的 `semantic_description` embedding 做相似度搜尋  
→ 返回：九份老街（0.87）、朱銘美術館（0.83）、麟山鼻木棧道（0.79）  
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
// ^ blogs 等 API 結果被組成 prompt context，LLM 基於此生成 enrichment
```

但這些是**直接 REST API fetch 呼叫，不是 MCP 協議**：

- `validators/google-places.ts` → `fetch('https://maps.googleapis.com/...')`
- `validators/osm.ts` → `fetch('https://nominatim.openstreetmap.org/...')`
- `validators/blog-search.ts` → Python subprocess 或 `fetch('https://google.serper.dev/...')`

MCP 協議需要在 LLM 與資料源之間建立一個統一的連接層（工具宣告、schema、呼叫轉發），目前專案沒有這層。

**結論：有「即時外部資料查詢 → 注入 LLM」的精神，但實作上是 Tool Use 而非 MCP 架構。若要整合 pp-firecrawl MCP 或 Supabase MCP，才需要升級到這個架構。**

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
  Step 3+4+5（hardcoded）: 把結果組成 prompt → LLM enrichment
  LLM 在最後才介入，不決定「要不要再查一個來源」

Contingency Handler:
  Step 1（hardcoded）: performStrictCheck
  Step 2（hardcoded）: multi-criteria scoring
  Step 3（hardcoded）: selectStrategy
  Step 4（hardcoded）: LLM 生成敘事文字
  LLM 只負責最後 1 步的語言生成
```

**結論：是固定 pipeline + LLM 語言生成，不是 Agent RAG。真正的 Agent RAG 中，LLM 會自己判斷「Google Places 資料不夠，需要再搜部落格」或「部落格資料過時，去抓官網」，目前這些判斷都是 hardcoded 邏輯。**

---

## 現在系統實際在做什麼

雖然以上四種 RAG 架構都沒有完整實作，但系統確實有三種真實的資料增強機制：

### 機制 A：工具呼叫 + LLM 生成（POI Verifier）

```
景點名稱 + 座標
  → 工具 1: Google Places API（官方資料）
  → 工具 2: OSM Nominatim（地名確認）
  → 工具 3: DuckDuckGo/Serper（部落格搜尋）
    ↓
所有 API 結果 → 組成 prompt context → Gemini 2.5 Flash
    ↓
結構化輸出：level / backup_logic / tourist_description
```

這是 Tool Use，不是 RAG（知識庫不是預先建立的，是 query time 即時查詢的外部服務）。

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

### 機制 C：靜態知識庫（poi-kb.ts）

`src/data/poi-kb.ts` 是 auto-generated 的 TypeScript 常數，包含 45 筆 POI 的所有驗證結果。這是知識庫，但目前只支援精確查詢（by ID）或 metadata 過濾，不支援語意搜尋。

---

## 實作基礎 RAG 所需的步驟

```
現在有的：
  src/data/pois.ts  → semantic_description（45 筆，已撰寫完畢）

需要加的：
  Step 1: 呼叫 Gemini text-embedding-004，對每筆 semantic_description 生成 embedding（768 維）
  Step 2: 儲存 embedding（本地 JSON 索引 或 Supabase pgvector）
  Step 3: query time：使用者輸入 vibe → 生成 query embedding → cosine similarity → top-K
  Step 4: top-K POI 注入 Architect Agent prompt → LLM 產個性化行程草案
```

`basic-rag.ts` 實作了 Step 1–3 的本地 prototype（使用 JSON 索引），pgvector 遷移路徑在腳本中有說明。

---

## 小結

| 架構 | 定義核心特徵 | 本專案 | 原因 |
|------|------------|--------|------|
| ① 基礎 RAG | 向量化 + 相似度搜尋 | ❌ 未實作 | 無 embedding；`semantic_description` 是預留欄位 |
| ② 結構化 RAG | 保留文件章節層次 | ❌ 不適用 | 資料是 POI JSON，不是長篇文件 |
| ③ MCP + RAG | MCP 協議連外部源 | ❌ 未實作 | 使用直接 REST fetch，非 MCP |
| ④ Agent RAG | LLM 自主規劃搜尋路徑 | ❌ 未實作 | 固定 pipeline，LLM 只做最後生成 |

**優先實作建議**：① 基礎 RAG，因為 semantic_description 已備好，Gemini embedding API 成本極低（約 NT$0.0001/次），且能直接解決「使用者 vibe → 個性化 POI 推薦」這個核心痛點。詳見 `basic-rag.ts`。
