# Navigator 開發日誌

> 記錄每次重要對話、決策與變更。最新在最上面。

---

## 2026-05-03｜poi-verifier 設計對齊與 README 重寫

### 今日變更

- 確認 `poi-verifier` 設計已經納入：部落格取證、最新部落格日期、來源分級、時間衰減、多準則排序、嚴格過濾。 
- 檢視並比對 `agents/contingency-handler` 設計，確保應變 Agent 已對齊教授建議中的 EV 公式、嚴格備案篩選與 Backup Plan 產出。 
- 重寫 `agents/poi-verifier/README.md`，讓 POI Agent 文件更清楚地呈現目前目標、架構與 API。 
- 更新 `DEVLOG.md` 與相關文檔，作為設計驗證與下一步開發的紀錄。

### 下一步

1. 優先實作 `agents/poi-verifier/src/` 核心模組：types、validators、enrichers、agent 邏輯。 
2. 進行 `agents/contingency-handler/` 應變 Agent 端到端設計，針對雨天與景點臨時關閉進行情境演練。 
3. 整理 `references/` 中的教授回饋與 slides，將「來源分級 + 時效標記 + 嚴格檢查」轉為實作規則。 
4. 準備可展示的 Demo case：大雨改室內備案、景點關閉即時替換。

---

## 2026-04-30｜項目結構調整 & POI 驗證 Agent 開發啟動

### 背景

- UI 設計原型已完成驗證 → 轉向開發 POI 驗證 Agent 專題
- 需要清晰的項目結構以支持平行開發：主應用、原型、Agent

### 重大決策

| 決策項目 | 決定                                                                        | 理由                                     |
| -------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| 項目結構 | `src/` (主應用) + `agents/poi-verifier/` (Agent) + `prototypes/` (設計參考) | 支持獨立開發、測試、部署                 |
| 開發焦點 | POI 驗證 Agent 優先                                                         | 解決「資訊不可信」痛點，為主應用奠定基礎 |
| 文件更新 | CLAUDE.md section 4 + README.md + DEVLOG                                    | 團隊統一認識                             |

### 新增/修改檔案

#### 文件

- `CLAUDE.md` — 更新 section 4（檔案地圖）& section 9（當前進度）
- `README.md` — 替換為 Navigator 專案概述（TW 繁體、emoji icon、結構圖）
- `DEVLOG.md` — 添加本條目

#### 結構

```
prototypes/
├── README.md                 # 原型集合說明
└── ui-demo/
    └── README.md            # UI 設計參考說明

agents/
├── poi-verifier/
│   ├── README.md            # POI Agent 詳細文件
│   ├── src/                 # Agent 實作（待開發）
│   └── tests/               # 測試（待開發）
```

### 下一步（待做）

1. **POI 驗證 Agent 實作**（優先級：高）
   - [ ] `agents/poi-verifier/src/types.ts` — 類型定義
   - [ ] `agents/poi-verifier/src/validators/` — Google Places + OSM 交叉驗證
   - [ ] `agents/poi-verifier/src/enrichers/` — L0-L3 自動分級、備案邏輯
   - [ ] `agents/poi-verifier/src/agent.ts` — Agent 主邏輯
   - [ ] Route Handlers — `/api/poi/verify` 等

2. **主應用集成**（優先級：中）
   - [ ] POI 驗證 API 集成
   - [ ] 45 筆 demo POI 數據導入 Supabase

3. **成本優化**（優先級：中）
   - [ ] Token 預算控制（目標：< NT$5/次）
   - [ ] Funnel retrieval 實作

---

### 背景與設計參考

- 參考 **MindTrip**（chat-first、地圖情緒感、極簡奢華）與 **WanderNest 風格截圖**（深綠主題、Sidebar 佈局、時間軸/地圖/列表三 Tab）
- 使用 Claude Design 產出 `Navigator-standalone.html`（7.4MB，深綠主題），作為設計稿參考（已加入 `.gitignore`）

### 重大決策

| 決策項目 | 決定                                     | 理由                                |
| -------- | ---------------------------------------- | ----------------------------------- |
| 主色系   | 深森林綠 `#1B4332` / `#52B788`           | 與設計稿一致，旅遊感強              |
| 導覽方式 | 桌面左側 Sidebar + 手機底部 Tab          | 手機與網站並重（非純 mobile-first） |
| Redis    | 不安裝                                   | Supabase Realtime 已能處理即時同步  |
| PWA      | `@ducanh2912/next-pwa`（dev 停用）       | 相容 Next.js 16 App Router          |
| 拖拉排序 | `dnd-kit`（core + sortable + utilities） | 支援觸控 TouchSensor，行程拖拉需要  |

### 新增套件

```
@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
@ducanh2912/next-pwa
```

### 新增 / 修改檔案

#### 設計系統

- `src/app/globals.css` — 色彩 token 全換為森林綠系：
  - `--primary`: `oklch(0.27 0.075 155)` → `#1B4332`
  - `--accent`: `oklch(0.68 0.115 152)` → `#52B788`
  - `--background`: `oklch(0.985 0.004 90)` → `#faf9f5` 暖白
  - Sidebar token 改為深綠背景 + 白色文字

#### PWA 設定

- `next.config.ts` — 加入 `withPWA`、`turbopack: {}`（解決 Next.js 16 Turbopack 衝突）、`images.remotePatterns`（picsum.photos 白名單）
- `public/manifest.json` — PWA 安裝設定（主題色 `#1B4332`）
- `src/app/layout.tsx` — 加入 `manifest`、`appleWebApp` metadata

#### 版面元件

- `src/components/layout/AppSidebar.tsx` — 桌面左側深綠 Sidebar，含 Logo、5 個導覽項、使用者資訊
- `src/components/layout/BottomNav.tsx` — 手機底部 Tab Bar（5 項）

#### 認證後 App 路由群組 `(app)`

- `src/app/(app)/layout.tsx` — Sidebar + BottomNav 包裝 layout
- `src/app/(app)/dashboard/page.tsx` — 儀表板：4 個統計卡 + 行程卡片格 + 空狀態插圖
- `src/app/(app)/trip/[id]/page.tsx` — 行程詳細：時間軸 / 地圖 / 景點列表 三 Tab，含 dnd-kit 拖拉手把、站間交通時間
- `src/app/(app)/ai-plan/page.tsx` — AI 規劃三步驟表單：目的地 → 興趣標籤 → 預算/風格
- `src/app/(app)/explore/page.tsx` — 佔位頁
- `src/app/(app)/collection/page.tsx` — 佔位頁
- `src/app/(app)/settings/page.tsx` — 佔位頁

### Bug 修復

| 錯誤                         | 原因                           | 修復                                 |
| ---------------------------- | ------------------------------ | ------------------------------------ |
| `next/image` hostname error  | `picsum.photos` 未白名單       | `next.config.ts` 加 `remotePatterns` |
| Turbopack webpack conflict   | `next-pwa` 注入 webpack config | `next.config.ts` 加 `turbopack: {}`  |
| TypeScript `React.ReactNode` | 未 import React namespace      | 改用 `import { type ReactNode }`     |

### 目前路由結構

```
/                    → Landing page（藍橙主題，待統一）
/dashboard           → 我的行程（主頁）
/trip/[id]           → 行程詳細頁
/ai-plan             → AI 規劃
/explore             → 探索景點（佔位）
/collection          → 收藏清單（佔位）
/settings            → 設定（佔位）
/group/new           → 建立行程（舊流程，待整合）
/group/[id]/join     → 加入群組（舊流程，待整合）
```

---

## 2026-04-30｜教授回饋整理與方向調整 (第一版)

### 核心回饋重點

教授將系統定位為**「AI 時代的旅行社」**，核心價值在於資訊**可信度**與**應變能力**，而非技術複雜度。主要強調：

1. **從架構轉向實作**：停止堆砌新功能，改為驗證 POI 驗證 Agent 與應變邏輯的實際可行性
2. **深入 2-3 個模組**：教授明確建議專注於「景點驗證」與「下雨應變」，避免包山包海
3. **AI 邏輯必須準確**：旅遊系統失誤一次（如帶用戶去倒閉餐廳）就會喪失信任，精確性優於複雜度
4. **簡化 OR 模型**：避免過度複雜的成本計算；重點應放在「時間串接」與「多準則決策」

### 下週實作優先順序（Prof. 建議）

#### 第一階段：POI 驗證實作 (必做)
- 針對一個示範區（如大溪）實際驗證 50 個景點
- 執行 Agent 交叉驗證邏輯（Google Places + OSM + 部落格抓取）
- 產出 JSON 驗證報告，標註「官方確認」vs「部落客推薦」
- 確認 Token 成本 < NT$5/次查詢（Funnel retrieval 優化）

#### 第二階段：應變情境演練 (核心差異化)
- 實作 2 個極端應變案例：
  1. **下大雨場景**：自動推薦「路線上」的室內替代景點（需地理相近性檢查）
  2. **景點臨時關閉**：從備案池篩選，避免導向更糞的結果
- 實現「嚴格檢查機制」：人潮暴增、開店時間不多、無最新資訊 → 直接刪除
- 測試 Context Engineering：給 AI 充分的背景資訊（位置、人數、天氣、原景點）再生成建議

#### 第三階段：Demo 原型展示
- 不講技術細節，直接展示案例：
  > 「原本規劃去 A 景點，突然下大雨，系統自動推播 B 咖啡廳（室內、距離 500m），用戶一鍵確認更換。」
- 修正 OR 模型公式，確保權重與準則有明確商業邏輯支持

### 信度架構確認（已滿足）

✅ 五層可信度架構已在架構書中定義：
- 來源分級（官方 > 半官方 > 部落格）
- 時間衰減自動標記
- 交叉比對提升信度
- 群眾回報驗證
- 透明呈現（✅官方確認 / ⚡近期更新 / ⚠建議確認）

### 本週調整方向

**不做**：
- 新增功能頁面（Explore、Collection 先留佔位）
- Landing page 色系統一（不是核心)
- PWA icon 製作（Dev 階段可暫停）

**改做**：
- POI 驗證 Agent 端到端實作（包含真實 API 呼叫測試）
- 應變 SOP 邏輯驗證（嚴格檢查機制 + 排序演算法）
- Prompt 範本設計（Context Engineering）

---

## 下一步（高優先）

### 第一週：POI 驗證 Agent 實作

- [ ] `agents/poi-verifier/src/validators/` — Google Places + OSM 交叉驗證
- [ ] `agents/poi-verifier/src/enrichers/` — L0-L3 自動分級邏輯
- [ ] 大溪示範區驗證（50 景點真實驗證報告）
- [ ] API Route Handlers — `/api/poi/verify`

### 第二週：應變邏輯實作

- [ ] 嚴格檢查機制（人潮、開店時間、資訊時效）
- [ ] 多準則加權排序（動態參數選用）
- [ ] 天氣應變 Prompt 範本（Context Engineering）
- [ ] 應變 SOP 邏輯測試（2 個案例）

### 第三週：整合與展示準備

- [ ] 整合 Supabase Auth（登入 / 登出 / 保護路由）
- [ ] 45 筆 demo POI 導入並驗證
- [ ] 群組即時狀態（Supabase Realtime）
- [ ] Demo 案例打包（視覺化展示）

### 暫停（非核心）

- [ ] Landing page 色系統一
- [ ] PWA icon 製作
- [ ] `/group/new` 與 `(app)` layout 整合
- [ ] Tinder Swipe 投票頁（UI 完成，功能後續）
- [ ] 地圖整合（暫留佔位）

---

## 2026-04-19｜專案初始化（前一個 commit）

- Next.js 16.2.4 + React 19 + TypeScript scaffold
- Supabase schema 設計
- TailwindCSS v4 + shadcn 設計系統（藍橙主題）
- Landing page 完成
- `/group/new`、`/group/[id]/join` 頁面完成

---

## 技術選型快查

| 層           | 技術                                         | 版本      | 備註                             |
| ------------ | -------------------------------------------- | --------- | -------------------------------- |
| Framework    | Next.js App Router                           | 16.2.4    | Turbopack 預設啟用               |
| UI Runtime   | React                                        | 19.2.4    |                                  |
| Styling      | TailwindCSS                                  | v4        | `@theme inline` 語法             |
| Components   | shadcn (base-nova)                           | 4.3.0     |                                  |
| State        | Zustand                                      | v5        | client UI state                  |
| Server State | TanStack Query                               | v5        |                                  |
| DB / Auth    | Supabase                                     | —         | PostgreSQL + pgvector + Realtime |
| Map          | Mapbox GL JS + react-map-gl                  | 3.x / 8.x | 需 `NEXT_PUBLIC_MAPBOX_TOKEN`    |
| Animation    | Framer Motion                                | v12       |                                  |
| Drag & Drop  | dnd-kit                                      | latest    | core + sortable + utilities      |
| PWA          | @ducanh2912/next-pwa                         | latest    | dev 停用，prod 啟用              |
| AI           | Gemini 1.5 Flash（主）/ Claude Haiku（備援） | —         | 走 Route Handler，不直接打前端   |
