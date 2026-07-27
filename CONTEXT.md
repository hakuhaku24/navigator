# Navigator — 領域詞彙（CONTEXT）

這份檔案只做一件事：把 Navigator 專案裡**容易一字多義、或會被說混**的核心詞彙釘死，讓程式碼、文件、簡報用同一套語言。不是規格書、不是待辦、不放實作細節——那些去 `CLAUDE.md`、`DEVLOG.md`、`docs/adr/`。

> 既有的 L0–L3 分級、Swap/Switch、Token 投票、漏斗檢索等框架詞彙定義在 `CLAUDE.md` §2，不在此重複。本檔專收**交付架構**這一輪 grill-with-docs 釐清出來的三個新詞。

## Language

### 交付架構（Delivery）

**Capability（核心能力）**：
與傳輸協定無關、實際產出價值的那個函式本身——例如 `searchPois()`（可信景點檢索）、`handleContingency()`（天氣應變）。它不知道自己是被 REST、MCP 還是 CLI 呼叫；換掉任何協定它都不動。專案的價值住在這裡，不在任何協定上。
_Avoid_: API、端點、服務、功能（這些都太泛，且容易讓人以為價值綁在某個協定上）

**Delivery adapter（交付轉接頭）**：
包在一個 Capability 外面、對應**某一種協定**的薄層。一支 REST route（`/api/plugin/poi/search`）是一個 adapter；一個 MCP tool（`search_verified_pois`）也是一個 adapter。adapter 只做「協定請求 ↔ Capability 呼叫」的轉換，**不含業務邏輯**。同一個 Capability 可以掛多個 adapter。
_Avoid_: 包裝層、wrapper、handler、接口（「協定即轉接頭」是本專案定調的說法，統一用 adapter／轉接頭）

**Plug-in surface（對外面）**：
所有暴露給**外部消費者**（旅遊平台、AI 助理）的 adapter 的集合——具體就是 `/api/plugin/*` 這個命名空間 ＋ MCP server。它與「內部面」相對：自家前端走的 `/api/poi/search`、`/api/contingency` 是內部路由，不屬於對外面、不受金鑰把關。兩者共用同一批 Capability，差別只在有沒有被 plug-in surface 包起來。
_Avoid_: 對外 API、公開 API、外部端點（講「面／surface」是為了強調它是一整組 adapter，不是單一端點；也為了跟「內部面」對舉）
