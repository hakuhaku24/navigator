# Navigator 開發日誌

> 記錄每次重要對話、決策與變更。最新在最上面。

---

## 2026-04-19｜UI 系統建立 + 前端頁面實作

### 背景與設計參考

- 參考 **MindTrip**（chat-first、地圖情緒感、極簡奢華）與 **WanderNest 風格截圖**（深綠主題、Sidebar 佈局、時間軸/地圖/列表三 Tab）
- 使用 Claude Design 產出 `Navigator-standalone.html`（7.4MB，深綠主題），作為設計稿參考（已加入 `.gitignore`）

### 重大決策

| 決策項目 | 決定 | 理由 |
|---------|------|------|
| 主色系 | 深森林綠 `#1B4332` / `#52B788` | 與設計稿一致，旅遊感強 |
| 導覽方式 | 桌面左側 Sidebar + 手機底部 Tab | 手機與網站並重（非純 mobile-first） |
| Redis | 不安裝 | Supabase Realtime 已能處理即時同步 |
| PWA | `@ducanh2912/next-pwa`（dev 停用） | 相容 Next.js 16 App Router |
| 拖拉排序 | `dnd-kit`（core + sortable + utilities） | 支援觸控 TouchSensor，行程拖拉需要 |

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

| 錯誤 | 原因 | 修復 |
|------|------|------|
| `next/image` hostname error | `picsum.photos` 未白名單 | `next.config.ts` 加 `remotePatterns` |
| Turbopack webpack conflict | `next-pwa` 注入 webpack config | `next.config.ts` 加 `turbopack: {}` |
| TypeScript `React.ReactNode` | 未 import React namespace | 改用 `import { type ReactNode }` |

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

## 下一步（待做）

### 高優先
- [ ] 整合 Supabase Auth（登入 / 登出 / 保護路由）
- [ ] 替換 mock 資料 → 真實 Supabase 查詢
- [ ] Landing page 色系統一為森林綠（目前仍用藍橙硬碼）
- [ ] PWA icon 製作（`public/icons/icon-192x192.png` + `512x512.png`）

### Navigator 獨有功能（尚未實作 UI）
- [ ] Tinder Swipe 投票頁（VETO / MUST-GO / LIKE）
- [ ] 投票結果頁（分數排名、VETO 淘汰顯示）
- [ ] 群組即時狀態（Supabase Realtime）
- [ ] 天氣 Swap/Switch 警示 UI
- [ ] 地圖整合（需設定 `NEXT_PUBLIC_MAPBOX_TOKEN`）
- [ ] dnd-kit 實際拖拉行程功能（目前只有 handle 圖示）

### 技術債
- [ ] `/group/new` 與 `(app)` layout 整合（目前各自獨立 Navbar）
- [ ] 行程卡片圖片換成真實資料（目前用 picsum.photos 占位）

---

## 2026-04-19｜專案初始化（前一個 commit）

- Next.js 16.2.4 + React 19 + TypeScript scaffold
- Supabase schema 設計
- TailwindCSS v4 + shadcn 設計系統（藍橙主題）
- Landing page 完成
- `/group/new`、`/group/[id]/join` 頁面完成

---

## 技術選型快查

| 層 | 技術 | 版本 | 備註 |
|----|------|------|------|
| Framework | Next.js App Router | 16.2.4 | Turbopack 預設啟用 |
| UI Runtime | React | 19.2.4 | |
| Styling | TailwindCSS | v4 | `@theme inline` 語法 |
| Components | shadcn (base-nova) | 4.3.0 | |
| State | Zustand | v5 | client UI state |
| Server State | TanStack Query | v5 | |
| DB / Auth | Supabase | — | PostgreSQL + pgvector + Realtime |
| Map | Mapbox GL JS + react-map-gl | 3.x / 8.x | 需 `NEXT_PUBLIC_MAPBOX_TOKEN` |
| Animation | Framer Motion | v12 | |
| Drag & Drop | dnd-kit | latest | core + sortable + utilities |
| PWA | @ducanh2912/next-pwa | latest | dev 停用，prod 啟用 |
| AI | Gemini 1.5 Flash（主）/ Claude Haiku（備援） | — | 走 Route Handler，不直接打前端 |
