# Navigator Skill 目錄與路由對照（Harness Engineering 最小版本）

> 最後更新：2026-07-24
>
> 這份檔案是 `待討論事項_0709.md` #14「Harness Engineering／Skill 路由」**最小版本**的落地：
> 把系統裡**現有**的能力模組，明確命名成一份 skill 清單，並標注「呼叫哪個 skill 對應哪段程式碼」。
>
> ⚠️ **範圍界定（避免重蹈 2026-07-24 的落地誤區）**：
> - 這是**靜態對照表（文件）**，不是重寫架構，也**不改任何一行程式碼**。
> - 這**不是**把兩個 Agent 各包成 1 個 skill（那等於現況、什麼都沒變）；而是拆到
>   `validators/`／`detectors/`／`evaluators/` 這一層的真實模組。
> - 「動態路由」（讓 LLM 依問題即時決定呼叫哪個 skill）**尚未實作、也尚未拍板要不要做**，
>   見文末「狀態與未決事項」。本表目前只描述「哪段輸入該走哪個 skill 群」的固定對應。
> - `enrichers/index.ts` 目前的單一 4-in-1 LLM 呼叫（facts + level + backup + description）
>   **本次不拆**，該重構依 #14 排在 P0 #1／#11 拍板後再評估。

---

## 一、Master Routing（任務類型 → skill 群）

| 進來的任務 | 路由到 | 對應 Agent |
|---|---|---|
| 驗證某景點真偽 / 算可信度 / 回填 poi_catalog | 驗證群（Stage 1–3） | poi-verifier |
| 語意搜尋 / 取備案候選 | 檢索群（RAG） | poi-verifier（查詢層） |
| 行程進行中出突發狀況、要不要 Swap／Switch | 應變群（偵測→評估→生成） | contingency-handler |

> 目前這層對應是**固定**的（輸入型別決定走哪群），由各 Agent 的 `agent.ts` 線性呼叫，
> 不是動態判斷。若未來要做教授描述的「主程式判斷呼叫哪個 skill」，這張表就是那個主檔的雛形。

---

## 二、POI Verifier 群

### Stage 1 — 多來源交叉驗證（`poi-verifier/src/validators/`）

| skill id | 對應檔案 | 職責 | LLM? |
|---|---|---|---|
| `official-website` | `validators/official-website.ts` | [P0] 官網 fetch + DDG URL 發現 | ✗ |
| `google-places` | `validators/google-places.ts` | [S1] Google Places Nearby + Details | ✗ |
| `osm-nominatim` | `validators/osm.ts` | [S1] OSM Nominatim（1 req/s） | ✗ |
| `blog-search` | `validators/blog-search.ts` | 部落格搜尋（DuckDuckGo→Serper fallback） | ✗ |
| `ptt-search` | `validators/ptt-search.ts` | [P1] PTT 旅遊/Hiking/Taipei 版爬取 | ✗ |
| `youtube-search` | `validators/youtube-search.ts` | [P2] YouTube Data API v3（已濾業配） | ✗ |
| `reliability-scoring` | `validators/index.ts`（`crossValidate`） | 並行呼叫上列來源 + 可信度計分（Σ 來源×時間衰減） | ✗ |

### Stage 1.5 — 衝突解析與正規化（`poi-verifier/src/`）

| skill id | 對應檔案 | 職責 | LLM? |
|---|---|---|---|
| `conflict-resolver` | `conflict-resolver.ts` | 多來源 name/address/hours/is_open 衝突裁決（tier/recency/coexist） | ✗ |
| `canonical-normalizer` | `canonical-poi.ts` | 正規化為 canonical POI 結構 | ✗ |
| `tdx-mapper` | `tdx-mapper.ts` | TDX 觀光 API 四實體 → Navigator 欄位對映 | ✗ |

### Stage 2 — 增補分級（`poi-verifier/src/enrichers/`）

| skill id | 對應檔案 | 職責 | LLM? |
|---|---|---|---|
| `level-classifier` | `enrichers/level-classifier.ts`（`preClassifyLevel`） | 規則引擎預分類 L0–L3（權威，覆蓋 LLM） | ✗ |
| `resilience-generator` | `enrichers/resilience-generator.ts`（`generateBackupLogic`） | 備案邏輯生成（規則優先，LLM 僅 fallback） | 多數 ✗ |
| `multi-criteria-ranker` | `enrichers/multi-criteria-ranker.ts` | 備援候選池多準則排序 | ✗ |
| `enrich-llm` ⚠️ | `enrichers/index.ts`（`enrich`） | **目前的 4-in-1 LLM 呼叫**：facts + level + backup + 旅客描述 | ✓ Gemini→Claude |

> ⚠️ `enrich-llm` 是 #14 裡標記「未來要拆成獨立 skill」的那一個，目前仍是單次融合呼叫，本表不拆。

### Stage 3 — 入庫（`poi-verifier/src/ingestion.ts`）

| skill id | 對應檔案 | 職責 | LLM? |
|---|---|---|---|
| `extract-insights` | `ingestion.ts`（`extractInsights`） | 從部落格萃取非通用洞察（限制/建議/天氣/人潮/近況） | ✓ Gemini |
| `embed-document` | `ingestion.ts`（`getEmbedding`） | gemini-embedding-001，768 維，RETRIEVAL_DOCUMENT | ✓（embedding，非生成） |
| `ingest-upsert` | `ingestion.ts`（`ingestToDB`） | Upsert 至 Supabase poi_catalog | ✗ |

> ⚠️ `ingest-upsert` 正是 #11 signals 缺欄 bug 的所在：`batch-verify.ts`／`ingest-from-results.ts`
> 呼叫時沒帶 `signals`，回填會丟失 category/image_url/website_url。大規模匯入前須先修。

### 查詢層 — RAG 檢索（`poi-verifier/` 根目錄腳本）

| skill id | 對應檔案 | 職責 | LLM? |
|---|---|---|---|
| `hybrid-search` | `hybrid-search.ts` | 關鍵字二元組 + pgvector 語意，RRF 融合 | ✓（query embedding） |
| `rag-reranker` | `rag-reranker.ts` | 兩階段重排：結構加權 40% + Gemini 交叉評分 60%（`--no-llm` 可關） | ✓（可選） |

---

## 三、Contingency Handler 群

### 偵測（`contingency-handler/src/detectors/`）

| skill id | 對應檔案 | 職責 | 狀態 |
|---|---|---|---|
| `weather-detector` | `detectors/weather-detector.ts` | CWA 天氣偵測（heavy_rain 等） | ✅ demo-active |
| `traffic-detector` | `detectors/traffic-detector.ts` | 交通事件偵測 | 🧊 凍結 stub（§7.5） |
| `venue-detector` | `detectors/venue-detector.ts` | 場地關閉/爆滿偵測 | 🧊 凍結 stub |
| `group-detector` | `detectors/group-detector.ts` | 成員體力/群組狀態 | 🧊 凍結 stub |

> 偵測層是**目前唯一有「動態路由」雛形**的地方：事件型別 → 對應 detector。
> 但只有 weather 是活的，其餘三個是凍結 stub，實質仍是單一路徑。

### 評估（`contingency-handler/src/evaluators/`）

| skill id | 對應檔案 | 職責 | LLM? |
|---|---|---|---|
| `expected-value-calculator` | `evaluators/expected-value-calculator.ts` | 期望值計算（要不要啟動應變） | ✗ |
| `strict-checker` | `evaluators/strict-checker.ts` | 嚴格篩選：逐筆淘汰爆滿/打烊/超支/禁忌備案（反思審查） | ✗ |
| `narrative-checker` | `evaluators/narrative-checker.ts` | 敘述反思：檢查 LLM 產出無幻覺/無危險建議 | ✗（規則檢查） |

### 生成（`contingency-handler/src/generators/`）

| skill id | 對應檔案 | 職責 | LLM? |
|---|---|---|---|
| `contingency-plan-generator` | `generators/contingency-plan-generator.ts` | 打包決策理由 + 備案清單 + 使用者選項 | 組裝，內含下者 |
| `llm-narrator` | `generators/llm-client.ts` | 把已決定的方案寫成一句人話（LLM 不做決策） | ✓ Gemini→Claude |

### 共用 — 備案候選來源

| skill id | 對應檔案 | 職責 | LLM? |
|---|---|---|---|
| `poi-catalog-client` | `contingency-handler/src/poi-catalog-client.ts` | 從 poi_catalog 取候選（query embedding + pgvector） | ✓（query embedding） |
| `poi-adapter` | `contingency-handler/src/poi-adapter.ts` | poi_catalog 記錄 → 應變系統候選型別轉接 | ✗ |

---

## 四、統計與成本觀察

- **清單總數**：約 26 個具名 skill（驗證群 15 + 應變群 11），已達教授「數十種」的量級，
  且全部對映到**現有**程式碼，非新增功能。
- **只有少數觸及生成式 LLM**（成本相關）：`enrich-llm`、`extract-insights`、`rag-reranker`（可選）、
  `llm-narrator`——約 4 個。其餘多為外部 API 查詢或純規則模組（零生成 token）。
  → 這點本身就是 #16／#19（成本）與 #20（解耦：多數決策在規則層、不綁 LLM）的直接佐證。
- `index.ts`（各層的 orchestrator）與 `types.ts`／`tdx-types.ts`（型別定義）**不列為 skill**——
  前者是「呼叫 skill 的那隻手」，後者不是能力。

---

## 五、狀態與未決事項

- **本表已完成的**：靜態 skill 命名 + 檔案對照 + Master Routing 雛形表（不動程式碼）。
- **尚未做、且待教授確認才決定要不要做的**（見 #14）：
  1. 是否要把 `enrich-llm` 的 4-in-1 呼叫拆成獨立可鏈式 skill（排在 P0 #1／#11 之後再評估）。
  2. 「Master Routing」要停在本表這種**靜態對照**，還是要做成**動態路由**（主程式即時判斷呼叫哪個 skill）——
     教授 07/22 舉的 Google Skill 框架聽起來像動態版，但現有模組化程度撐不撐得起沒有共識。
- 更新規則：新增／改名／凍結任何 `validators/`、`detectors/`、`evaluators/`、`enrichers/` 模組時，
  順手更新本表對應列，維持「文件 = 程式碼」不漂移。

---

## 六、2026-07-24 pipeline 實查：skill 化前必讀的三個前提

> 這節是實際讀 `poi-verifier/src/` 與 `results/poi_verified.json` 後的結論，回應「這份 skill 拆分值不值得」。
> 完整細節見 `KNOWN_ISSUES.md`（三筆 2026-07-24 條目）與 `待討論事項_0709.md` #14（2026-07-24 pipeline 實查）。

1. **skill 化前，先修「靜默降級」——這比拆 skill 急。** 現行 `poi_verified.json` 45 筆有 **30 筆是 fallback 降級**（批次跑到一半 Gemini Free Tier 配額耗盡，後 30 筆走 `enrichers/index.ts:219` 的「LLM 不可用 → 預設 L2」）。所以本表 §二 說的「Stage 2 增補分級」對這 30 筆其實沒真的跑；`enrich-llm` 標 ✓ 但實際 2/3 是 ✗。`agent.ts` 又沒把 `llm_source` 寫進輸出，下游分不出真 L2 與失敗 L2。**在這件事修好前，任何 skill 敘事都是建立在「有 2/3 資料沒真的驗過」的地基上。**

2. **skill 化真正能修的，是「讓失敗顯性」與「讓 ablation 可測」，不是路由本身。** 統一 skill 回傳型別（`{value, source, confidence, degraded}`）會強制每個模組宣告出處，正是上面 30/45 問題的架構性解法；統一介面也才能做「抽掉某來源 → reliability_score 準不準」的對照實驗（呼應 #13 Benchmark）。而 §一 的「動態路由」在 Stage 1–3 是真線性流程下，demo 前不建議做——等於替單一路徑蓋派工器。

3. **§四「多數決策在規則層、不綁 LLM」這句要小心。** 複查 `preClassifyLevel`：只在名稱／描述含 8 個預約關鍵字時觸發，45 筆只命中 2 筆——level 分類實際 ~96% 仍靠 LLM。這句敘事在教授複查程式碼時最容易被戳破，建議先補強規則或修正口徑，再拿它當「解耦／規則優先」的佐證。

> 一句話：本表把現有模組命名成 skill 清單（靜態對照）這件事本身沒問題、也不卡 #1；但「skill 化值不值得」的答案是——**值得的那部分是把靜默降級變成顯性契約，不是動態路由**。動手拆 skill 前，先做兩個非 skill 的前置修正：從 enrich prompt 移除會被丟棄的 `suggested_level`/`backup_logic`、把 `llm_source` 傳進輸出並重跑那 30 筆。
