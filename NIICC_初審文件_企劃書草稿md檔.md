# NIICC 初審文件 — 企劃書草稿

> 作品名稱：旅遊景點驗證＋應變規劃系統
> 作品英文名稱：Navigator（領航者）
> 本草稿依「直接讀原始碼」重新核對後撰寫：架構敘述以 `系統架構圖_0709.md` 為主要依據，功能與 UI/UX 描述則逐一核對 `agents/poi-verifier`、`agents/contingency-handler`、`src/app` 下實際程式碼，不採信 `CLAUDE.md`／`PROJECT_BRIEF.md` 中可能過時的敘述（例如：實際前端框架為 Next.js 16 + React 19，並非文件中寫的 Next.js 14；底部導覽實際五個分頁是「行程／探索／地圖／收藏／設定」，並非文件中寫的「首頁／發現／規劃中／我的／帳號」）。

> **標記說明**：內文中標示 `〔補充｜架構圖未列〕` 的段落，代表該內容雖然屬實（來自程式碼或其他專案文件），但**未被 `系統架構圖_0709.md` 明確列出**——架構圖只畫到模組／步驟名稱這個顆粒度（例如「衝突解析」「投票系統」「使用者 User」），沒有畫出演算法細節、UI 互動設計、技術版本或成本數字。若初審委員只核對架構圖與企劃書的一致性，這些標記處是需要額外口頭補充、或者考慮要不要先畫進架構圖裡的地方。未標記的內容則可在架構圖五大區塊中找到對應敘述。

> ⚠️ **本草稿早於 2026-07-16 減法拍板，內容已過時，勿直接沿用。** 本文件以「多人共識收斂」為兩翼之一（見下方第一節），並多處描述滑卡投票（`trip/[id]/vote`）、投票結果排序（`trip/[id]/results`）、行程房間（`group/new`／`group/[id]/join`）為現行核心功能——這些模組已於 0716 移出競賽敘事範圍（程式碼保留、停止開發），見 `0716_減法決策與不做清單.md`、`CLAUDE.md` §1/§7/§7.5。**另外，文中「Architect Agent」一詞也已停用**：它不是 LLM agent，`src/lib/draft-itinerary.ts`（文中已正確指出的「前端簡化版」）是純規則排序，沒有計畫接上 LLM 或候選池檢索；最新對外敘事版本見 `系統架構圖_競賽版.md`。若要把本草稿修訂為正式提交版本，需整段依 0716 決策改寫，不只是替換用詞。

---

## 一、創作主題

### 1. 題目

**旅遊景點驗證＋應變規劃系統（Navigator 領航者）**

一套以「可信景點資料庫」為地基、以「多人共識收斂」與「即時應變排程」為兩翼的智能旅遊規劃系統。

### 2. 實用功能描述

依 `系統架構圖_0709.md` 的五段資料流（外部資料來源 → 景點驗證系統 → 知識資料庫 → AI 應變推薦系統 → 使用者介面）與程式碼實作現況，Navigator 目前提供：

- **景點可信度驗證（已實作，`agents/poi-verifier`）**：驗證代理並行查詢 TDX 觀光 API、Google Places、OpenStreetMap、官方網站、部落格（DuckDuckGo／Serper）、PTT、YouTube 七種來源 ── 與架構圖①一致。依「來源層級 × 時間衰減」公式計算 `reliability_score`（clamp 至 0–1）；來源說法衝突時，`conflict-resolver.ts` 先嘗試依權威層級差距或時間新舊差距自動澄清，無法澄清則保留全部版本並標記 `is_conflicted: true`，交由前端呈現 `〔補充｜架構圖未列：架構圖②僅寫「衝突解析」，未畫出澄清／並存兩條路徑的判定邏輯〕`。驗證後景點依 L0–L3 韌性分級寫入 Supabase `poi_catalog`，並以 Gemini Embedding 建立 pgvector 語意索引 ── 對應架構圖②⑤步驟。
- **多人滑卡與否決投票收斂（前端互動已實作，`src/app/(app)/trip/[id]/vote`）**：以 Framer Motion 手勢滑卡呈現候選景點，四個方向對應四種投票——右滑喜歡（+1，無配額上限）、左滑略過、上滑必去（+5，配額 2 張）、下滑否決（VETO，配額 1 張，直接淘汰不計加權分）；投票完成後於 `trip/[id]/results` 排出結果 `〔補充｜架構圖未列：架構圖⑤只寫「投票系統 Voting」這個模組名稱，沒有畫出 Token 配額／VETO 硬淘汰的規則〕`。**2026-07-11 更新**：結果頁新增「生成草稿行程」功能（`src/lib/draft-itinerary.ts`，程式碼註解明確標示為「Architect Agent 的前端簡化版」）——依投票分數自適應門檻篩出候選景點，按區域分群、以最近鄰演算法排出單日路線、依停留時間切天，存入 localStorage 後導向行程頁顯示，行程頁「地圖」分頁並以 `react-map-gl`／Mapbox 即時繪出當日路線與編號圖釘（`src/components/day-route-map.tsx`）。這是一條**尚未接上後端 RAG／hybrid-search 的暫代路徑**，用來讓 demo 流程先能跑通。
- **即時應變建議（後端邏輯已實作，`agents/contingency-handler`；前端目前為互動原型）**：應變代理內建天氣／景點狀態／交通／群體疲勞四種偵測器，先以嚴格規則篩選（`strict-checker.ts`）淘汰不合格候選 `〔補充｜架構圖未列：架構圖④只到「候選景點排序」，沒有畫出前面這一段硬性規則篩選子步驟〕`，再用動態加權的多準則評分排序，並以期望值模型（`expected-value-calculator.ts`）判斷是否值得應變 ── 對應架構圖④「期望效益評估」，最後由 LLM 把決策寫成建議文字。前端 `trip/[id]/weather` 頁面已完整實作「天氣橫幅 → Bottom Sheet 呈現同級替換建議 → 使用者接受／保留」的操作流程 `〔補充｜架構圖未列：屬 UI 互動設計，架構圖⑤只寫「天氣資訊 Weather」〕`，目前串接的是情境模擬資料，與應變代理的即時串接正在進行中。
- **RAG 混合搜尋（後端已實作，尚未接前端頁面）**：`agents/poi-verifier/hybrid-search.ts` 與 `rag-reranker.ts` 提供「關鍵字二元組 + pgvector 語意向量」RRF 融合搜尋，並有兩階段重排（結構加權 + Gemini 交叉評分）`〔補充｜架構圖未列：架構圖③只寫「Hybrid Search RPC：結構化＋語意搜尋」，沒有畫出二元組關鍵字 RRF 融合與兩階段重排的細節〕`；`src/app/api/poi/search/route.ts` 已將此邏輯包成 Route Handler 對外提供服務，但目前尚無前端頁面呼叫它。

### 3. 作品與市場相關產品差異

| 面向 | 市面常見旅遊規劃／推薦服務 | Navigator |
|---|---|---|
| 景點資料來源 | 單一來源（官方評論網站或使用者上傳），少做交叉查證 | 七種來源交叉驗證，明確標示信任分數與來源組成（`explore` 頁面逐筆可見） |
| 資料衝突處理 | 通常隱藏衝突，強迫呈現單一「正確答案」 | 能澄清就澄清（依來源權威度／時間新舊判定），不能澄清則**多版本並存**，`explore` 頁面的景點詳情會列出每個衝突欄位的所有來源版本與各自的層級標籤 |
| 多人決策 | 純投票／按讚機制，容易出現「禮貌性附和」 | Token 投票制，**否決票是硬性淘汰（score = −∞），不是加權負分**，程式碼中 `calcScore()` 明確將 veto 排除在排序之外 `〔補充｜架構圖未列〕` |
| 行程臨時異動 | 多數僅提供靜態行程表，異動需使用者自行重新規劃 | 內建 L0–L3 景點韌性分級（架構圖②）與 Swap／Switch 決策樹（架構圖④），應變代理主動依天氣／營運狀態產生建議並附信度標示 `〔信度標示為補充｜架構圖未列〕` |
| AI 使用方式 | 常見「LLM 直接生成整份行程」，資料來源不透明，易產生幻覈景點 | 漏斗式檢索先鎖定「已驗證」候選池，LLM 只在有真實資料時才生成文字；不存在的景點在驗證階段就被截斷（`exists: false`），不會進入生成流程 `〔補充｜架構圖未列：架構圖沒有畫出「不存在景點提前截斷」這個防禦分支〕` |

---

## 二、創意構想

### 1. 理論基礎

- **孔祥重（H.T. Kung）五階段方法論** `〔補充｜架構圖未列：架構圖完全沒有出現這套方法論，僅見於 CLAUDE.md〕`：作為系統設計骨幹——① 聚焦真痛點 → ② 先釐清人的決策流程再導入 AI → ③ 用 LLM 快速生成大量候選 → ④ 保留人對結果的否決權與脈絡調整 → ⑤ AI 逐步學習使用者偏好。此方法論貫穿「景點驗證 → 投票收斂 → 應變建議」的設計順序。
- **資訊品質與來源可信度理論**：`agents/poi-verifier/src/conflict-resolver.ts` 將來源分為 official／semi_official／blog_travel／user_feedback 四個權威層級（`TIER_RANK`），並以 `time_decay = e^(-days / halfLife)` 做時間衰減，是「來源可信度隨時間與權威度衰減」的具體工程實作 `〔補充｜架構圖未列：架構圖②只寫「信任評分與可靠度評估」，沒有畫出四層級與半衰期公式〕`。
- **多準則決策分析（MCDA）與期望值模型**：`agents/contingency-handler/src/evaluators/` 下的 `expected-value-calculator.ts` 與 `contingency-plan-generator.ts` 依事件類型動態調整評分權重向量 `〔補充｜架構圖未列：架構圖④有畫「期望效益評估」與「候選景點排序」兩個步驟名稱，但沒有畫出權重動態調整的機制〕`，屬決策理論中情境感知效用函數的直接應用。
- **漏斗式檢索與 RAG 混合搜尋**：`hybrid-search.ts`（結構化過濾 + pgvector 語意檢索 + 關鍵字二元組 RRF 融合）與 `rag-reranker.ts`（結構加權 40% + LLM 交叉評分 60%）對應資訊檢索領域「粗篩 → 精排」兩階段檢索理論 `〔補充｜架構圖未列：架構圖③④只寫「Hybrid Search RPC」與「混合檢索引擎」，「漏斗式」定名與兩階段重排比例是本文件的補充說明〕`，同時是控制 LLM Token 成本的工程手段（單筆驗證成本約 NT$0.01 `〔補充｜架構圖未列，成本數字不在架構圖中〕`）。

### 2. 設計創新說明

- **L0–L3 景點韌性分級**（架構圖②明列「L0–L3 分級」）：量化「這個景點在應變時可以被動到什麼程度」——L0 絕對錨點（禁止自動替換）、L1 彈性錨點（可平移時段）、L2 條件變動（天氣一變優先被 Swap）、L3 水位調節（最先被跳過）。這個分級同時寫入資料庫 metadata、驅動 RAG 重排的 `structural_boost` `〔補充｜架構圖未列：架構圖沒有畫出 structural_boost 這個重排機制〕`，也是應變代理篩選候選池的硬性條件。
- **「能澄清就澄清、不能澄清則多版本並存」的透明衝突處理機制** `〔補充｜架構圖未列：架構圖②的「衝突解析」只是一個步驟框，沒有畫出澄清／並存的判定條件與 is_conflicted 標記〕`：`conflict-resolver.ts` 先判定「來源權威層級差距（≥1 級）」或「同層級但時間差距 > 30 天」是否足以自動澄清；兩者皆不成立時不強迫產出單一答案，保留所有版本並標記 `is_conflicted: true`，前端 `explore` 頁面的詳情頁會列出每個版本的來源、層級與內容，讓使用者自行判斷。
- **Token 投票制取代單純按讚** `〔補充｜架構圖未列：架構圖⑤只有「投票系統 Voting」一個方塊，沒有畫出配額制或 VETO 規則〕`：固定配額（1 否決票＋2 必去票＋無限喜歡票）逼迫成員在「真的很想去」與「單純不反對」之間做出區分，`trip/[id]/vote` 頁面以四方向滑動手勢對應四種投票，配額歸零後對應按鈕自動停用。
- **Swap／Switch 雙軌應變決策樹**（架構圖④明列「替換／切換決策」）：規則引擎（`strict-checker.ts`）先做非黑即白的淘汰（人潮爆滿、即將打烊、永久歇業、資訊過期、評分過低、戶外遇雨）`〔補充｜架構圖未列：架構圖沒有畫出這一段規則淘汰子步驟〕`，再交給多準則評分排序，最後才由 LLM 把決策寫成使用者看得懂的建議文字——LLM 不做決策，只做「翻譯」。

### 3. 特殊功能描述

> 以下四點皆為程式碼實作細節，`系統架構圖_0709.md` 僅畫到「衝突解析」「信任評分」「替換／切換決策」等步驟名稱，並未畫出這些具體行為，故整節標記為 `〔補充｜架構圖未列〕`。

- **多來源信任評分引擎**：七種驗證器並行查詢，任一景點在 Google Maps 回傳「永久歇業」時立即終止流程並回傳 `exists: false`，不浪費 LLM token 在不存在的景點上。
- **衝突可視化 UI**：`explore` 頁面（`src/app/(app)/explore/page.tsx`）直接呈現多來源衝突的景點，卡片上有「資料分歧」徽章，詳情頁逐欄位列出各來源版本、來源層級與採用理由（`clarified_by_tier` / `clarified_by_recency` / `coexist`），而非只顯示系統挑的「最佳猜測」——此為 UI 層設計，架構圖⑤僅列「Explore」模組名稱。
- **應變建議附信度與影響評估**：`trip/[id]/weather` 頁面的替換建議卡片並列呈現原景點（受天氣影響原因）與替代景點（室內、韌性等級），並提供「接受替換」／「保留原景點」兩種決定，使用者永遠保留最終決定權——此為 UI 層設計，架構圖⑤僅列「Weather」模組名稱。
- **成本可控的 Agentic 架構**：兩個事件驅動核心 Agent（POI Verifier、Contingency Handler）皆可獨立以 CLI 執行、不需啟動 Next.js server；`contingency-handler` 另有 `poi-catalog-client.ts` 可直接查詢正式 Supabase `poi_catalog`，具備串接真實資料庫的能力——「從 10 個 Agent 縮編為 2 個」的架構演進史與 CLI 可獨立執行的說明，架構圖中沒有出現，只畫出目前這兩個 Agent 各自的內部步驟。

---

## 三、系統架構

### 1. 架構說明

依 `系統架構圖_0709.md`，資料流向為：**外部資料來源 → 景點驗證系統 → 知識資料庫 → AI 應變推薦系統 → 使用者介面**，並有**使用者回饋／投票／評價**回流至外部資料來源層，形成資料閉環。

**① 外部資料來源**：TDX 觀光 API、Google Places、OpenStreetMap、官方網站、PTT、YouTube、部落格搜尋（Serper／DuckDuckGo）。

**② 景點驗證系統（POI Verifier Agent，`agents/poi-verifier/src/agent.ts`）**：五步驟流水線——資料清理與標準化 → 多來源交叉驗證（`validators/`）→ 衝突解析（`conflict-resolver.ts`，澄清或並存）→ 信任評分與可靠度評估 → L0–L3 分級與 RAG 語意描述生成（`enrichers/`）。輸出為驗證完成的景點資料。

**③ 知識資料庫**：驗證後資料寫入 Supabase（PostgreSQL），結構化欄位與 JSONB metadata 並存；文字描述經 Gemini Embedding API 生成向量，存入 `poi_catalog` 並建立 pgvector（ivfflat）索引；查詢時透過 Hybrid Search RPC 同時做結構化 SQL 過濾與語意向量搜尋（`hybrid-search.ts`）。

**④ AI 應變推薦系統**：
- **Architect Agent（規劃代理）**：使用者需求 → 混合檢索引擎（SQL 結構化搜尋 ＋ pgvector 語意搜尋）→ 產出行程建議與排序。此檢索邏輯已在 `src/lib/poi-search.ts` 與 `/api/poi/search` Route Handler 中實作完成，但前端頁面尚未呼叫這條後端路徑；`trip/[id]/results` 目前接的是 `src/lib/draft-itinerary.ts` 這個**純前端的簡化版**（程式碼註解自稱「Architect Agent 的前端簡化版」）——依區域分群＋最近鄰排序＋時間切天，完全不查詢 `poi_catalog` 或呼叫 LLM，屬於暫代 demo 用途，之後要換成真正呼叫上述 Route Handler。`〔補充｜架構圖未列：架構圖只畫了一條 Architect Agent 路徑，沒有畫出這條前端暫代路徑〕`
- **Contingency Handler Agent（`agents/contingency-handler/src/agent.ts`）**：天氣偵測、景點營運狀態檢查、交通狀況偵測、群體疲勞偵測（`detectors/`）→ 嚴格規則篩選（`evaluators/strict-checker.ts`）→ 期望效益評估（`evaluators/expected-value-calculator.ts`）→ 候選景點多準則排序 → 替換／切換決策 → LLM 生成建議文字（`generators/llm-client.ts`，Gemini 主力、Claude Haiku 備援）。
- 兩者匯流輸出「最佳行程與應變建議」。

**⑤ 使用者介面**：Next.js（App Router）Web Application，桌面與行動裝置並重。架構圖列出的模組是 Dashboard／Explore／Map／Weather／Voting／AI Trip Planner／User 七項，實際路由與其大致對應，但多出幾個架構圖未命名的頁面 `〔補充｜架構圖未列：collection（收藏）、settings（設定，架構圖以「User」概括）、group/new 與 group/[id]/join（建立／加入行程房間）、trip/[id]/results（投票結果排序）皆未單獨畫在架構圖⑤〕`：`dashboard`（行程總覽）、`explore`（驗證景點庫，含衝突可視化）、`map`（景點地圖瀏覽）、`collection`（收藏）、`settings`（設定）、`ai-plan`（AI 行程精靈表單）、`group/new` 與 `group/[id]/join`（建立／加入行程房間）、`trip/[id]`（行程主頁）、`trip/[id]/vote`（滑卡投票）、`trip/[id]/results`（投票結果排序）、`trip/[id]/map`（行程專屬地圖與時間軸）、`trip/[id]/weather`（天氣應變建議）。使用者在介面上的回饋／投票／評價會回流至外部資料來源層，作為未來驗證與推薦的輸入。

**技術層面（依 `package.json` 實際版本）** `〔整段補充｜架構圖未列：架構圖⑤只寫「Next.js Web Application」一行，沒有畫出任何前端函式庫或版本〕`：前端 Next.js 16（App Router）+ React 19 + TypeScript + TailwindCSS v4 + shadcn/ui + Radix，狀態管理以 TanStack Query 5 處理伺服器狀態、Zustand 5 處理純前端狀態，互動動畫用 Framer Motion 12（已用於滑卡與應變 Bottom Sheet），拖拉排序依賴 `@dnd-kit/core`／`sortable`／`utilities` 已安裝但目前程式碼中尚未實際使用；後端以 Supabase（PostgreSQL + pgvector + Auth）為主，Next.js Route Handlers 作為 BFF 層；AI 主力為 Gemini 2.5/1.5 Flash，Claude Haiku 為結構化輸出備援；地圖套件 `mapbox-gl`／`react-map-gl` 目前有兩種呈現並存：`trip/[id]/page.tsx` 的「地圖」分頁（`src/components/day-route-map.tsx`）已改用真實 Mapbox 底圖繪出當日路線與編號圖釘（需設定 `NEXT_PUBLIC_MAPBOX_TOKEN`，未設定時會顯示提示卡片而非報錯）；獨立的 `trip/[id]/map` 探索地圖頁則仍是自製 SVG 地圖原型（可縮放平移、圖釘、路線繪製），尚未接上正式地圖圖資。`〔2026-07-11 更新，取代舊版「尚未使用 Mapbox」的敘述〕`

### 2.「人機介面設計」（UI）與「使用者體驗」（UX）設計

> `〔整節標記｜補充｜架構圖未列〕`：`系統架構圖_0709.md` 的第⑤區塊只列出七個 UI 模組的**名稱**（Dashboard／Explore／Map／Weather／Voting／AI Trip Planner／User），完全沒有畫出互動設計、手勢、元件或視覺風格。以下整節內容都是本文件依 `src/app` 實際程式碼補充的 UI/UX 細節，架構圖上沒有對應圖示，建議視情況決定是否要另外補畫一張 UI 流程圖或線框圖給初審委員參照。

**Mobile-first 原則**：`(app)/layout.tsx` 同時掛載 `AppSidebar`（桌面）與 `BottomNav`（行動裝置，`md:hidden`），行動版預設為主體驗。

- **底部導覽（Bottom Tab）**：`src/components/layout/BottomNav.tsx` 實際定義五個入口——行程／探索／地圖／收藏／設定，對應路由高亮，每個 tap target 最小高度 56px，符合單手操作。
- **Tinder 式滑卡投票**：`trip/[id]/vote/page.tsx` 以 Framer Motion 的 `useMotionValue`／`useTransform`／`PanInfo` 實作四方向拖曳判定（左右為喜歡／略過，上下為必去／否決），並依剩餘配額動態鎖住上滑與下滑手勢，卡面同步顯示 LIKE／SKIP／MUST GO／VETO 的即時回饋色塊，把「快速二元判斷」的認知負擔降到最低。
- **衝突透明化的詳情面板**：`explore/page.tsx` 的 `DetailSheet` 以右側滑入面板呈現可信度評分、通過來源徽章、以及（若有衝突）每個欄位的多來源版本與層級標籤，不把系統的「最佳猜測」偽裝成唯一真相。
- **天氣應變的 Bottom Sheet 流程**：`trip/[id]/weather/page.tsx` 用 `vaul`／Framer Motion 實作的 Bottom Sheet，先以頂部橫幅提示降雨機率與受影響景點數，點開後逐一並列「原景點（受影響原因）→ 替代景點（室內、韌性等級）」，並提供「接受替換」／「保留原景點」／「全部接受建議」／「手動調整」多層次選項，避免使用者被迫接受單一 AI 決定。
- **行程時間軸與地圖並用**：`trip/[id]/page.tsx` 提供 Timeline／Map／List 三種檢視切換（`Tab` 型別）。**2026-07-11 更新**：此頁現在會優先讀取投票結果生成的草稿行程（`loadDraft()`，含座標回填），沒有草稿時才 fallback 顯示靜態東京範例；「地圖」分頁改用 `DayRouteMap` 元件畫出當日真實 Mapbox 路線（依序編號圖釘＋連線）。行程項目仍預留 `GripVertical` 拖拉排序視覺提示，對應 `@dnd-kit` 已安裝但尚待實作的拖拉互動。另一個獨立頁面 `trip/[id]/map`（景點探索地圖，非行程頁內的地圖分頁）則仍用自製 SVG 圖層疊加圖釘、路線與評論氣泡卡片，兩者是不同元件、進度不同步，撰寫簡報時請注意區分。
- **視覺風格**：全站延續深森林綠主題（`#1B4332` / `#52B788`），L0–L3 各級距以固定色碼（紅／橙／藍或黃／綠）呈現於卡片徽章，跨頁面（swipe 卡、explore 卡、weather 卡）保持一致的視覺語彙，降低使用者的重新學習成本。

---

## 四、計劃管理

> ⚠️ **待補：本節需要團隊實際排定的時程，無法由我推算或假設。** 我可以依 `DEVLOG.md`／`待討論事項_0709.md` 的現況（Phase 3 前後端整合進行中；`系統架構圖_0709.md` 已於 2026-07-09 核可；`待討論事項_0709.md` #1「資料涵蓋範圍拍板」等 P0/P1 項目尚待拍板）幫忙**草擬**一版 6 階段工作項目的**內容**，但起訖日期必須由你提供（尤其是比賽繳交截止日與 demo 日期），否則日期是我編造的，不能用於正式送件。請提供：① 這次要交的起始週與截止日；② 6 個工作階段大致想怎麼切（可參考待討論事項文件裡的優先順序，例如：資料涵蓋範圍拍板 → TDX 正式匯入 → LLM×RAG 前端串接 → 投票/應變 UI 完成 → 整合測試 → 簡報與成果影片）。

| 工作階段 | 工作日數 | 工作內容 |
|---|---|---|
| 1 | *（待填）* | *（待填）* |
| 2 | *（待填）* | *（待填）* |
| 3 | *（待填）* | *（待填）* |
| 4 | *（待填）* | *（待填）* |
| 5 | *（待填）* | *（待填）* |
| 6 | *（待填）* | *（待填）* |

| 周次 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| 起始日期 | | | | | | | | |
| 工作階段 1 | | | | | | | | |
| 工作階段 2 | | | | | | | | |
| 工作階段 3 | | | | | | | | |
| 工作階段 4 | | | | | | | | |
| 工作階段 5 | | | | | | | | |
| 工作階段 6 | | | | | | | | |

---

## 五、修改舊作參賽說明

☑ 本專案開發之作品未使用團隊成員曾獲競賽獎勵之作品。
☐ 本專案開發之作品採用團隊成員曾獲競賽獎勵之作品，至少應有50%差異，請說明(參考切結書第十點之規定）。

---

## 六、軟體清單

**1. 作業系統環境**

☑ Windows　☐ FreeBSD　☐ Linux
☐ MacOSX　☐ MacOS Classic　☐ 其他 _______________

> 依實際開發環境勾選（本機開發環境確認為 Windows）。若正式部署會用到 Vercel／Supabase 等雲端服務（底層為 Linux 容器），且你希望清單也一併呈現，請告訴我，我再補勾 Linux 並加註說明。

**2. 主要開發程式語言**

☐ Assembly　☐ C　☐ C++　☐ Java　☐ Perl
☐ PHP　☐ Python　☐ Ruby　☐ .NET　☑ 其他：**TypeScript / JavaScript（Node.js）**

補充：`agents/poi-verifier/src/validators/blog-search.ts` 有透過 subprocess 呼叫 Python（`ddgs` 套件）做部落格搜尋，屬輔助腳本，非主力語言，故不另外勾選 Python。

**3. 專案支援語言(可複選)**

☑ 中文　☐ 英文　☐ 其他 _______________

> ⚠️ **待確認**：全站 UI 文字（`src/app` 各頁面）皆為繁體中文，故先勾中文；若你希望連英文版介面/文件說明也算入，請告知是否要一併勾選英文。

**4. 開發環境**

> ⚠️ **待確認清單顆粒度**：範本例子是 IDE／框架／函式庫層級（如 C++ Builder、Arduino IDE、OpenCV）。以下依實際 `package.json` 與 `agents/` 程式碼列出候選項目，正式送件前麻煩確認要列到多細（例如只列 3–5 項代表性項目，或全部列出）：

(1) Next.js 16（App Router）／React 19 — 前端框架
(2) Supabase（PostgreSQL + pgvector + Auth）— 後端資料庫
(3) Google Gemini API（2.5/1.5 Flash，含 Embedding）— AI 驗證與生成
(4) Google Places API／OpenStreetMap Nominatim — 景點資料驗證來源
(5) TDX 觀光資料開放平臺 API — 官方景點資料匯入
(6) 中央氣象署開放資料 API — 天氣應變偵測

**5. 專案成果預定授權條款**

本專案開發產品授權條款使用＿＿＿＿＿＿＿＿宣告。*（依你的回覆，暫不填寫，待團隊決定後補上；`README.md` 目前也僅寫「[Add your license here]」，狀態一致）*

---

## 七、權力分配

☑ 依著作權法第 40 條之規定，由參賽學生與指導教授均等共有。
☐ 其他比例分配表，請說明。

---

## 附錄：比賽規則遵循檢查（全程匿名／生成式 AI 揭露）

> ⚠️ 這兩項是你後來補充的簡章規定，我已對照現有草稿做初步檢查，但有幾處需要你確認或決定，不是我能單方面裁量的。以下內容目前不在一～七的任何一節裡，正式送件前請和團隊討論要放在哪（例如併入「六、軟體清單」的附註，或另立單獨段落／切結書欄位），我沒有自行決定塞進哪個既有欄位。

### A. 全程匿名檢查

- **已掃描本文件（一～七）全文**：未發現學校名稱、系所名稱、教授姓名，或其他可直接辨識參賽者身分的文字。「指導教授」一詞只在「七、權力分配」的官方範本條文中以角色稱呼出現，沒有搭配任何姓名，判斷不算違規，但仍建議你再親自看過一遍確認。
- ⚠️ **需要你留意的地方（本文件範圍外）**：repo 裡的 `CLAUDE.md`、`PROJECT_BRIEF.md`、`README.md` 等內部協作文件明確寫著「國立中央大學資訊管理系畢業專題」等字樣，`prototypes/ui-demo/README.md` 也留有負責人姓名。這些文件是內部溝通用，**不會**被這份企劃書引用，但正式送件時（企劃書、系統需求書、簡報 PPT、demo 影片）務必個別再檢查一次，常見疏漏點是：投影片頁尾／浮水印、影片口白帶到系所或教授稱謂、demo 畫面截圖裡若有瀏覽器分頁標題或帳號名稱顯示真實姓名。這些我看不到、也不會自動檢查，需要你們自己過一遍。

### B. 生成式 AI 揭露

規則是「不影響計分，但須揭露使用來源與範圍」，分兩個層次，第一項我能直接依程式碼列出，第二項需要你決定：

**B-1／作品本身內建的生成式 AI（可直接依程式碼揭露）**

| 用途 | 模型 | 對應程式碼 |
|---|---|---|
| 景點事實萃取、L0–L3 等級分類、備案邏輯生成、旅客友善描述生成 | Google Gemini 2.5 Flash（主力）／Anthropic Claude Haiku 4.5（備援） | `agents/poi-verifier/src/enrichers/` |
| 景點語意向量嵌入（供 pgvector 語意檢索） | Google Gemini Embedding API（`gemini-embedding-001`，768 維） | `agents/poi-verifier`（ingestion 相關腳本） |
| RAG 兩階段重排中的交叉評分 | Google Gemini | `agents/poi-verifier/rag-reranker.ts` |
| 應變建議（Swap／Switch）的自然語言生成 | Google Gemini（主力）／Anthropic Claude Haiku（備援） | `agents/contingency-handler/src/generators/llm-client.ts` |

**B-2／撰寫本企劃書過程中使用的生成式 AI** `⚠️ 需要你決定是否要揭露、怎麼寫`：本企劃書草稿是由 Claude Code（Anthropic）對照 repo 原始碼整理撰寫而成。規則寫的是「作品使用生成式 AI」，如果簡章對「作品」的認定包含企劃書本身的撰寫輔助（而不只是系統功能），這裡也該一併寫清楚；但這牽涉簡章對「作品」範圍的解釋與你們想呈現的形象，我不確定裁量空間有多大，也不便代你決定要不要揭露、揭露到什麼程度，建議直接詢問承辦單位或對照切結書條文後再定稿。

**C／技術合作單位或經費補助** `⚠️ 待你確認`：目前程式碼與文件中沒有看到任何合作單位或補助紀錄——TDX、中央氣象署是政府開放資料 API，Google Gemini／Places、Anthropic 是一般按用量付費的 API，不構成贊助或技術合作關係。如果團隊實際上有拿到任何學校補助款、企業贊助、API 額度贊助或技術合作，這裡需要另外據實填寫，請告訴我以便補上。

---

*本文件依 repo 原始碼現況（2026-07-13）重新核對撰寫，一～三架構敘述以 `系統架構圖_0709.md` 為主要依據；功能完成度誠實區分「已實作」與「原型／進行中」。四、六仍有欄位待你提供關鍵資訊（時程日期、清單顆粒度、授權條款），附錄的匿名與生成式 AI 揭露也有幾處待你確認，已在文中以 ⚠️ 標示，尚未填入的內容是刻意保留、避免捏造，並非遺漏。*
