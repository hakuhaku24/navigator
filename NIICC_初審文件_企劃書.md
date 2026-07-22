# NIICC 初審文件 — 企劃書

> 作品名稱：可信景點資料庫與即時韌性應變旅遊系統
> 作品英文名稱：Navigator（領航者）

> 本文件依 repo 原始碼現況與對外競賽敘事（`系統架構圖_競賽版.md`）撰寫，功能完成度誠實區分「已實作」與「原型／規劃中」。技術版本以 `package.json` 實際安裝為準。

---

## 一、創作主題

### 1. 題目

**可信景點資料庫與即時韌性應變旅遊系統（Navigator 領航者）**

Navigator 不是又一套「幫你排行程」的旅遊 App，而是一個**以多來源交叉驗證的可信景點資料庫為地基、能在突發狀況下提供可靠應變計畫的系統**，並以 Plug-in 服務形式，可被任何旅遊平台串接。它針對旅遊規劃的兩個真實痛點：

1. **網路景點資訊真假難辨**：部落格、社群、地圖上的資訊彼此衝突、品質不一，使用者難以判斷可信度；直接問一般 LLM 更容易得到「幻覺景點」（推薦根本不存在或已歇業的地點）。
2. **行程缺乏應變邏輯**：遇到天氣、景點臨時關閉等突發狀況時，一般工具只給靜態行程表，沒有系統化的備案思路，使用者只能臨場慌亂重排。

### 2. 實用功能描述

系統資料流為「外部資料來源 → 景點驗證系統 → 可信知識庫 → AI 應變推薦系統 → 使用者介面」，目前提供：

- **景點可信度驗證（已實作，`agents/poi-verifier`）**：驗證代理並行查詢 TDX 觀光 API、Google Places、OpenStreetMap、官方網站、部落格（Serper／DuckDuckGo）、PTT、YouTube 等多種來源，確認存在性並依「來源層級 × 時間衰減」計算信任分數；來源說法衝突時，`conflict-resolver.ts` 能依權威層級或時效自動澄清就澄清，不能澄清則**多版本並存並標記 `is_conflicted`**。驗證後景點依 L0–L3 韌性分級寫入 Supabase `poi_catalog`，並以 Gemini Embedding 建立 768 維 pgvector 語意索引。
- **可信度與資料分歧透明呈現（已實作，`src/app/(app)/explore`）**：驗證景點庫逐筆顯示信任分數與通過來源；有衝突的景點標「資料分歧」徽章，詳情面板逐欄位列出各來源版本、來源層級與採用理由——不把系統的「最佳猜測」偽裝成唯一真相。此頁已接上 `/api/poi/search` 真實檢索。
- **語意搜尋（已實作，`/api/poi/search`）**：使用者以自然語言（如「下雨天想找室內景點」）查詢，系統以 RAG 混合檢索（語意向量 ＋ 關鍵字二元組 RRF 融合 ＋ 兩階段重排）回傳排序結果與理由，Token 成本經漏斗式檢索壓在低檔。
- **從驗證庫選點組成行程（已實作，FFR13）**：使用者於驗證景點庫瀏覽時可將景點加入行程，系統以純規則排序（區域分群＋最近鄰＋依停留時間切天，`src/lib/draft-itinerary.ts`）組成逐日行程，作為後續應變的作用對象；行程頁以 `react-map-gl`／Mapbox 繪出當日路線與編號圖釘。
- **即時天氣應變建議（後端已實作並接通前端，`agents/contingency-handler` ＋ `/api/contingency`）**：應變代理以中央氣象署即時降雨機率偵測事件，以期望值模型判斷是否值得應變，從知識庫撈出同區備案，經**反思審查**逐筆淘汰不合格候選，最後由 LLM 把已決定的方案寫成建議文字。前端 `trip/[id]/weather` 頁面完整實作「天氣橫幅 → Bottom Sheet 呈現 Swap 建議 → 使用者接受／保留」的操作流程，並已去除 mock、改打真實 API。

### 3. 作品與市場相關產品差異

| 面向 | 市面常見旅遊規劃／推薦服務 | Navigator |
|---|---|---|
| 景點資料來源 | 單一來源（官方評論網站或使用者上傳），少做交叉查證 | 多種來源交叉驗證，明確標示信任分數與來源組成（`explore` 頁逐筆可見） |
| 資料衝突處理 | 通常隱藏衝突，強迫呈現單一「正確答案」 | 能澄清就澄清（依來源權威度／時效），不能澄清則**多版本並存**，詳情面板列出每個衝突欄位的所有來源版本與層級標籤 |
| 行程臨時異動 | 多數僅提供靜態行程表，異動需使用者自行重新規劃 | 內建 L0–L3 景點韌性分級與 Swap／Switch 決策樹，應變代理主動依天氣產生建議並附信度標示 |
| AI 使用方式 | 常見「LLM 直接生成整份行程」，資料來源不透明，易產生幻覺景點 | **LLM 不做決策**：要不要換由期望值公式決定、換成哪裡由檢索與反思審查決定，LLM 只把已驗證的結論寫成人話；不存在的景點在驗證階段就被截斷（`exists: false`），不會進入生成流程 |
| 幻覺防禦 | 幾乎沒有；生成後不再檢查 | **生成後反思迴路**：LLM 建議輸出前對照封閉候選集自檢（幻覺景點／已淘汰景點／格式），不合格帶理由重生成，用盡次數退規則保底 |

---

## 二、創意構想

### 1. 理論基礎

- **孔祥重（H.T. Kung）五階段方法論**：作為系統設計骨幹——① 聚焦真痛點 → ② 先釐清人的決策流程再導入 AI → ③ 用 LLM 快速生成大量候選 → ④ 保留人對結果的否決權與脈絡調整 → ⑤ AI 逐步學習使用者偏好。此方法論貫穿「景點驗證 → 選點組程 → 應變建議」的設計順序：AI 負責大量生成與檢索，最終決定權與脈絡判斷保留給人與規則。
- **資訊品質與來源可信度理論**：`conflict-resolver.ts` 將來源分為 official／semi_official／blog_travel／user_feedback 四個權威層級（`TIER_RANK`），並以 `time_decay = e^(-days / halfLife)` 做時間衰減，是「來源可信度隨時間與權威度衰減」的具體工程實作。
- **多準則決策分析（MCDA）與期望值模型**：`agents/contingency-handler/src/evaluators/` 的 `expected-value-calculator.ts` 依事件類型動態調整評分權重，並以期望值 `EV = P_晴 × L + P_雨 × (L × α)` 判斷是否值得應變，屬決策理論中情境感知效用函數的直接應用。
- **漏斗式檢索與 RAG 混合搜尋**：`hybrid-search.ts`（結構化過濾 + pgvector 語意檢索 + 關鍵字二元組 RRF 融合）與 `rag-reranker.ts`（結構加權 + LLM 交叉評分）對應資訊檢索領域「粗篩 → 精排」兩階段檢索理論，同時是控制 LLM Token 成本的工程手段。
- **Agentic AI 的 Reflection（反思）與 Loop（迴路）**：本系統把「生成後自我檢查、不合格再生成」的反思迴路落地在應變敘述生成上（`narrative-checker.ts`），呼應近期 Agentic 架構對「Evaluation & Reflection」「Loop Engineering」的強調。

### 2. 設計創新說明

- **L0–L3 景點韌性分級**：量化「這個景點在應變時可以被動到什麼程度」——L0 絕對錨點（禁止自動替換，如已預訂餐廳）、L1 彈性錨點（可平移時段）、L2 條件變動（天氣一變優先被 Swap）、L3 水位調節（最先被跳過）。此分級同時寫入資料庫 metadata、驅動 RAG 重排的 structural boost，也是應變代理篩選候選池的硬性條件。
- **「能澄清就澄清、不能澄清則多版本並存」的透明衝突處理**：`conflict-resolver.ts` 先判定「來源權威層級差距」或「同層級但時效差距」是否足以自動澄清；兩者皆不成立時不強迫產出單一答案，保留所有版本並標記 `is_conflicted`，前端逐欄位呈現，讓可信度成為可見的價值而非隱藏的內部機制。
- **反思迴路（Reflection Loop）——本系統的 Agentic 亮點**：應變建議分「生成前」與「生成後」兩段自檢。生成前（`strict-checker.ts`）以規則過濾候選池（歇業／打烊／資訊過期／評分過低／人潮爆滿／戶外遇雨／L0 錨點）；生成後（`narrative-checker.ts`）在 LLM 輸出前對照封閉候選集逐項檢查（是否提及幻覺景點、是否引用已被淘汰的候選、格式是否合規），不合格則把理由回填 prompt 重生成，用盡次數退回規則保底文字。**因為 LLM 在本系統只負責表述、不做決策，要防的正是表述層的幻覺**，反思迴路正是這道最後防線。
- **規則引擎對 LLM 具覆蓋權**：L0–L3 分級等關鍵判定由規則引擎決定即為最終結果，LLM 的建議不同意也不能改（`enrichers/index.ts`）；每個 LLM 呼叫都被程式框架包裹（schema 驗證、重試、防截斷），是 Harness Engineering 的具體落地。
- **Swap／Switch 雙軌應變決策樹**：規則先做非黑即白的淘汰，再交給多準則評分排序，最後才由 LLM 把決策寫成使用者看得懂的建議文字——LLM 做「翻譯」不做「決策」。

### 3. 特殊功能描述

- **多來源信任評分引擎**：多種驗證器並行查詢，任一景點被回報「永久歇業」時立即終止流程回傳 `exists: false`，不浪費 LLM token 在不存在的景點上。
- **衝突可視化 UI**：`explore` 頁直接呈現多來源衝突景點，詳情面板逐欄位列出各來源版本、層級與採用理由（`clarified_by_tier`／`clarified_by_recency`／`coexist`）。
- **應變建議附信度與影響評估**：`weather` 頁的替換建議卡片並列「原景點（受影響原因）→ 替代景點（室內、韌性等級）」，提供「接受替換」／「保留原景點」兩種決定，使用者永遠保留最終決定權；回應帶反思審查軌跡（第幾次生成通過），可對使用者呈現。
- **成本可控的事件驅動 Agentic 架構**：兩個核心 Agent（POI Verifier、Contingency Handler）皆可獨立以 CLI 執行、不需啟動 Next.js server，也可包成 Route Handler 對外提供服務（Plug-in 接口），具備串接真實資料庫與各大旅遊平台的能力。

---

## 三、系統架構

### 1. 架構說明

系統以三層架構定位（資料層 / 推理層 / LLM 層），資料流向為：**外部資料來源 → 景點驗證系統 → 可信知識庫 → AI 應變推薦系統 → 使用者介面**，並有使用者回饋回流形成資料閉環。

**① 外部資料來源（資料層）**：TDX 觀光 API、官方網站（官方層）；Google Places、OpenStreetMap（半官方層）；部落格搜尋（Serper／DuckDuckGo）、PTT、YouTube（社群層）；中央氣象署 CWA（即時降雨機率）。

**② 景點驗證系統（資料層，POI Verifier Agent，`agents/poi-verifier/src/agent.ts`）**：五步驟流水線——資料清理標準化 → 多來源交叉驗證（`validators/`）→ 衝突解析（`conflict-resolver.ts`，澄清或並存）→ 信任評分與時間衰減 → L0–L3 分級與 RAG 語意描述生成（`enrichers/`）。以程式框架驅動（Harness），非人工疊 Prompt。

**③ 可信景點知識庫（資料層）**：驗證後資料寫入 Supabase（PostgreSQL），結構化欄位與 JSONB metadata 並存；文字描述經 Gemini Embedding 生成 768 維向量存入 `poi_catalog` 並建立 pgvector 索引；查詢透過 `hybrid_search_poi_catalog` RPC 同時做結構化過濾與語意向量搜尋（語意 ＋ 關鍵字 RRF 融合）。每筆景點帶信任分數、來源出處、衝突標記與韌性等級。

**④ AI 應變推薦系統（推理層 ＋ LLM 層）**：
- **規劃排序（`src/lib/draft-itinerary.ts`）**：依使用者自驗證庫選定的景點，以純規則排序（區域分群＋最近鄰＋依停留時間切天）組成逐日行程骨架。此步驟**不呼叫 LLM**，屬確定性演算法，作為應變的作用對象。
- **Contingency Handler Agent（`agents/contingency-handler/src/agent.ts`，系統唯一的 LLM-driven agent）**：事件偵測（CWA 真實降雨）→ 期望值推理（`EV = P_晴 × L + P_雨 × (L × α)`，分數落差超門檻才觸發）→ RAG 檢索備案（從知識庫撈同區候選）→ **反思審查**（`strict-checker.ts` 生成前規則淘汰 ＋ `narrative-checker.ts` 生成後敘述自檢，不合格帶理由重生成）→ LLM 僅將通過審查的方案寫成自然語言（Gemini Flash 主力、Claude Haiku 備援）。
- **關鍵主張**：LLM 不做決策。要不要應變由期望值公式決定、換成哪裡由檢索與反思審查決定，LLM 只負責把結論說得通順，從源頭抑制幻覺。

**⑤ 使用者介面（三個重點視圖）**：景點驗證與證據檢視（信任分數、來源分歧透明呈現）、應變建議檢視（Swap 對照、理由、信度）、風險地圖情境視圖（受影響景點、替代路線）。以 Next.js（App Router）建構，桌面與行動裝置並重。

**Plug-in 定位**：系統的價值出口是 Plug-in API——旅遊平台串接「可信景點檢索」與「應變建議」端點即可為自家用戶加值，而非做獨立 App 下載競賽。`/api/poi/search`、`/api/contingency` 兩個 Route Handler 即為此接口。

**技術層面（依 `package.json` 實際版本）**：前端 Next.js 16（App Router）+ React 19 + TypeScript + TailwindCSS v4 + shadcn/ui + Radix；狀態管理以 TanStack Query 5 處理伺服器狀態、Zustand 5 處理純前端狀態；互動動畫用 Framer Motion 12；拖拉排序用 `@dnd-kit`；地圖用 `mapbox-gl`／`react-map-gl`。後端以 Supabase（PostgreSQL + pgvector）為知識庫，Next.js Route Handlers 作為 BFF 層（API 金鑰僅存伺服器端）；AI 主力為 Gemini 2.5／1.5 Flash，Claude Haiku 為結構化輸出備援。

> **[圖 1：系統架構圖]** 見 `系統架構圖_競賽版.md` 之 Mermaid 主線架構圖（三層著色：綠＝資料層／琥珀＝推理層／藍＝LLM 層／紫＝介面／紅框＝反思審查），已另出 PDF（`Navigator_競賽版架構圖_0720.pdf`）。

### 2. 人機介面（UI）與使用者體驗（UX）設計

**行動與桌面並重**：`(app)/layout.tsx` 同時掛載 `AppSidebar`（桌面）與 `BottomNav`（行動裝置，`md:hidden`），行動版為主體驗。

- **底部導覽（Bottom Tab）**：五個入口——行程／探索／地圖／收藏／設定，tap target 最小高度 56px，符合單手操作。
- **衝突透明化詳情面板**：`explore/page.tsx` 的 `DetailSheet` 以滑入面板呈現可信度評分、通過來源徽章、以及（若有衝突）每個欄位的多來源版本與層級標籤。
- **從驗證庫選點組成行程**：使用者於驗證庫將景點加入行程（FFR13），系統即時排出逐日路線，行程頁「地圖」分頁以 `DayRouteMap` 元件畫出當日真實 Mapbox 路線（依序編號圖釘＋連線）。
- **天氣應變的 Bottom Sheet 流程**：`weather/page.tsx` 以 Bottom Sheet 先提示降雨機率與受影響景點數，點開後逐一並列「原景點（受影響原因）→ 替代景點（室內、韌性等級）」，並提供「接受替換」／「保留原景點」多層次選項，避免使用者被迫接受單一 AI 決定。
- **視覺風格**：全站延續深森林綠主題（`#1B4332`／`#52B788`），L0–L3 各級距以固定色碼呈現於卡片徽章，跨頁面保持一致的視覺語彙，降低重新學習成本。

---

## 四、計劃管理

> ⚠️ **本節工作內容依 `DEVLOG.md`／`CLAUDE.md` §9 現況草擬，起訖日期為佔位（待團隊依實際繳交截止日與 demo 日填入）。** 送件前請以真實日期取代下方 W1–W8 週次與起始日欄。

| 工作階段 | 工作內容 |
|---|---|
| 階段 1：資料涵蓋範圍拍板與 TDX 正式匯入 | 決議 TDX 匯入規模（縣市／類別／筆數），執行正式入庫，回填 `poi_catalog` 新欄位；先修 ingestion signals 缺欄（category／images／website_url）。 |
| 階段 2：知識庫端到端驗證 | 於已套用的 migration 009 上驗證 explore 與應變候選池，確認混合檢索回傳事實欄位正確、衝突呈現無誤。 |
| 階段 3：應變候選池切換真實 RPC | `/api/contingency` 由靜態候選改走 Supabase RPC 真檢索，確認反思迴路在真實資料上運作。 |
| 階段 4：天氣應變 Demo 情境打磨 | 完成一個完整的天氣應變 demo（含反思審查軌跡呈現），端到端可展示。 |
| 階段 5：整合測試與成本量測 | 端到端測試主線（驗證 → 選點成程 → 天氣應變），量測單次檢索 Token 成本並記錄。 |
| 階段 6：簡報、成果影片與送件文件定稿 | 完成簡報、demo 影片、企劃書／系統需求書定稿，通過全程匿名與生成式 AI 揭露檢查。 |

| 週次 | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 |
|---|---|---|---|---|---|---|---|---|
| 起始日期（待填） | | | | | | | | |
| 階段 1 | ■ | ■ | | | | | | |
| 階段 2 | | ■ | ■ | | | | | |
| 階段 3 | | | ■ | ■ | | | | |
| 階段 4 | | | | ■ | ■ | | | |
| 階段 5 | | | | | ■ | ■ | | |
| 階段 6 | | | | | | ■ | ■ | ■ |

---

## 五、修改舊作參賽說明

☑ 本專案開發之作品未使用團隊成員曾獲競賽獎勵之作品。
☐ 本專案開發之作品採用團隊成員曾獲競賽獎勵之作品，至少應有 50% 差異，請說明（參考切結書第十點之規定）。

---

## 六、軟體清單

**1. 作業系統環境**

☑ Windows　☐ FreeBSD　☐ Linux
☐ MacOSX　☐ MacOS Classic　☐ 其他 _______________

> 本機開發環境為 Windows；正式部署雲端服務（Vercel／Supabase）底層為 Linux 容器，如需一併呈現可補勾 Linux。

**2. 主要開發程式語言**

☐ Assembly　☐ C　☐ C++　☐ Java　☐ Perl
☐ PHP　☐ Python　☐ Ruby　☐ .NET　☑ 其他：**TypeScript / JavaScript（Node.js）**

> 補充：`blog-search.ts` 有透過 subprocess 呼叫 Python（`ddgs` 套件）做部落格搜尋，屬輔助腳本，非主力語言。

**3. 專案支援語言（可複選）**

☑ 中文　☐ 英文　☐ 其他 _______________

> 全站 UI 文字皆為繁體中文。

**4. 開發環境／使用之框架與函式庫**

(1) Next.js 16（App Router）／React 19 — 前端框架與 BFF
(2) Supabase（PostgreSQL + pgvector）— 後端知識庫與混合檢索
(3) Google Gemini API（2.5／1.5 Flash，含 Embedding）— AI 驗證、向量化與生成
(4) Google Places API／OpenStreetMap Nominatim — 景點資料驗證來源
(5) TDX 觀光資料開放平臺 API — 官方景點資料匯入
(6) 中央氣象署開放資料 API — 天氣應變偵測

**5. 專案成果預定授權條款**

本專案成果授權條款**待團隊決定後補上**（暫不宣告；`README.md` 目前狀態一致，標示 license 待補）。

---

## 七、權力分配

☑ 依著作權法第 40 條之規定，由參賽學生與指導教授均等共有。
☐ 其他比例分配表，請說明。

---

## 附錄：比賽規則遵循檢查（全程匿名／生成式 AI 揭露）

### A. 全程匿名檢查

- 已掃描本文件（一～七）全文，未發現學校名稱、系所名稱、教授姓名或其他可直接辨識參賽者身分的文字。「指導教授」一詞僅在「七、權力分配」的官方範本條文中以角色稱呼出現，未搭配任何姓名。
- ⚠️ **送件前請團隊自行複查本文件範圍外的素材**：簡報 PPT 頁尾／浮水印、demo 影片口白與畫面截圖（瀏覽器分頁標題、帳號名稱）、repo 內部文件（`CLAUDE.md`／`README.md`／`prototypes/ui-demo/README.md` 等）若被引用或入鏡，常見疏漏是帶到系所或姓名，這些需人工過一遍。

### B. 生成式 AI 揭露

**B-1／作品本身內建的生成式 AI**

| 用途 | 模型 | 對應程式碼 |
|---|---|---|
| 景點事實萃取、L0–L3 等級分類、備案邏輯生成、旅客友善描述生成 | Google Gemini 2.5 Flash（主力）／Anthropic Claude Haiku（備援） | `agents/poi-verifier/src/enrichers/` |
| 景點語意向量嵌入（供 pgvector 檢索） | Google Gemini Embedding（`gemini-embedding-001`，768 維） | `agents/poi-verifier`（ingestion 相關腳本） |
| RAG 兩階段重排的交叉評分 | Google Gemini | `agents/poi-verifier/rag-reranker.ts` |
| 應變建議（Swap／Switch）的自然語言生成與反思迴路 | Google Gemini（主力）／Anthropic Claude Haiku（備援） | `agents/contingency-handler/src/generators/`、`evaluators/narrative-checker.ts` |

**B-2／撰寫文件過程使用的生成式 AI**：本企劃書與系統需求書之整理、對照原始碼校對，使用 Claude（Anthropic）輔助撰寫。是否需列入揭露、揭露到何種程度，請團隊依簡章對「作品」範圍的認定與承辦單位說明後定稿。

### C. 技術合作單位或經費補助

目前程式碼與文件中未見任何合作單位或補助紀錄——TDX、中央氣象署為政府開放資料 API，Google Gemini／Places、Anthropic 為按用量付費 API，不構成贊助或技術合作。如團隊實際有學校補助、企業贊助、API 額度贊助或技術合作，請據實補填。

---

*本文件依 repo 原始碼現況（2026-07-21）與 `系統架構圖_競賽版.md` 對外敘事撰寫，已依 0716 減法決策收斂主線（多人規劃相關功能不入敘事）。「四、計劃管理」的日期為佔位待填，「六」授權條款待團隊決定，附錄匿名與 AI 揭露有數處待團隊確認，均已於文中標示。*
