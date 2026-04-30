# 項目結構設置指南

## 狀態

✅ 文件已更新（CLAUDE.md, README.md, DEVLOG.md）
⏳ 待完成：目錄創建 + git commit

## 需要創建的目錄結構

```bash
# 使用以下命令創建目錄
mkdir -p prototypes/ui-demo
mkdir -p agents/poi-verifier/src
mkdir -p agents/poi-verifier/tests

# 或直接用 git 命令
git add -A
git commit -m "refactor: 項目結構調整 & POI 驗證 Agent 開發啟動

- 將 UI 原型集合到 prototypes/ui-demo/
- 新增 agents/poi-verifier/ 用於 POI 驗證 Agent 開發
- 更新 CLAUDE.md: section 4 (檔案地圖) & section 9 (當前進度)
- 替換 README.md 為 Navigator 專案概述
- 添加 DEVLOG 新條目 (2026-04-30)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## 隨後手動步驟

1. 複製設計原型到 `prototypes/ui-demo/`（如果有的話）
2. 開始在 `agents/poi-verifier/src/` 實作 POI 驗證 Agent
3. 在 main `src/` 中新增 `/api/poi/verify` Route Handler

## 驗證結構

```bash
tree -L 2 -I node_modules
```

應該看到：

```
.
├── src/
├── agents/
│   └── poi-verifier/
│       ├── README.md
│       ├── src/
│       └── tests/
├── prototypes/
│   ├── README.md
│   └── ui-demo/
│       └── README.md
├── CLAUDE.md (已更新)
├── README.md (已更新)
└── DEVLOG.md (已更新)
```
