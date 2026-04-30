# Navigator UI 設計原型

Tinder-style swipe、投票、行程編輯等互動流程的設計驗證原型。

## 功能模組

- **swipe-screen.jsx** — POI Tinder swipe（like / veto / pass）
- **results-screen.jsx** — 投票結果與行程草案展示
- **weather-screen.jsx** — 天氣變化觸發的備案建議（Swap / Switch）
- **ios-frame.jsx** — iPhone 14 外框（視覺化手機版本）
- **primitives.jsx** — UI 基礎元件（按鈕、卡片、badge）

## 檔案說明

| 檔案         | 用途                                   |
| ------------ | -------------------------------------- |
| `index.html` | 主要入口，整合所有模組                 |
| `data.js`    | Demo 資料：45 筆 POI、投票池、天氣場景 |
| `*.jsx`      | 各功能模組（React 元件）               |

## 設計參考

- **色彩系統**：深森林綠主題（`#1B4332` / `#52B788`）
- **動畫**：Framer Motion（swipe 轉場、卡片淡入淡出）
- **響應式**：手機優先（Bottom Tab 佈局）、桌面二級（Sidebar 預設隱藏）

## 狀態

原型已完成驗證。當前作為設計參考，不再活躍開發。

---

**更新日期**：2026-04-30  
**負責人**：Nicole Q
