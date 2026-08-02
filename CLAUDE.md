# Navigator（領航者）— Claude 協作記憶

> 這份檔案是 repo 的共用 context。新開的 Claude Code / Cowork 對話第一件事就是把這整份讀完，再動手。
> 放置位置：repo 根目錄（`C:\AI project\tripplanner-github\CLAUDE.md`）。
> 相關參考文件放在 `C:\AI project\tripplanner\`（Cowork 掛載的 workspace）。

---

## 1. 專案一句話

Navigator（領航者）是一套「可信景點資料庫 + 即時韌性應變」的旅遊規劃系統（可以 Plug-in 服務形式串接旅遊平台）。這是一個資管系畢業專題，不是商業產品。

> ⚠️ 2026-07-16 拍板：**多人規劃（房間/投票/共識收斂）整條移出範圍**，定位收斂為單人使用情境＋平台服務。詳見 `0716_減法決策與不做清單.md`。程式碼保留未刪。

解決兩個真實痛點：

1. 網路上的景點資訊真假難辨、品質不一
2. 行程遇到天氣/交通突發狀況時，沒有備案邏輯

---

## 2. 必讀的框架與核心概念

這幾個概念在下面的程式碼 / schema / UI 到處都會出現，看到要知道在講什麼：

**孔祥重五階段方法論**（系統設計骨幹）

1. 聚焦（找真痛點）
2. 先人後機（先釐清人的決策流程，再上 AI）
3. 快速生成（LLM 產大量候選）
4. 深刻理解（人來挑、給 veto、加脈絡）
5. 賦能（AI 學會使用者偏好，下次更準）

**L0–L3 景點分級**（寫在每個 POI 的 `resilience_metadata.level`）

- L0 絕對錨點：非去不可，系統禁止自動替換（例：預訂好的餐廳）
- L1 彈性錨點：主要目的，綁定特定日期，盡量保留但可平移時段
- L2 條件變動：沿路順遊，天氣一變就可換
- L3 水位調節：填空 buffer，最容易被 swap 掉

**Token 投票制**（❌ 已於 2026-07-16 移出範圍——多人規劃砍除，此段僅供理解舊程式碼）

- 每人固定拿：1 張 VETO（否決票，權重 = −∞）、2 張 MUST-GO（+5）、無限張 Like（+1）
- 候選景點排序 = Σ(票 × 權重)，VETO 直接讓該點出局
- vote/results/group 頁程式碼保留在 repo 但不再開發、不入競賽敘事

**Swap vs Switch 決策樹**（即時韌性）

- Swap：同層級內換景點（L2 戶外 → L2 室內同區）
- Switch：切換整段行程型態（例：雨天早場活動整段後延）
- 觸發器：天氣 API、交通 API、使用者手動 flag

**漏斗式檢索（Funnel retrieval）**
為了壓 Token 成本到 < NT$5/次，檢索順序是：

1. RDB 結構化過濾（region、is_indoor、營業時段）
2. pgvector 語意檢索（vibe、使用者描述）
3. Level tagging 重排

**Agentic AI 架構**（從最初設計的 10 agent 縮為 1 核心 + 事件驅動）

> ⚠️ **"Architect Agent" 一詞已停用（2026-07-16 拍板，見 `0716_減法決策與不做清單.md` 拍板2、`系統架構圖_競賽版.md`）。** 行程草案來源改為：使用者從驗證庫選點 →「簡單排序」，取代投票收斂。`src/lib/draft-itinerary.ts` 用純規則排序（區域分群＋最近鄰＋時間切天）；這步驟沒有 LLM 呼叫，也不在「只做這條主線」的待辦清單內。系統的 Agentic 敘事完全由下面的 Contingency Handler 承擔（LLM 不做決策，只把已決定的方案講成人話）。**若有文件、對話、或程式碼提到「Architect Agent」是個會呼叫 LLM 產生行程的 agent，那是舊設計用語，先跟使用者確認範圍再動工。**

- **Contingency Handler**（事件觸發時決定 Swap 還是 Switch，目前唯一的 LLM-driven agent）：detect → 期望值推理 → RAG 檢索備案 → 反思審查（strict-checker 逐筆淘汰）→ LLM 只寫最後一句建議文字
- 其他工作（翻譯、tag、摘要）用一次性 prompt，不設常駐 agent

---

## 3. 技術選型 若要修改須更新claude.md

**前端**

- Next.js 14（App Router）+ TypeScript
- TailwindCSS + shadcn/ui
- Zustand（client state）+ TanStack Query（server state）
- Mapbox GL JS（地圖；demo 階段可先用 Leaflet）
- dnd-kit（拖拉排序行程）
- Framer Motion v12（Tinder 式 swipe）
- dnd-kit（`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`，行程拖拉排序）
- @ducanh2912/next-pwa（PWA，可安裝到手機桌面；production only，dev 停用）
- **手機與網站並重**：手機用 Bottom Tab + Bottom Sheet，桌面用頂部 Navbar + Side Panel

**後端**

- Supabase（PostgreSQL + pgvector + Auth + Storage + Realtime）
- Redis（快取、群組房間 presence）
- Next.js Route Handlers 當 BFF

**AI**

- 預設 Gemini 1.5 Flash（便宜、中文 OK）
- 備援 Claude Haiku（結構化輸出穩）
- 不要用 GPT-4 等級模型做主流程，成本撐不住

**外部 API**

- 中央氣象署開放資料（免費、可靠）
- Google Places / OSM（POI 補充資料）
- Gmail API（之後做 Email 票券解析）

---

## 4. 檔案地圖

**Repo 根目錄結構**

```
.
├── src/                          # 主應用 (Next.js 14 + TypeScript)
│   ├── app/                     # App Router
│   ├── components/              # React 元件
│   ├── lib/                     # 工具函式
│   ├── data/                    # 本地資料 (POI 等)
│   └── [其他 Next.js 規範]
│
├── prototypes/                   # 設計原型 & PoC
│   └── ui-demo/                 # UI 設計原型
│       └── README.md            # 設計文件
│
├── agents/                       # AI Agent 集合
│   └── poi-verifier/            # POI 驗證 Agent 原型
│       ├── src/                 # Agent 實作
│       ├── tests/               # 測試
│       └── README.md            # Agent 文件
│
├── mcp-server/                   # 對外交付面：MCP stdio server（零相依，重用 REST plug-in）
│   └── server.js
│
├── supabase/                     # Supabase migrations & config
├── public/                       # 靜態資源
│
├── src/proxy.ts                  # 對外交付面：/api/plugin/* 金鑰把關＋CORS（Next 16 proxy 慣例）
├── src/app/api/plugin/           # 對外交付面：REST plug-in 端點（薄包既有 handler）
│
├── CLAUDE.md                     # Claude 協作記憶（本檔）
├── CONTEXT.md                    # 領域詞彙（交付架構三詞）
├── PLUGIN_API.md                 # 對外交付面串接文件（REST ＋ MCP）
├── docs/adr/                     # 架構決策紀錄（0001＝交付架構）
├── AGENTS.md                     # Next.js 版本警告
├── README.md                     # 專案概述
├── DEVLOG.md                     # 開發日誌
├── package.json & 相關設定檔
└── [其他配置]
```

**核心檔案說明**
| 檔案 | 用途 | 更新頻率 |
|------|------|--------|
| `CLAUDE.md` | Claude AI 的協作記憶，涵蓋架構、技術選型、慣例 | ⚠️ 異動需立即更新 |
| `README.md` | 專案概述、快速開始 | 定期更新 |
| `DEVLOG.md` | 開發里程碑記錄 | 每周更新 |
| `src/` | 主 Navigator 應用（Next.js） | 持續開發 |
| `agents/poi-verifier/` | POI 驗證 Agent（可獨立測試） | 準備 MVP |
| `prototypes/ui-demo/` | UI 參考設計 | 已完成，參考用 |

**Cowork workspace（Google Drive）— 文件與資料**

```
Navigator_MVP_架構書.docx    完整 12 章架構書（Traditional Chinese, 837 段）
data/
  poi_raw.json                45 筆使用者原始景點資料
  poi_enriched.json           對應架構 schema 後的 45 筆 POI（主要讀這份）
  poi_stats.json              分布統計（3 區 × 15 筆，L0/L1/L2/L3 分布）
  poi_map_preview.html        Leaflet 視覺化（color coded by Level）
CLAUDE.md                     本檔副本（repo 是主要版本）
HANDOFF_PROMPT.md             新對話起手 prompt 模板
```

---

## 5. POI 資料 Schema

`data/poi_enriched.json` 是第一版 demo 的真實資料，45 筆。Schema：

```ts
{
  poi_id: string;              // "YM-001" (YM=陽明山, NC=北海岸, NE=東北角)
  name: string;
  location: { latitude, longitude, address };
  resilience_metadata: {
    level: 0 | 1 | 2 | 3;
    level_name: string;
    is_indoor: boolean;
    space_type: string;
    weather_sensitivity: "low" | "medium" | "high";
    backup_logic: {
      strategy_type: "swap_same_level" | "switch_time_slot" | ...;
      description: string;
      candidate_pool_tags: string[];
      proximity_threshold_meters: number;
    };
  };
  business_logic: {
    average_stay_minutes: number;   // "1.5 小時" 已 parse 為 90
    requires_reservation: boolean;
  };
  decision_tags: {
    vibe: string[];
    limitations: string[];
  };
  validation_log: {
    last_verified_at: ISO8601;
    source_reliability: string;
    fact_check_status: "mock_demo_data";   // 注意：demo 階段全是 mock
  };
}
```

**重要**：`fact_check_status` 目前全是 `"mock_demo_data"`，正式上線前必須換成真實驗證流程。架構書第 7、11 章有寫驗證 pipeline 規劃。

---

## 6. Mobile-first 設計準則

使用者明確要求手機優先（期末 demo 會用手機展示）。寫 UI 時：

- 預設 viewport 是 `< 640px`，桌面是 enhancement 不是 baseline
- 底部導覽（Bottom Tab）固定 5 個：首頁 / 發現 / 規劃中 / 我的 / 帳號
- 次要操作走 Bottom Sheet（shadcn/ui 的 Sheet 元件 side="bottom"）
- 卡片 tap target ≥ 44×44 pt（iOS HIG）
- Tinder swipe 和 dnd-kit 都要支援觸控手勢（`TouchSensor` 不能漏）
- 地圖在小螢幕要能 peek（地圖佔 60%，卡片列 peek 40%）
- 圖片 lazy load + 降解析度，行動網路別一次載太重

---

## 7. MVP 範圍（期末要交的）

**In scope**（2026-07-16 減法後）

- 驗證景點庫檢視（信任分數、多來源衝突透明呈現）
- 使用者從驗證庫選點組成行程（單人；應變的作用對象）
- 地圖視覺化 / 風險地圖
- 天氣觸發 Swap 建議（Contingency Handler，含反思審查，一個 demo scenario 就好）
- POI 語意搜尋接上前端（`/api/poi/search`）

**Out of scope（期末不做）**

- ❌ 多人規劃全鏈（建房間、加入房間、Token 投票、收斂結果、Realtime presence）— 2026-07-16 砍除，程式碼保留
- ❌ Supabase Auth 登入整合 — 延後賽後
- ❌ Tinder swipe 滑卡 — 程式碼保留、不入敘事
- ❌ 通用 AI 行程生成（ai-plan 頁）— 凍結
- Reels 影片解析
- Email 票券解析
- 真實交通即時 API（寫 mock 即可）
- 商家串接、付款
- 社交動態、關注

---

## 7.5 凍結模組清單（AI 請忽略——每次對話都要遵守）

以下路徑的程式碼**保留在 repo 但已凍結**。任何 Claude / AI 對話在沒有使用者明確要求的情況下：

1. **不要修改、擴充、重構**這些檔案（連「順手改善」都不要）
2. **不要把它們當現行功能**寫進任何文件、簡報、架構圖、需求描述
3. 全域性修改（改型別、換套件、修 build error）**連帶動到它們時允許**，但以能編譯的最小 diff 為限
4. 使用者若要求開發與清單衝突的功能，**先提醒此清單再動工**

| 路徑 | 狀態 | 原因 |
|---|---|---|
| `src/app/group/new/`、`src/app/group/[id]/join/`、`src/components/JoinModal.tsx` | 🧊 凍結（檔案仍在） | 多人房間（0716）。曾誤記為「已砍」，實際檔案未刪，2026-07-21 已從前端下架所有連結（首頁 CTA／navbar 加入行程按鈕） |
| `src/app/(app)/trip/[id]/vote/` | 🧊 凍結（檔案仍在） | 代幣投票（0716）。曾誤記為「已砍」，實際檔案未刪，2026-07-21 已從前端下架連結（trip 詳情頁動作按鈕） |
| `src/app/(app)/trip/[id]/results/` | 🧊 凍結（檔案仍在） | 投票收斂結果（0716）。同上，2026-07-21 已下架連結 |
| `src/app/(app)/trip/[id]/explore/` | 🧊 凍結 | Tinder swipe（下游投票已砍）。2026-07-21 已從 trip 詳情頁下架連結 |
| `src/app/(app)/ai-plan/` | 🧊 凍結 | 通用 AI 行程生成，不展示。2026-07-21 已從 Sidebar 下架連結 |
| `src/app/(app)/collection/`、`src/app/(app)/settings/`、`src/app/(app)/dashboard/` | 🧊 凍結 | App 外殼，不投工時。2026-07-21 已從 Sidebar／BottomNav 下架連結（`/dashboard` 連結改指向新增的 `/trip` 導頁——有已建立的行程就直接看，沒有才進 `/trip/build`，見 `src/app/(app)/trip/page.tsx`） |
| `agents/contingency-handler/src/detectors/traffic-detector.ts`、`venue-detector.ts`、`group-detector.ts` | 🧊 stub 永凍 | demo 只做天氣情境 |
| `src/lib/supabase/*` 的 Auth 相關擴充 | 🧊 延後 | Auth 賽後再做（現有 client/server helper 可繼續用於 DB 存取） |

> 注意：`src/app/(app)/explore/`（驗證景點庫，含衝突 UI）是**主線核心，不在凍結清單**——別跟 `trip/[id]/explore`（swipe 頁）搞混。
> 完整決策脈絡見 `0716_減法決策與不做清單.md`。
>
> **2026-07-21 前端下架**：上表所有路徑的原始檔案**都還在 repo 裡、沒有被修改**（符合本節規則 1：不動凍結檔案本身）。改動的是「入口」——`src/app/page.tsx`（首頁文案與 CTA 全面改寫，移除多人敘事）、`src/app/(app)/trip/[id]/page.tsx`（移除格狀篩選／投票／結果按鈕，修正「由投票結果生成」的過時文案）、`src/components/layout/AppSidebar.tsx`、`src/components/layout/BottomNav.tsx`（移除指向凍結路徑的導覽項目）。使用者現在無法從正常操作流程點到任何凍結頁面，但直接輸入網址仍可訪問（未加路由層級的存取限制，非目前範圍）。

---

## 8. 慣例（寫 code 前看這段）

**命名**

- 檔案 kebab-case：`poi-card.tsx`
- 元件 PascalCase：`PoiCard`
- DB 欄位 snake_case（跟 Supabase 對齊）
- API route handler 檔名跟動詞對齊：`route.ts` 裡 export `GET`/`POST`

**狀態管理分工**

- Server 狀態（POI、行程、使用者）→ TanStack Query
- 純 client 狀態（UI toggle、swipe 暫存）→ Zustand
- 不要把 server response 複製一份進 Zustand

**Commit message**

- 中英文都可接受，但動詞開頭：`feat: 加上 POI 卡片 swipe`
- 不寫 emoji 前綴（保持 diff 乾淨）

**Don't do**

- 不要在前端直接呼 Gemini / Claude API（key 會外洩，走 Route Handler）
- 不要在 L0 景點上做自動 Swap（定義就是不能動）
- 不要開發 §7.5 凍結清單裡的模組（多人/投票/swipe/ai-plan 等），也不要把它們寫成現行功能
- 不要假設使用者會旋轉螢幕到橫向

---

## 9. 當前進度

> 最後更新：2026-07-28。這節列的是「模組實際串接狀態」，比 `DEVLOG.md` 的時間軸更適合拿來判斷某功能能不能 demo；`DEVLOG.md` 仍是里程碑時間軸的最可信來源。
>
> 這節的教訓：這個 repo 已經**三次**因為「後端做完了、前端也有畫面，但兩者其實沒接在一起」而出過認知落差（凍結模組連結、天氣應變頁綁死 demo 資料、衝突 UI 讀不到資料）。所以下面的表刻意拆成「前端有沒有」「後端有沒有」「兩者有沒有真的接上」三欄——只看前兩欄會誤判成「做完了」。
>
> **2026-07-28 補一條更硬的教訓**：三次裡最嚴重的一次（天氣應變 × 自建行程）不只是「沒接」，是**接了也不會動**——explore 傳下去的 id 是 `poi_catalog` 的 UUID，而應變管線用 `NCA-xxx` 定址，兩邊型別都是 `string`，編譯器與型別檢查全部沉默。**判斷「有沒有接上」時，光看兩邊都有程式碼不夠，要確認流過去的識別碼是同一組。**

**Phase 1（UI 原型）與 Phase 2（Agent 核心）已完成**，細節不重複列，見 git log 或舊版 DEVLOG。以下是目前（2026-07-28）逐模組的實際狀態：

| 模組 | 前端 | 後端 | 串接狀態 | 備註 |
|---|---|---|---|---|
| 驗證景點庫檢視（explore 主線） | ✅ `explore/page.tsx` | ✅ `/api/poi/search`（list 模式） | ✅ 串接，真資料 | 可信度分數、來源徽章、L0–L3 皆為真資料。**2026-07-28**：多來源衝突／分級理由／部落格佐證三塊 UI 已接回資料（`lib/verification-detail.ts` 在 server 端從 `poi-kb.ts` join，前端 bundle 不變胖）——45 筆全部帶回，32 筆有真實衝突欄位。⚠️ 這也讓 30/45 筆的「無法呼叫 LLM，預設 L2」直接顯示在畫面上，見下方「已知的資料品質問題」 |
| POI 語意搜尋（Gemini embedding + hybrid RPC） | ✅ 搜尋框送 `query`（400ms debounce） | ✅ `poi-search.ts` `searchPois()` | ✅ 串接，真資料 | **2026-07-28 接通**。空查詢維持 list 模式（零 LLM 成本），有查詢才走 hybrid_search RPC；前端不再做名稱字串比對，排序完全交給後端 |
| 選點組行程（FFR13） | ✅ `/trip/build` + `itinerary-cart` store | 不需要後端（純規則排序，無 LLM） | ✅ 串接 | 存 localStorage；2026-07-21 修掉「行程」導覽每次重來、購物車建完不清空兩個 bug |
| 行程檢視 + 真實地圖 | ✅ `/trip/[id]`（`day-route-map.tsx`，真 Mapbox GL） | 讀 localStorage 草稿 | ✅ 串接 | 顯示 FFR13 產生的真實路線與站點 |
| 獨立景點地圖頁 | 🧊 `/map`、`/trip/[id]/map`（手刻 SVG） | 靜態 45 筆 demo 資料 | ❌ 未接資料庫 | 不在 §7.5 凍結清單，但目前跟主線脫節，沒讀真實 `poi_catalog` |
| 風險地圖 | ❌ 未做 | ❌ 未做 | — | MVP 範圍有寫，但目前只有天氣敏感度文字標籤，沒有空間視覺化疊層 |
| 天氣應變核心管線（偵測/EV/候選/敘述/反思） | ✅ weather 頁完整渲染 | ✅ `/api/contingency` 真管線 | ✅ 串接，真資料 | CWA 真偵測、Supabase RPC 候選、LLM 敘述＋反思迴路皆真實；2026-07-21 補上分數細節／風險標籤／反思違規記錄的前端顯示 |
| 天氣應變 ×「你自己建的行程」 | ✅ weather 頁 | ✅ 管線本身 | ✅ **2026-07-28 接通，真實瀏覽器全流程驗證過** | weather 頁改讀 `loadDraft(tripId)`；受影響景點由時間軸動態判定；Day tabs 依草稿天數產生；接受替換走 `applySwapsToDraft()` 寫回**真實草稿**並重算該天交通時間。查不到草稿才退回固定示範站點並標示「示範行程」。⚠️ 同批修掉一個致命定址 bug：explore 原本傳 `poi_catalog` UUID 而非 `NCA-xxx`，在此之前這條路徑**一定**查無景點（見本節開頭的教訓）。修復前建立的草稿仍存 UUID，需重建；查不到的站點會顯示「天氣資料待補」，不會靜默略過 |
| POI 驗證 Agent（6 驗證器／衝突解析／canonical 正規化） | — | ✅ `agents/poi-verifier/` | ⚠️ 只離線跑 | 結果存在 `results/*.json`。**2026-08-02**：migration 010 已新增 `conflict_analysis`／`level_reasoning`／`verification_tier` 欄位，ingestion 也會寫入；`verification-detail.ts` 改為「DB 優先、靜態 `poi-kb.ts` 補洞」（合併規則抽在 `verification-detail-merge.ts`，有單元測試）。`blog_posts` 至今仍無 DB 欄位，continue 靠靜態檔。**待辦：套用 migration 010 ＋ 重跑 ingestion**，之後既有 45 筆才會由 DB 供應 |
| P0/P1/P2 來源（官網／PTT／YouTube） | — | ✅ `validators/index.ts` **早已完整整合** | ✅ 程式碼已串接 | ⚠️ **常見誤判**：`results/poi_verified.json` 顯示這三類為 0/45，看起來像沒接——但那份檔案是 **2026-05-06** 產生的，而三個驗證器是 **2026-06-04** 才加入（commit `0c8454e`）。**檔案比程式碼舊一個月**。2026-08-02 實跑 `crossValidate('朱銘美術館')` 回 `["google_places","osm","blog_post","official_website","ptt"]`＝5 類、reliability 0.98。**要看真實狀態請實跑，不要讀那份舊 JSON。** YouTube 需 `YOUTUBE_DATA_API_KEY`（目前未設）；大規模匯入時設 `DISABLE_YOUTUBE_VALIDATOR=1` 關閉（100 quota/筆＝每日上限 100 筆，是最硬的瓶頸） |
| 資料層 A/B Benchmark（教授 0722 要求） | — | ✅ `agents/poi-verifier/bench-datalayer.ts` | ✅ 已實測跑出數字 | **2026-07-28 新增**。同一 LLM／同一題／同一輸出格式，唯一變因是有沒有餵驗證資料。首輪（北海岸 15 筆真值、6 題）：可查證率 69% → 100%，**室內外事實正確率 45% → 95%**。題目鎖北海岸是因為只有那 15 筆真的驗過。引用時要說明 B 組 100% 可查證部分來自 prompt 限定，未被綁定的硬指標是事實正確率 |
| RAG Reranker／TDX 批次匯入 | — | ✅ CLI script 完整可執行 | ❌ 純離線工具 | `npm run rerank`／`tdx:ingest`，沒有任何 route 或頁面呼叫過；`poi_catalog` 目前仍只有原始 45 筆 demo 資料，尚未大規模匯入（TDX OAuth 已驗證可用，但匯入規模待 `待討論事項_0709.md` #1 拍板） |
| 對外交付面（REST plug-in ＋ MCP） | —（無 UI，本來就是給外部串接） | ✅ `/api/plugin/poi/search`、`/api/plugin/contingency`（薄包既有 handler）＋ `mcp-server/server.js` 兩個 tool | ✅ 串接，端到端驗證真資料 | 2026-07-27 新增。`src/proxy.ts` 對 `/api/plugin/*` 做 `x-api-key` 把關＋CORS，內部路由不受影響（explore 不破）；MCP stdio server 走 AI→MCP→REST（帶金鑰）→`poi_catalog`。決策見 `docs/adr/0001`、詞彙見 `CONTEXT.md`、串接見 `PLUGIN_API.md`。demo 金鑰在 `.env.local` 的 `PLUGIN_API_KEYS`（未進 git） |
| 凍結模組（多人房間／投票／結果／swipe／ai-plan／collection／settings／dashboard） | 🧊 純前端 mock UI | ❌ 無對應 API route（vote/results/group 頁零資料呼叫） | ❌ 未串接、已凍結 | DB schema 早期曾規劃（`001_init.sql` 的 `itineraries` 綁 `travel_groups`），但從未真的接前端。2026-07-21 已從導覽全面下架連結，檔案保留，詳見 §7.5 |

### 🔴 最高優先：天氣應變目前在 2/3 區域無候選（2026-08-02 發現）

**這一項與下面四項不同——它不只是資料難看，是旗艦功能實際壞掉。**

線上 `poi_catalog` 45 筆有 **41 筆 `is_indoor=false`**，其中 10 筆可證明為錯（國立海洋科技博物館、福容大飯店、阿妹茶樓、草山行館、中山樓…全是室內場所）。根因是 2026-05-06 那批 ingest 時 Gemini 配額耗盡走降級分支，而 `agent.ts` 用 `?? false` 把 null 補成假值。

應變管線下雨路徑是 `metadata @> {"is_indoor": true}` 的**硬性篩選**，而僅存的 4 筆室內景點**全在北海岸** → **陽明山與東北角下雨時候選池為 0 筆**。

- **程式碼側已全數修復**（三處補預設值的地方、批次中止機制、API 層、benchmark 真值防護、migration 010、32 項單元測試）
- **線上資料仍是壞的**，需 ①套用 migration 010 ②Gemini 升 Tier 1 後重跑 45 筆 ③重建 embedding
- 完整分析與修復清單見 `agents/poi-verifier/KNOWN_ISSUES.md` 2026-08-02
- ⚠️ **demo 前若未重跑，不要展示陽明山或東北角的天氣應變**

**教訓（比 bug 本身重要）**：這是本 repo 第四次「以為做好了其實沒有」，而且是最隱蔽的一次——前三次是「沒接上」，這次是**接上了、跑得動、回傳成功，但資料是編的**。`verifyPoi()` 在 LLM 失敗時不拋錯而是回傳結構完整的降級結果，`?? false` 讓「未判定」和「判定為戶外」變得無法區分。**判斷一個功能是否可信，光看它有沒有回傳、型別對不對不夠，要確認它宣稱知道的事情是真的判斷過的。**

### 已知的資料品質問題（2026-07-28 把驗證細節攤到 UI 上之後才看得見）

這四項都**不是程式 bug**，是資料本身的狀態。以前藏在 JSON 裡沒人看到，現在使用者（和教授）在畫面上讀得到：

1. **30/45 筆的「韌性分級理由」顯示「無法呼叫 LLM，預設 L2」**（陽明山 15 ＋ 東北角 15，同 30 筆也沒有 AI 驗證描述）。根因見 `KNOWN_ISSUES.md` 2026-07-24。**demo 只要點到北海岸以外的景點就會露出**，呈現方式待拍板（照實顯示／改中性文字「分級待驗證」／先重跑再展示），見 `待討論事項_0709.md` #21。
   ⚠️ **2026-08-02 補**：同一批 30 筆的 `is_indoor` 也是預設值——見上方紅字段落，那個影響嚴重得多。
2. **部落格佐證混入不相關內容**：90 則佐證有 11 則來自 YouTube，其中出現與景點完全無關的影片（擎天崗的佐證裡有勞斯萊斯開箱）。youtube-search 濾了業配，沒濾相關性。
3. **`data/pois.ts` 有 27/45 筆名稱與 `poi_catalog` 不同**（ids 45/45 對齊）。應變頁已改為一律顯示資料庫名稱繞過，根因未解，待決定權威來源。
4. **部分圖片與內容對不上**（擎天崗主圖是一杯檸檬薑茶）。

### 下一步如果要選一個做

**把 `/api/contingency` 對 `data/pois.ts` 的依賴解掉**（改讀 `poi_catalog` by `source_id`）。現在 `POIS.find(p => p.id === poi_id)` 查不到就回 404，weather 頁也把「靜態表查不到」的候選直接濾掉——意思是**系統目前只能對這 45 筆做應變**。#1 一旦拍板要擴大資料，這是第一個擋路的東西，而且它不依賴 #1 就能先改好。

---

## 10. 遇到問題時

- 架構細節不確定 → 看 `ARCHITECTURE.md`（從程式碼實際狀態拉出）
- 開發進度不確定 → 看 `DEVLOG.md`（最可信的進度紀錄）
- POI 驗證結果格式 → 看 `agents/poi-verifier/results/poi_verified.json` 任一筆
- 前端 POI 資料格式 → 看 `src/data/poi-kb.ts`（AUTO-GENERATED）
- 衝突分析格式 → 看 `agents/poi-verifier/results/poi_conflicts.json`
- 技術選型想翻案 → **先問使用者**，不要自己改 stack
- 朋友的 code 看不懂 → `git log --oneline` 看 commit history，或直接問使用者
