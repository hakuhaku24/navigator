# Prototypes & Design Reference

This folder contains design prototypes and UI reference implementations for Navigator.

## Contents

- **ui-demo/** — UI 設計原型，使用 React（JSX）+ Tailwind CSS 實現 Tinder-style swipe、投票、行程編輯等互動
  - 參考 MindTrip（chat-first、地圖情緒感）和 WanderNest（深綠主題、Sidebar 佈局）
  - 已驗證視覺設計與互動流程
  - 用途：設計參考，主應用開發時可參考其 UI 邏輯與響應式設計

## 設計決策

| 項目     | 決定                            | 理由                          |
| -------- | ------------------------------- | ----------------------------- |
| 主色系   | 深森林綠 `#1B4332` / `#52B788`  | 與旅遊主題、環保理念契合      |
| 導覽方式 | 桌面左側 Sidebar + 手機底部 Tab | 手機與網站並重                |
| 動畫框架 | Framer Motion v12               | Tinder-style swipe 與轉場動畫 |
| 拖拉排序 | dnd-kit                         | 支援觸控 TouchSensor          |

## 使用方式

預覽設計原型：在瀏覽器中開啟 `ui-demo/index.html`（需要本地伺服器或直接 open 可能有跨域問題）。

```bash
# 簡易預覽
cd prototypes/ui-demo
npx http-server
```

## 狀態

✅ 已完成驗證，不再活躍維護。主應用開發時可參考邏輯與佈局。
