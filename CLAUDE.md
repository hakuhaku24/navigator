# Navigator（領航者）— Claude 協作記憶

> 這份檔案是 repo 的共用 context。新開的 Claude Code / Cowork 對話第一件事就是把這整份讀完，再動手。
> 放置位置：repo 根目錄（`C:\AI project\tripplanner-github\CLAUDE.md`）。
> 相關參考文件放在 `C:\AI project\tripplanner\`（Cowork 掛載的 workspace）。

---

## 1. 專案一句話

Navigator（領航者）是一套給多人旅遊的「智能共識 + 即時韌性」規劃系統。這是一個資管系畢業專題，不是商業產品。

解決三個真實痛點：
1. 多人出遊決策難收斂（誰要去哪、誰不想去哪）
2. 行程遇到天氣/交通突發狀況時，沒有備案邏輯
3. 網路上的景點資訊真假難辨、品質不一

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
- L1 彈性錨點：主要目的，盡量保留但可平移時段
- L2 條件變動：沿路順遊，天氣一變就可換
- L3 水位調節：填空 buffer，最容易被 swap 掉

**Token 投票制**（群體共識的核心）
- 每人固定拿：1 張 VETO（否決票，權重 = −∞）、2 張 MUST-GO（+5）、無限張 Like（+1）
- 候選景點排序 = Σ(票 × 權重)，VETO 直接讓該點出局
- 目的：避免「禮貌性點讚」讓沒人真的想去的景點被排進行程

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
- **Architect Agent**：產出初版行程骨架（多人偏好 → 候選池 → 草案）
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

**Cowork workspace（`C:\AI project\tripplanner\`）— 文件與資料**
```
Navigator_MVP_架構書.docx    完整 12 章架構書（Traditional Chinese, 837 段）
data/
  poi_raw.json                45 筆使用者原始景點資料
  poi_enriched.json           對應架構 schema 後的 45 筆 POI（主要讀這份）
  poi_stats.json              分布統計（3 區 × 15 筆，L0/L1/L2/L3 分布）
  poi_map_preview.html        Leaflet 視覺化（color coded by Level）
CLAUDE.md                     本檔（複製到 repo 根目錄後刪這份亦可）
HANDOFF_PROMPT.md             新對話起手 prompt 模板
```

**Repo（`C:\AI project\tripplanner-github\`）— 實際程式碼**
（朋友先起的 scaffold，實際結構請現場 `ls` 確認，不要假設）

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

**In scope**
- 建立行程房間（多人加入）
- Tinder swipe 挑景點（用 45 筆 demo 資料）
- 投票收斂（VETO / MUST-GO / Like）
- 自動產草案行程（Architect Agent）
- 地圖視覺化
- 拖拉編輯行程
- 天氣觸發 Swap 建議（Strategy Agent，一個 demo scenario 就好）

**Out of scope（期末不做）**
- Reels 影片解析
- Email 票券解析
- 真實交通即時 API（寫 mock 即可）
- 商家串接、付款
- 社交動態、關注

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
- 不要把 VETO 當一般負票處理（是硬 veto，不是加權 −5）
- 不要假設使用者會旋轉螢幕到橫向

---

## 9. 當前進度

- 架構書完成（12 章、42.7 KB docx）
- 45 筆 POI 資料已清洗、驗證、視覺化
- Repo scaffold 由朋友（hakuhaku24）先起，尚未深入檢視
- **下一步**：checkout repo 現狀 → 對照架構書 L2/L3 → 決定第一個 PR 要先做哪個模組（目前候選：(a) POI 卡片 + Tinder swipe，(b) 行程房間建立流程，(c) 45 筆資料 seed 進 Supabase）

---

## 10. 遇到問題時

- 架構細節不確定 → 翻 `Navigator_MVP_架構書.docx`（12 章，有目錄）
- POI 資料格式不確定 → 看 `data/poi_enriched.json` 任一筆
- 視覺驗證 POI 分佈 → 開 `data/poi_map_preview.html`
- 技術選型想翻案 → **先問使用者**，不要自己改 stack
- 朋友的 code 看不懂 → `git log --oneline` 看 commit history，或直接問使用者