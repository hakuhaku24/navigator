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

> 最後更新：2026-08-04。這節列的是「模組實際串接狀態」，比 `DEVLOG.md` 的時間軸更適合拿來判斷某功能能不能 demo；`DEVLOG.md` 仍是里程碑時間軸的最可信來源。
>
> 這節的教訓：這個 repo 已經**三次**因為「後端做完了、前端也有畫面，但兩者其實沒接在一起」而出過認知落差（凍結模組連結、天氣應變頁綁死 demo 資料、衝突 UI 讀不到資料）。所以下面的表刻意拆成「前端有沒有」「後端有沒有」「兩者有沒有真的接上」三欄——只看前兩欄會誤判成「做完了」。
>
> **2026-07-28 補一條更硬的教訓**：三次裡最嚴重的一次（天氣應變 × 自建行程）不只是「沒接」，是**接了也不會動**——explore 傳下去的 id 是 `poi_catalog` 的 UUID，而應變管線用 `NCA-xxx` 定址，兩邊型別都是 `string`，編譯器與型別檢查全部沉默。**判斷「有沒有接上」時，光看兩邊都有程式碼不夠，要確認流過去的識別碼是同一組。**
>
> **2026-08-03 再補一條**：第五種落差是「程式碼修好了、線上資料還是舊的」。2026-08-02 那批修復（is_indoor 靜默降級）程式碼全數完成、單元測試 32 項全過，但在 migration 010 套用並重跑 45 筆之前，**線上行為一點都沒變**。判斷一項修復是否生效，要看資料庫裡的值，不是看 diff。
>
> **2026-08-04 再補一條（第五條的反面）**：`commit` 不等於資料狀態，**資料狀態也不等於 commit**。組員推 `990ddcf` 之後持續在跑批次：commit message 寫 101 筆／tier_0 56，同日 11:20 實查是 100 筆／tier_0 43，16:05 是 tier_0 27，16:50 收斂於 tier_0 9。**沒有任何 commit 記載這些 DB 異動。本節所有線上數字都要以 service role 當場實查為準，不要抄 commit message，也不要抄本檔的表格。**
> 同一批也再次示範第五條本身：`space-type.ts` 與 69 項測試都好了，但 `osm_class` 線上一度只有 8/100 筆有值——**寫好的判定邏輯，在資料補上之前對 92 筆等於不存在**。

**Phase 1（UI 原型）與 Phase 2（Agent 核心）已完成**，細節不重複列，見 git log 或舊版 DEVLOG。以下是目前（**2026-08-04 11:20 service role 實查**）逐模組的實際狀態：

| 模組 | 前端 | 後端 | 串接狀態 | 備註 |
|---|---|---|---|---|
| 驗證景點庫檢視（explore 主線） | ✅ `explore/page.tsx` | ✅ `/api/poi/search`（list 模式） | ✅ 串接，真資料 | 可信度分數、來源徽章、L0–L3 皆為真資料。**2026-07-28**：多來源衝突／分級理由／部落格佐證三塊 UI 已接回資料（`lib/verification-detail.ts` 在 server 端從 `poi-kb.ts` join，前端 bundle 不變胖）。**2026-08-03**：①新增 `TierBadge`／`TierPanel` 呈現 `verification_tier`（SRS FFR15），四態必須可分——`null`（尚未判定，不顯示徽章、只在面板說明）≠ `tier_0`（跑過但單一來源）；分層排在可信度分數之前，因為「驗到什麼程度」是「多可信」可否比較的前提。②修好 `deriveSourcesDetected()` 數不到 OSM 與部落格的問題（metadata 缺 `osm_id`／`blog_post_count` 代理欄位，來源天花板結構上卡在 4 類）。③重跑後 45/45 皆有衝突分析與分級理由。**2026-08-04**：④區域篩選改讀 `curated_zone`（不再從 `metadata.region` 推），並**移除 `?? "北海岸"` 靜默預設**——在此之前三峽／烏來／永和的景點全被顯示成北海岸；新增「未分區」為可篩選的真實狀態（線上 4 筆）。⑤庫存 45 → 100 筆後，衝突分析與部落格佐證只有走過完整驗證的那批才有（**91/100**，缺的是刻意保留的 9 筆 tier_0），畫面上會看到兩種豐富度不同的卡片，**這是分層的預期行為而非破圖**。⑥`deriveSourcesDetected()` 補上漏算的 `tdx_api`（`b24635f`）——在此之前 TDX 匯入的景點會**同時顯示「單一來源」徽章與「0 個來源」** |
| POI 語意搜尋（Gemini embedding + hybrid RPC） | ✅ 搜尋框送 `query`（400ms debounce） | ✅ `poi-search.ts` `searchPois()` | ✅ 串接，真資料 | **2026-07-28 接通**。空查詢維持 list 模式（零 LLM 成本），有查詢才走 hybrid_search RPC；前端不再做名稱字串比對，排序完全交給後端 |
| 選點組行程（FFR13） | ✅ `/trip/build` + `itinerary-cart` store | 不需要後端（純規則排序，無 LLM） | ✅ 串接 | 存 localStorage；2026-07-21 修掉「行程」導覽每次重來、購物車建完不清空兩個 bug |
| 行程檢視 + 真實地圖 | ✅ `/trip/[id]`（`day-route-map.tsx`，真 Mapbox GL） | 讀 localStorage 草稿 | ✅ 串接 | 顯示 FFR13 產生的真實路線與站點 |
| 獨立景點地圖頁 | 🧊 `/map`、`/trip/[id]/map`（手刻 SVG） | 靜態 45 筆 demo 資料 | ❌ 未接資料庫 | 不在 §7.5 凍結清單，但目前跟主線脫節，沒讀真實 `poi_catalog`。**2026-08-04 起落差擴大**：線上已有 100 筆，這頁還是那 45 筆 |
| 風險地圖 | ❌ 未做 | ❌ 未做 | — | MVP 範圍有寫，但目前只有天氣敏感度文字標籤，沒有空間視覺化疊層 |
| 天氣應變核心管線（偵測/EV/候選/敘述/反思） | ✅ weather 頁完整渲染 | ✅ `/api/contingency` 真管線 | ✅ 串接，真資料 | CWA 真偵測、Supabase RPC 候選、LLM 敘述＋反思迴路皆真實；2026-07-21 補上分數細節／風險標籤／反思違規記錄的前端顯示。**2026-08-04 偵測層補完**：①拿掉 `?? 25`，CWA 取不到溫度回 `null` 不再憑空生 25°C；②**EV 公式加入熱度項**——此前公式只吃降雨機率，`high_temperature` 的 `score_drop` 恆為 0，偵測器判出的高溫在決策層等於不存在；③新接警特報 `W-C0033-001`／紫外線 `O-A0005-001`／日出日沒 `A-B0062-001`；④override 路徑改為只覆寫指名欄位（此前 demo 模擬大雨時，警特報／紫外線／日落永遠不會出現）。⚠️ 實跑才發現：新北市原對映紫外線測站 466880 不在該 API 的 30 站清單裡 → 新北紫外線恆為 null，已改 466900（淡水） |
| 潮汐可行性提示（FFR14 / EIR7） | ✅ weather 頁 `TideBanner` | ✅ `tide-detector.ts` ＋ `/api/contingency` 回傳 `tide` | ✅ **2026-08-03 接通** | 中央氣象署鄉鎮潮汐 `F-A0021`，與天氣應變並行、互不依賴（不下雨也可能因滿潮白跑）。只對受潮汐影響的景點查詢（`isTideSensitive`），避免對內陸景點付 Nominatim＋CWA 的成本。**風險三態 high／low／unknown**，查無資料回 `unknown` 不回 `low`——查不到不等於安全。low 時不附建議時段（已可前往還叫人改時間是噪音）。真實 API E2E：神祕海岸同為 14:00，8/03 與 8/04 判 high（距滿潮 47／26 分）、8/05–8/07 判 low，**逐日不同**——這是天文計算不是靜態事實，任何 LLM 都答不出來 |
| 天氣應變 ×「你自己建的行程」 | ✅ weather 頁 | ✅ 管線本身 | ✅ **2026-07-28 接通，真實瀏覽器全流程驗證過** | weather 頁改讀 `loadDraft(tripId)`；受影響景點由時間軸動態判定；Day tabs 依草稿天數產生；接受替換走 `applySwapsToDraft()` 寫回**真實草稿**並重算該天交通時間。查不到草稿才退回固定示範站點並標示「示範行程」。⚠️ 同批修掉一個致命定址 bug：explore 原本傳 `poi_catalog` UUID 而非 `NCA-xxx`，在此之前這條路徑**一定**查無景點（見本節開頭的教訓）。修復前建立的草稿仍存 UUID，需重建；查不到的站點會顯示「天氣資料待補」，不會靜默略過 |
| POI 驗證 Agent（6 驗證器／衝突解析／canonical 正規化） | — | ✅ `agents/poi-verifier/` | ✅ **2026-08-03 起由 DB 供應** | **migration 010 已套用至線上**。`verification-detail.ts` 為「DB 優先、靜態 `poi-kb.ts` 補洞」（合併規則抽在 `verification-detail-merge.ts`，有單元測試），現在絕大多數欄位走 DB 這條。批次本身仍是離線 CLI，沒有 route 觸發。**2026-08-04 覆蓋率隨庫存擴充而分層**：`level_reasoning` 100/100，`conflict_analysis`／`blog_snippets` **91/100**——只有完整驗證過的那批有，缺的正好是刻意保留的 9 筆 tier_0。前端會看到兩種豐富度不同的卡片，**這是分層的預期行為而非破圖** |
| P0/P1/P2 來源（官網／PTT／YouTube） | — | ✅ `validators/index.ts` 完整整合 | ✅ 串接且**線上資料已反映** | ⚠️ **YouTube 恆為 0**（未設 `YOUTUBE_DATA_API_KEY`），所以**實測上限是 5 類，不是 7 類——對外文件與簡報不得寫「7 類交叉驗證」**。大規模匯入時設 `DISABLE_YOUTUBE_VALIDATOR=1` 關閉（100 quota/筆＝每日上限 100 筆，是最硬的瓶頸）。**2026-08-04 實查（16:50，批次已收斂）**：**≥3 類者 78 筆**（8/03 為 33 筆），分布 1 類×9／2 類×13／3 類×27／4 類×27／5 類×24。⚠️ **這組數字含 TDX**——`b24635f` 修好了前端 `deriveSourcesDetected()` 漏算 `tdx_api` 的問題（在此之前 TDX 匯入的景點畫面上會同時顯示「單一來源」徽章與「0 個來源」，系統自己講的兩句話互相矛盾）。政府開放資料比部落格權威，沒有理由不算，但**與 8/03 的 33 筆不是同一把尺**，跨日比較要說明。歷史註記：`results/poi_verified.json` 曾有一年多的時間比程式碼舊，導致這三類被誤判為未接；該檔已於 2026-08-03 重跑覆蓋 |
| 資料層 A/B Benchmark（教授 0722 要求） | — | ✅ `agents/poi-verifier/bench-datalayer.ts` | ⚠️ 數字已過時，需重跑 | **2026-07-28 新增**。同一 LLM／同一題／同一輸出格式，唯一變因是有沒有餵驗證資料。首輪（北海岸 15 筆真值、6 題）：可查證率 69% → 100%，**室內外事實正確率 45% → 95%**。⚠️ **這組數字產生於 2026-08-03 重跑之前**，B 組所依據的真值已經改變兩次（`is_indoor` 室內數 4/45 → 14/45 → **31/100**），**引用前必須以最新資料重跑**；題目也可以從北海岸擴到三區了。**2026-08-04 補**：A 組原本被判「查無」的 8 個真實景點已補進三個（富貴角、白沙灣海水浴場、新北市立黃金博物館），重跑時要注意這會直接影響「可查證率」這項。引用時仍要說明 B 組 100% 可查證部分來自 prompt 限定，未被綁定的硬指標是事實正確率 |
| TDX 批次匯入 | — | ✅ CLI script | ✅ **2026-08-04 端到端跑通，線上資料已擴充** | 仍是離線 CLI，沒有 route 或頁面呼叫。**45 → 100 筆**（TDX 55 筆），`embedding` 缺漏 0、同名重複 0。**2026-08-04 `b24635f` 補上兩道守門**：①**BFR14 降級守門**——降級資料不入庫、單獨計數、連續 3 次中止批次、exit code 非 0（在此之前 LLM 全掛的那筆照樣入庫還被算進「成功」）；②**跨來源去重**——`poi_catalog` 唯一鍵是 `source_id`，同一地點從兩個來源進來會變兩筆，改為在花 embedding／LLM 成本前以「正規化名稱相同 **且** 距離 ≤500 公尺」雙條件攔截（實測：陽明書屋 vs YMS-003 相距 447 公尺、中山樓 vs YMS-002 相距 171 公尺，皆擋下）。刻意**偵測後跳過並回報**而非自動合併——合併涉及「哪一邊欄位優先」，實測答案不固定，該由人決定。名稱正規化刻意保守（不剝括號別名、不移除「步道」）：**寧可漏判不可誤判**，漏判看得見，誤判會靜默蓋掉資料。新增 `--zone`（自動展開為鄉鎮篩選並指派 `curated_zone`；否則按縣市整批倒入的景點會落在三區之外，天氣應變檢索找不到、explore 也篩不到）與 `--skip`（續匯不必從第一筆重跑）。**2026-08-03 的端點改版**：舊 `v2/Tourism/ScenicSpot` 全數 404，已改接 `…/api/tourism/service/odata/V2/Tourism/Attraction`（實體改名 ScenicSpot→Attraction、Activity→Event）。匯入規模仍待 `待討論事項_0709.md` #1 拍板 |
| RAG Reranker | — | ⚠️ CLI script | ❌ 純離線工具 | `npm run rerank`，沒有任何 route 或頁面呼叫過 |
| 對外交付面（REST plug-in ＋ MCP） | —（無 UI，本來就是給外部串接） | ✅ `/api/plugin/poi/search`、`/api/plugin/contingency`（薄包既有 handler）＋ `mcp-server/server.js` 兩個 tool | ✅ 串接，端到端驗證真資料 | 2026-07-27 新增。`src/proxy.ts` 對 `/api/plugin/*` 做 `x-api-key` 把關＋CORS，內部路由不受影響（explore 不破）；MCP stdio server 走 AI→MCP→REST（帶金鑰）→`poi_catalog`。決策見 `docs/adr/0001`、詞彙見 `CONTEXT.md`、串接見 `PLUGIN_API.md`。demo 金鑰在 `.env.local` 的 `PLUGIN_API_KEYS`（未進 git） |
| 凍結模組（多人房間／投票／結果／swipe／ai-plan／collection／settings／dashboard） | 🧊 純前端 mock UI | ❌ 無對應 API route（vote/results/group 頁零資料呼叫） | ❌ 未串接、已凍結 | DB schema 早期曾規劃（`001_init.sql` 的 `itineraries` 綁 `travel_groups`），但從未真的接前端。2026-07-21 已從導覽全面下架連結，檔案保留，詳見 §7.5 |

### ✅ 已解除：天氣應變在 2/3 區域無候選（2026-08-02 發現，2026-08-03 修復）

**這一項曾是 🔴 最高優先——它不只是資料難看，是旗艦功能實際壞掉。保留此段是因為教訓比 bug 本身重要。**

當時線上 `poi_catalog` 45 筆有 **41 筆 `is_indoor=false`**，其中 10 筆可證明為錯（國立海洋科技博物館、福容大飯店、阿妹茶樓、草山行館、中山樓…全是室內場所）。根因是 2026-05-06 那批 ingest 時 Gemini 配額耗盡走降級分支，而 `agent.ts` 用 `?? false` 把 null 補成假值。應變管線下雨路徑是 `metadata @> {"is_indoor": true}` 的**硬性篩選**，僅存的 4 筆室內景點**全在北海岸** → 陽明山與東北角下雨時候選池為 0 筆。

**下表是 45 筆時期的修復前後對照，數字停在 2026-08-03。庫存已於 2026-08-04 擴充到 100 筆，最新狀態見本節下方「線上知識庫現況」**：

| 指標 | 修復前 | 修復後 |
|---|---|---|
| `llm_source` | 30/45 `fallback` | **45/45 `gemini`** |
| `verification_tier` | 全 `null`（欄位未上線） | **`tier_1` 27、`tier_2` 18** |
| `is_indoor` | true 4／false 41 | **true 14／false 31** |
| 室內景點分區 | 4 筆全在北海岸 | **北海岸 4、東北角 6、陽明山 4** |
| 每筆來源類別數 | 幾乎全是 1 類 | **2類×12、3類×10、4類×14、5類×9** |
| 前端平均可信度 | 68% | **78%** |

- 程式碼側修復（三處補預設值處、批次中止機制、API 層、benchmark 真值防護、32 項單元測試）於 2026-08-02 完成
- **migration 010 已套用線上、45 筆已重跑、embedding 已重建**，三區皆有室內候選，**demo 可以展示任一區的天氣應變**
- ⚠️ **`reliability_score` 新舊不可比**：重跑同時新增了 OSM／官網／PTT 三類來源的權重，「68% → 78%」不是同一把尺上的進步。對外引用要說明
- 完整分析見 `agents/poi-verifier/KNOWN_ISSUES.md`

**教訓（比 bug 本身重要）**：這是本 repo 第四次「以為做好了其實沒有」，而且是最隱蔽的一次——前三次是「沒接上」，這次是**接上了、跑得動、回傳成功，但資料是編的**。`verifyPoi()` 在 LLM 失敗時不拋錯而是回傳結構完整的降級結果，`?? false` 讓「未判定」和「判定為戶外」變得無法區分。**判斷一個功能是否可信，光看它有沒有回傳、型別對不對不夠，要確認它宣稱知道的事情是真的判斷過的。**

**第五次的教訓（同一件事的下半場）**：程式碼在 2026-08-02 就全修好了，但線上行為到 2026-08-03 重跑完才真的改變。中間那段時間，diff 看起來完全正常。**修復完成的判準是資料庫裡的值，不是 commit。**

### 線上知識庫現況

> **2026-08-04 16:50 補驗證批次已跑完，數字已收斂**（16:50 實查與組員 `b24635f`
> 回報一致）。同日曾三次實查得到三組不同的 tier 分布（tier_0 43 → 27 → 9），
> 那是批次進行中的中間態。**教訓保留：批次跑到一半時線上資料不是可引用的事實。**
> OSM 標籤回填仍在進行（28/100），`special_days` 剛開始有值（1/100）。

**已收斂（2026-08-04 16:50 service role 實查）**

| 指標 | 值 |
|---|---|
| 總筆數 | **100**（原始 45 ＋ TDX 55；`source_id` 前綴 NCA 15／YMS 15／NEI 15／TDX 55） |
| `verification_tier` | tier_2 **64**／tier_1 **27**／tier_0 **9** |
| `curated_zone` | 北海岸 **27**／陽明山 **35**／東北角 **34**／未分區 **4** |
| `city` | 100/100 有值 |
| `is_indoor` | true **29**／false **71** |
| 室內候選（下雨備案池） | 北海岸 **8**／陽明山 **10**／東北角 **11**——三區都夠用 |
| L0–L3 | L0 10／L1 18／L2 69／L3 3 |
| `embedding` 缺漏 | **0** |
| 同名重複 | **0**（2026-08-04 起由 `ingestToDB()` 自動攔截，不再靠人工比對） |
| `level_reasoning` | 100/100 |
| `conflict_analysis`／`blog_snippets` | **91/100**（= 100 − 9 筆 tier_0）。⚠️ 這是 DB 欄位，**不等於**畫面上的「部落格佐證」區塊，見已知問題 7 |
| 畫面上「部落格佐證」區塊有內容 | **45/100**（只有靜態 `poi-kb.ts` 那批） |
| 真實照片（`images` 非空） | **76/100**（TDX 55 ＋ 2026-08-04 回填 15 機器配對 ＋ 6 人工覆核）；其餘 24 筆顯示 `picsum.photos` 占位圖，見已知問題 6 |
| 平均 `reliability_score` | **0.705** |
| 來源類別數（TDX 已計入） | 1 類×9／2 類×13／3 類×27／4 類×27／5 類×24；**≥3 類者 78 筆** |

⚠️ **仍不要拿平均可信度跨批次比較**：tier_0 一律給 0.300 的固定值，所以這個平均主要反映 tier 組成而非品質。要比就分層比。

**刻意保留的 9 筆 tier_0**（組員 `b24635f` 的決定）：滿月圓、內洞、烏來台車、永和樂華夜市（以上未分區）、陽明山中山樓、天文科學教育館、凱達格蘭文化館、基隆山、勸濟堂。理由是**全部升級的話，「我們分得出哪些是驗過的」這個主張就沒有反例可展示**。
⚠️ 這 9 筆同時也是僅存的 `llm_source=null`（修復前匯入的殘留）——「保留 tier_0 當樣本」是刻意的，`llm_source` 是 null 則是舊資料的遺留，兩件事別混為一談。

⚠️ **「未分區」4 筆是誠實的狀態，不是 bug**：滿月圓、內洞、烏來台車、永和樂華夜市確實不在北海岸／陽明山／東北角三區內。在 `?? "北海岸"` 被移除之前，它們在畫面上會顯示為北海岸。

### 已知的資料品質問題

這幾項都**不是程式 bug**，是資料本身的狀態；使用者（和教授）在畫面上讀得到：

1. ~~**30/45 筆的「韌性分級理由」顯示「無法呼叫 LLM，預設 L2」**~~ → **2026-08-03 已解**（原始 45 筆 `llm_source=gemini`，`level_reasoning` 有值）。原本待拍板的呈現方式（`待討論事項_0709.md` #21）隨之失效。**2026-08-04 曾長出一個新的變形，已於 `b24635f` 修復**：`--skip-verify` 的輕量增補路徑（`buildTdxOnlyOutput()`）**沒有把 `llm_source` 寫進輸出**，於是 LLM 失敗時產出的物件與成功時長得一模一樣（每個欄位都被 `?? 預設值` 接住），線上一度有 43 筆 `llm_source=null`。同批也補上 BFR14 守門——**在此之前降級資料照樣入庫、還被算進「成功」**（實際發生過：新北市立淡水古蹟博物館行政中心，Gemini 與 Claude 都失敗仍入庫）。線上僅存的 9 筆 `llm_source=null` 就是刻意保留的那 9 筆 tier_0。
2. **B-1 的 OSM `space_type` 判定，多數筆數還吃不到標籤**：`space-type.ts` 與 69 項測試都好了，但線上 `osm_class`/`osm_type` 覆蓋率 16:50 是 **28/100**（當日由 8 → 21 → 28，回填仍在進行），其餘只能退回名稱關鍵字或 `default`（＝猜的，`space_type_source` 會如實標記，這點沒說謊）。回填完成前，`space_type` → α → 「下雨該不該換掉這個景點」這條鏈對多數景點仍是靠名字猜的。**這是目前最大的一項「已寫好、未生效」。**
3. **Google Places 例外日幾乎未回填**：C-1 補了 legacy Place Details 呼叫，線上 `metadata.special_days` 16:50 為 **1/100**（剛開始有值），颱風／國定假日的臨時公休目前多數景點判不出來。
4. **部落格佐證混入不相關內容**：曾有 90 則佐證中 11 則來自 YouTube，出現與景點完全無關的影片（擎天崗的佐證裡有勞斯萊斯開箱）。`youtube-search` 濾了業配，沒濾相關性。⚠️ 線上 `youtube_video_count > 0` 為 **0/100**，所以**這個問題現在不會出現在畫面上，但一旦重新啟用就會回來**——啟用前要先補相關性過濾（最低門檻：標題／描述須含景點名稱或別名）。
   ⚠️ **2026-08-04 更正**：本檔原本寫「因未設 `YOUTUBE_DATA_API_KEY` 而不啟用」——**這個原因不成立**，root `.env` 裡該金鑰有值。線上為 0 的真正原因待查（可能是匯入時設了 `DISABLE_YOUTUBE_VALIDATOR=1`、配額耗盡或金鑰失效）。**結論不變：實測上限 5 類，對外不得寫「7 類交叉驗證」**；但決賽被問「為什麼沒有 YouTube」時，要答得出真實原因。
4.5. **富貴角在 `poi_catalog.name` 是英文「Fuguei Cape Park」**（TDX 匯入時取到英文名），畫面上直接顯示英文。它同時是 tier_2／5 類來源／有真圖的優質樣本，很容易被挑進 demo 或截圖。2026-08-04 發現，未修。
4.6. **四組景點在 `poi_catalog` 裡重複成兩筆**（2026-08-04 做圖片覆核時發現，未修）：`YMS-002` 中山樓 ↔ `…000026` 陽明山中山樓（171m）、`YMS-005` 小油坑硫氣孔 ↔ `…000010` 小油坑遊憩區（199m）、`YMS-010` 冷水坑溫泉浴室 ↔ `…000009` 冷水坑（213m）、`NCA-006` 臺灣最北點 ↔ `…109642` Fuguei Cape Park（167m）。
   **`b24635f` 的跨來源去重擋的是「新匯入」，這四組是它上線之前就已在庫裡的**，所以擋不到——「匯入當下擋下重複入庫」不等於「庫裡沒有既存重複」。
   ⚠️ 最後一組**去重規則結構上抓不到**：「臺灣最北點」與「Fuguei Cape Park」正規化後永遠不會相等（一個中文別稱、一個英文名）。名稱相等這條規則對跨語言／別稱命名無效，這是規則本身的邊界，不是實作疏漏。
   ⚠️ **中山樓那組對 demo 有直接影響**：`陽明山中山樓` 正是「刻意保留的 9 筆 tier_0」之一。展示「我們分得出哪些驗過」時若被追問，會看到同一棟建築有兩筆、分屬不同分層。修復（哪一筆留、哪些欄位優先）是資料決策，依 `990ddcf`／`b24635f` 的既定立場由人決定，不自動合併。
4.7. **草山行館自 2025-11-11 起休館**（TDX 官方描述明載「自 114 年 11 月 11 日起暫停開放」），我方 `YMS-001` 仍是 `tier_2`、無任何休館標記。對一個主張「出發前確認不白跑」的系統是尷尬的一筆，但也是已知問題 3（`special_days` 1/100）的現成真實案例。
5. **`data/pois.ts` 有 27/45 筆名稱與 `poi_catalog` 不同**（那 45 筆的 ids 對齊；新的 55 筆 `data/pois.ts` 根本沒有）。應變頁已改為一律顯示資料庫名稱繞過，根因未解，待決定權威來源。
6. ~~**部分圖片與內容對不上**（擎天崗主圖是一杯檸檬薑茶）~~ → **2026-08-04 查明並部分修復。原本的描述低估了問題**：不是「部分圖片對不上」，是**原始 45 筆的 `images` 全部是空陣列（0/45）**，explore 的 `getPicsumUrl()`（`src/app/(app)/explore/page.tsx:234`）一律退回 `picsum.photos/seed/<id>/800/600`——**依 id 決定但與景點內容完全無關的隨機圖庫照**。擎天崗的檸檬薑茶不是抓錯一張圖，是 45 筆全部如此。TDX 匯入的 55 筆則是 55/55 都有官方圖。
   新增 `agents/poi-verifier/backfill-images.ts`（預設 dry-run，只寫 `images` 與圖片 metadata，不動 `is_indoor`/`level`/`reliability_score`/`conflict_analysis`/embedding，不呼叫 LLM），從 TDX 以「正規化名稱相同 **且** 距離 ≤500 公尺」雙條件配對，已套用線上：**原始 45 筆 0 → 15 有真圖，全庫 55 → 70/100**，15 張 URL 實測 HTTP 200 可載入，並記錄出處（`metadata.image_source` / `image_match_tdx_name` / `image_match_distance_m`）。
   **2026-08-04 第二輪：人工覆核再放行 6 筆**（`--approved`，走 `APPROVED_PAIRS` 常數，每筆記錄放行證據，`image_source` 標成 `tdx_human_reviewed` 以與機器嚴格配對分辨）：金山老街、北海岸遊憩探索館、麟山鼻木棧道、草山行館、福容大飯店 福隆、舊草嶺隧道。**合計原始 45 筆 21/45、全庫 76/100**，21 張 URL 實測 HTTP 200 可載入。放行證據是門牌或文獻而非「名字很像」（如北海岸遊憩探索館與白沙灣遊客中心門牌同為德茂里 33-6 號；舊草嶺隧道 3,809m 是**距離規則的合理例外**——隧道本身長 2,167m，500m 門檻假設點狀地物）。
   ⚠️ **剩下 24 筆是刻意不補的**：其中一半在 300 公尺內找得到「名字有點像」的 TDX 景點，但逐筆查過——陽明山花鐘最近的是 120m 外的**草山行館**、報時山棧道最近的是 34m 外的**國際終戰和平紀念園區**、南雅奇岩最近的是 49m 外的**南子吝步道**，全是不同的地方。放寬配對的後果不是補得多一點，是把別的景點的照片靜默掛上去。要續補請跑 `--review` 產生人工覆核清單，逐筆確認後寫進 `APPROVED_PAIRS`。
   ⚠️ TDX 是**分鐘級限流**。退避太短會讓排在最後的 `Hotel/新北市`（500 筆那批）整批拿不到，畫面上看起來像「TDX 沒有這家飯店」，其實是配額被前面的 Attraction 用光——實際害 NEI-001 漏補一輪。退避已調成 15s 起跳。
   2026-08-03 那條補查仍成立：TDX 官方圖說不能拿來做圖文相符查核，1,156 張圖中有說明的 695 張**100% 是出處標註**（「照片提供｜宜蘭分署」）。
7. **部落格佐證只存在於靜態 `src/data/poi-kb.ts` 的 45 筆**，TDX 的 55 筆一則都沒有（`src/lib/verification-detail.ts:19`：`blog_posts` 至今沒有 DB 欄位；`poi_catalog.blog_snippets` 存的是 extractInsights 的洞察，**不是**部落格文章列表，兩者別混）。所以本節「`conflict_analysis`／`blog_snippets` 91/100」講的是 DB 欄位，**不等於畫面上「部落格佐證」區塊有東西**——那一塊的覆蓋率是 45/100。

### 下一步如果要選一個做

~~把 `/api/contingency` 對 `data/pois.ts` 的依賴解掉~~ → **2026-08-02 已完成**（`2dd1fc0`）。
~~實跑一次 TDX 匯入寫進 Supabase 的端到端路徑~~ → **2026-08-04 已完成**（`990ddcf`，45 → 100 筆）。

~~補 `--skip-verify` 路徑的 `llm_source`（BFR13）~~ → **2026-08-04 已完成**（`b24635f`，同批補上 BFR14 守門與跨來源去重）。

現在建議：**跑完 OSM 標籤回填**（`backfill-osm-tags.ts`，16:50 覆蓋 28/100）。這是目前最大的一項「已寫好、未生效」——`space-type.ts` 與 69 項測試都好了，但 72/100 筆還吃不到標籤，`space_type` → α → 「下雨該不該換掉這個景點」對它們仍是靠名字猜的。這支不呼叫 LLM、不動 `is_indoor`/`level`、不花錢，預設 dry-run。動手前先確認組員沒有正在跑同一批。

之後：**重跑資料層 A/B benchmark**。真值已連續改變兩次（`is_indoor` 室內數 4/45 → 14/45 → 29/100），現有的 45%→95% 不能再引用，而這是教授 0722 直接要求的東西。等 OSM 回填也停了再跑。

之後：**重跑資料層 A/B benchmark**。真值已經連續改變兩次，現有的 45%→95% 不能再引用，而這是教授 0722 直接要求的東西。

---

## 10. 遇到問題時

- 架構細節不確定 → 看 `ARCHITECTURE.md`（從程式碼實際狀態拉出）
- 開發進度不確定 → 看 `DEVLOG.md`（最可信的進度紀錄）
- POI 驗證結果格式 → 看 `agents/poi-verifier/results/poi_verified.json` 任一筆
- 前端 POI 資料格式 → 看 `src/data/poi-kb.ts`（AUTO-GENERATED）
- 衝突分析格式 → 看 `agents/poi-verifier/results/poi_conflicts.json`
- 技術選型想翻案 → **先問使用者**，不要自己改 stack
- 朋友的 code 看不懂 → `git log --oneline` 看 commit history，或直接問使用者
