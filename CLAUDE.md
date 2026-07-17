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

**Agentic AI 架構**（從最初設計的 10 agent 縮為 2 核心 + 事件驅動）

- **Architect Agent**：產出初版行程骨架（使用者選點 → 候選池 → 草案；0716 起輸入改單人選點）
- **Strategy Agent**：事件觸發時決定要 Swap 還 Switch
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
├── supabase/                     # Supabase migrations & config
├── public/                       # 靜態資源
│
├── CLAUDE.md                     # Claude 協作記憶（本檔）
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
| `src/app/group/new/`、`src/app/group/[id]/join/`、`src/components/JoinModal.tsx` | ❌ 已砍 | 多人房間（0716） |
| `src/app/(app)/trip/[id]/vote/` | ❌ 已砍 | 代幣投票（0716） |
| `src/app/(app)/trip/[id]/results/` | ❌ 已砍 | 投票收斂結果（0716） |
| `src/app/(app)/trip/[id]/explore/` | 🧊 凍結 | Tinder swipe（下游投票已砍） |
| `src/app/(app)/ai-plan/` | 🧊 凍結 | 通用 AI 行程生成，不展示 |
| `src/app/(app)/collection/`、`src/app/(app)/settings/`、`src/app/(app)/dashboard/` | 🧊 凍結 | App 外殼，不投工時 |
| `agents/contingency-handler/src/detectors/traffic-detector.ts`、`venue-detector.ts`、`group-detector.ts` | 🧊 stub 永凍 | demo 只做天氣情境 |
| `src/lib/supabase/*` 的 Auth 相關擴充 | 🧊 延後 | Auth 賽後再做（現有 client/server helper 可繼續用於 DB 存取） |

> 注意：`src/app/(app)/explore/`（驗證景點庫，含衝突 UI）是**主線核心，不在凍結清單**——別跟 `trip/[id]/explore`（swipe 頁）搞混。
> 完整決策脈絡見 `0716_減法決策與不做清單.md`。

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

> 最後更新：2026-07-09。最可信的進度來源是 `DEVLOG.md`。

**Phase 1: UI 原型驗證 ✅ 完成**

- 45 筆 POI 資料清洗、驗證、視覺化
- UI 設計原型驗證完畢 → 移至 `prototypes/ui-demo/`

**Phase 2: Agent 核心實作 ✅ 完成**

- `agents/poi-verifier/`：6 個驗證器（Google/OSM/Blog/官網/PTT/YouTube）、衝突解析器、canonical 正規化、TDX 批次入庫 Pipeline、RAG Reranker、Hybrid Search
- `agents/contingency-handler/`：4 類偵測器、EV 決策、嚴格篩選、LLM 應變計畫生成
- Demo 場景 5 個（驗證 ×3 + RAG 應變 ×2）
- 45 筆 POI 批次驗證完畢，衝突分析（32/45 有衝突）完畢
- `src/app/(app)/explore/page.tsx`：驗證景點庫，含多來源衝突 UI

**Phase 3: 前後端整合 🔧 進行中**

已解決：
- ✅ **Supabase 連線恢復正常**（2026-07-09 確認：DNS 解析、REST API 皆正常回應）
- ✅ **migration 008 已套用**（`poi_catalog` 已有 `category`/`city`/`zip_code`/`curated_zone`/`hours`/`phone`/`images`/`website_url`/`source_update_time` 9 欄，皆為 NULL-able，2026-07-09 用 REST API 直接查 schema 確認）

卡住的事：
- ⚠️ **Route Handler 未串接前端**（`src/app/api/poi/search/route.ts` 已完成，但前端沒有任何頁面呼叫它；RAG/Hybrid Search 只在 agent 內部與 API 層可用）
- ⚠️ **新欄位尚未有資料**：目前 `poi_catalog` 僅 45 筆（跟 migration 008 前一樣），新欄位全是 NULL——schema 就緒，但還沒真的匯入/回填資料。TDX OAuth 憑證已驗證可用（2026-07-09 token endpoint 回 200），`agents/poi-verifier/ingest-from-tdx.ts` dry-run 正常，可以真的執行，但屬於會寫入正式資料庫的操作，且該匯入多大範圍跟 `待討論事項_0709.md` #1（資料涵蓋範圍拍板）綁在一起，建議先決議範圍再跑。

待討論後才能動工：
- TDX 正式匯入規模（等 `待討論事項_0709.md` #1 拍板）

可以繼續做的（2026-07-16 減法後）：
- explore/weather 等前端接上 `/api/poi/search`（含引用來源/信度呈現）
- Contingency Handler 接成 API route + weather 頁去 mock 化（主打 demo）
- explore 驗證庫加「加入行程」選點功能（單人行程來源）
- ingestion signals bug 修復（`category`/`images`/`website_url` 漏傳，回填前必修）

~~已移出範圍（2026-07-16）：Supabase Auth 整合、vote 前後端連接、Realtime 前端觀察器~~ → 見 `0716_減法決策與不做清單.md`

---

## 10. 遇到問題時

- 架構細節不確定 → 看 `ARCHITECTURE.md`（從程式碼實際狀態拉出）
- 開發進度不確定 → 看 `DEVLOG.md`（最可信的進度紀錄）
- POI 驗證結果格式 → 看 `agents/poi-verifier/results/poi_verified.json` 任一筆
- 前端 POI 資料格式 → 看 `src/data/poi-kb.ts`（AUTO-GENERATED）
- 衝突分析格式 → 看 `agents/poi-verifier/results/poi_conflicts.json`
- 技術選型想翻案 → **先問使用者**，不要自己改 stack
- 朋友的 code 看不懂 → `git log --oneline` 看 commit history，或直接問使用者
