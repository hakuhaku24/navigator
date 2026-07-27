# 0001 — 交付架構：REST 為主 ＋ MCP 薄殼，不做 A2A

Status: accepted

## 決定

把 Navigator 的兩大核心能力（可信景點檢索、天氣應變）以「**一套 Capability、多種交付 adapter**」的方式對外交付：**REST plug-in 端點做成能跑的產品面**（`/api/plugin/*`，API 金鑰把關），**MCP 做薄殼**（stdio 本機，重用同兩個能力），**A2A 只寫進未來展望、本期不實作**。核心邏輯（`searchPois`、`handleContingency`）與協定解耦，任何 adapter 都只是轉接頭。

## 為什麼

- **第一消費者是競賽評審，不是真旅行社。** 評審會用商業角度看「能不能交付給平台使用」，所以要展示一個**可信的交付模式 ＋ 一個跑得起來的證明**，而不是把每種協定都焊死。後者違背教授「深入而非鋪廣、堪用即可」的指導。
- **兩個價值支柱都要能被外部呼叫到。** REST 兩支端點、MCP 兩個 tool，各自暴露「檢索」與「應變」，證明價值不綁單一入口。
- **協定即轉接頭。** 底層能力函式本來就與 Next 解耦（`searchPois` 為注入式 client、`handleContingency` 為 agent 端函式），所以「一套核心、多種交付」不是口號，是既有接縫允許的事實。這也正面回應教授 #20 的「解耦敘事」。

## 考慮過但沒選的

- **只做 REST，不做 MCP**：少一個支柱，無法對評審展示「AI 助理直接拿到已驗證景點、不產生幻覺地點」這個 MCP 才講得清楚的敘事。MCP 薄殼成本低（重用 REST），值得。
- **REST／MCP 都做到 production 級（含 A2A）**：鋪太廣、投工過重，且 A2A 需要對等 agent 互相發現／委派的場景，Navigator 目前是單向能力提供者，沒有這需求。留未來展望即可。
- **對現有 `/api/poi/search` 直接加金鑰**：會打斷自家前端（explore 頁從瀏覽器不帶金鑰呼叫）。故另開 `/api/plugin/*` 命名空間，內部路由保持開放——非破壞性。

## 後果

- **敘事與程式結構被定調**：demo 講「協定即轉接頭」，新增任何對外能力都照「Capability → adapter」的模式長（見 `PLUGIN_API.md` 文末「如何新增下一個 plug-in 端點」）。
- **MCP 走 stdio 本機、demo 不強制認證**：受控環境、無對外攻擊面；正式對外時改 remote HTTP ＋ OAuth，與 REST 金鑰同屬一套合作關係。
- **未改的既有落差不在本 ADR 範圍**：adapter 只忠實包住現有行為；contingency 目前仍綁靜態 45 筆 demo 景點（見 `CLAUDE.md` §9），升級到真 `poi_catalog` 是另一條獨立工作。
