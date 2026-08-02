# Navigator Plug-in API

把 Navigator 的兩大能力——**可信景點檢索**與**即時天氣應變**——以服務形式交付給旅遊平台（旅行社、OTA、訂房平台）串接。平台無需自建景點驗證系統，即可在自家產品中提供「已驗證、可追溯」的景點與應變建議。

> **設計原則：一個能力，多種交付。** 核心邏輯（`searchPois`、`handleContingency`）不變，對外只多一層轉接頭：
> - **REST**（本文件）：給傳統平台後台
> - **MCP**（見文末）：給 AI 助理 / LLM agent
>
> 對外面 = `/api/plugin/*`，由 `src/proxy.ts` 統一做金鑰把關與 CORS；內部路由（`/api/poi/search`、`/api/contingency`）保持開放給自家前端，不受影響。

---

## 認證

每個請求都要在 header 帶上金鑰：

```
x-api-key: <你的金鑰>
```

金鑰由 Navigator 發放（伺服器端 `PLUGIN_API_KEYS` 環境變數，逗號分隔可發多把）。缺少或無效 → `401 Unauthorized`。

Base URL（demo）：`http://localhost:3000`

---

## 端點一：可信景點檢索

```
POST /api/plugin/poi/search
```

**Request**（JSON）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `query` | string（可選） | 自然語言查詢，如「下雨天想找室內景點」。留空＝瀏覽全部（list 模式，零 LLM 成本）。 |
| `filter.region` | `北海岸`\|`陽明山`\|`東北角`（可選） | 限定地區 |
| `filter.is_indoor` | boolean（可選） | 只要室內景點 |
| `filter.level` | number[]（可選） | L0–L3 篩選 |
| `top` | number（預設 5） | 回傳筆數 |

**Response**（`SearchResponse`）

```json
{
  "results": [
    { "name": "...", "trust_score": 0.82, "sources": ["..."], "level": 2, "...": "..." }
  ],
  "query": "下雨天想找室內景點",
  "total": 5
}
```

回應欄位以 `src/lib/poi-search.ts` 的 `SearchResponse` 型別為準。

**驗證細節欄位**（2026-07-28 新增，選填）：每筆結果會另外帶三個欄位，讓串接方能呈現「為什麼這筆資料可信」：

| 欄位 | 說明 |
|---|---|
| `conflicts` | 多來源衝突分析：哪些欄位（名稱／地址／營業時間／是否營業中）各來源說法不同、系統採用哪個、依什麼裁決（來源層級／時間新近／並存） |
| `level_reasoning` | L0–L3 韌性分級的判斷理由 |
| `blog_posts` | 部落格／影片佐證來源（標題、網址、日期、摘要） |

⚠️ 這三項目前**尚未持久化到 `poi_catalog`**，由 route handler 從 `src/data/poi-kb.ts` 於伺服器端 join（見 `src/lib/verification-detail.ts`）。因此**只有既有 45 筆查得到**，未來 TDX 匯入的新景點這三個欄位會是 `undefined`——串接方請當作選填處理。

### `verification_tier` — 資料驗證層級（2026-08-03 新增）

**串接方最該讀的一個欄位。** 本服務同時提供兩種驗證強度的資料：政府單一來源批次匯入的廣度資料，與經過多來源交叉驗證的深度資料。兩者在同一張表、同一個回應裡，靠這個欄位區分。

| 值 | 意義 | 來源數 | 建議用法 |
|---|---|---|---|
| `tier_2` | 含官方網站或衝突已裁決 | ≥3 | 可直接引用，含衝突分析 |
| `tier_1` | 多來源交叉驗證通過 | ≥2 | 可直接引用 |
| `tier_0` | 政府單一來源匯入，未交叉驗證 | 1 | 可用於涵蓋率／搜尋，**不宜宣稱「已驗證」** |
| `unverified` | 驗證時 LLM 降級，智能欄位（`level`／`is_indoor`）是預設值而非判斷 | — | **不建議用於決策** |
| `null` | 尚未判定——2026-08-02 分層機制上線前入庫的資料 | — | 不等於未通過驗證，重跑驗證後才會有值 |

⚠️ **`null` 與 `tier_0` 不可混為一談**：前者是「還沒判定過」，後者是「判定過了，只有單一來源」。把兩者顯示成一樣，等於讓串接方無法回答「這批資料裡哪些是真的驗過的」——而那正是本服務存在的理由。

⚠️ 相關欄位 `reliability_score` 是**分數**（多可信），`verification_tier` 是**層級**（驗到什麼程度）。`tier_0` 因為只有單一來源，分數恆定偏低，**跨層級比較分數沒有意義**。

**範例**

```bash
curl -X POST http://localhost:3000/api/plugin/poi/search \
  -H "Content-Type: application/json" \
  -H "x-api-key: demo-key-abc123" \
  -d '{"query":"下雨天想找室內景點","filter":{"is_indoor":true},"top":3}'
```

---

## 端點二：即時天氣應變建議

```
POST /api/plugin/contingency
```

**Request**（JSON）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `poi_id` | string（必填） | 受影響景點 id，如 `"NCA-004"` |
| `rainfall_probability` | number 0–1（可選） | 覆寫降雨機率（模擬大雨情境）；不傳則走真實中央氣象署偵測 |
| `search_radius_km` | number（預設 20） | 備案搜尋半徑 |

**Response**（`ContingencyResponse`）

```json
{
  "triggered": true,
  "plan": {
    "original_poi": "...",
    "candidates": [{ "name": "...", "reason": "...", "trust_score": 0.8 }],
    "narrative_reflection": { "passed": true, "attempts": 1 }
  }
}
```

未達應變門檻時回 `{ "triggered": false, "reason": "..." }`。

**範例**

```bash
curl -X POST http://localhost:3000/api/plugin/contingency \
  -H "Content-Type: application/json" \
  -H "x-api-key: demo-key-abc123" \
  -d '{"poi_id":"NCA-004","rainfall_probability":0.85}'
```

---

## MCP 交付（給 AI 助理 / LLM agent）

除了 REST，同兩個能力也以 **MCP（Model Context Protocol）** 提供，讓 AI 助理（如 Claude Desktop）可直接把「可信景點檢索」「天氣應變」當工具呼叫——AI 因此只會拿到已驗證的景點，不會憑記憶產生幻覺地點。

- Server：`mcp-server/server.js`（stdio，零相依）
- 兩個 tool：`search_verified_pois`、`weather_contingency`
- 架構：**AI 助理 → MCP server → REST plug-in → poi_catalog**。MCP server 持有 API 金鑰（伺服器端），AI 助理拿不到，也只能呼叫定義好的 tool。

**Claude Desktop 設定**（`claude_desktop_config.json`）

```json
{
  "mcpServers": {
    "navigator": {
      "command": "node",
      "args": ["C:/AI project/tripplanner-github/mcp-server/server.js"],
      "env": {
        "NAVIGATOR_API_BASE": "http://localhost:3000",
        "NAVIGATOR_API_KEY": "demo-key-abc123"
      }
    }
  }
}
```

> 使用前先啟動 Next dev server（`npm run dev`）——MCP server 透過它取用兩個能力。

---

## 未來展望（本期不實作）

- **Remote HTTP MCP ＋ OAuth**：目前 MCP 走 stdio 本機（受控環境，demo 不需認證）。正式對外時改 remote HTTP，認證走 OAuth，與 REST 的金鑰同屬一套合作關係。
- **A2A（Agent-to-Agent）**：若 Navigator 未來需與其他自主 agent 互相發現、委派任務，再評估導入 A2A。目前為單向能力提供者，不需要。
- **計費 / 用量統計 / rate limiting**：發鑰匙的商業關係已就位，計量與計費為產品化階段工作。

---

## 如何新增下一個 plug-in 端點（模式）

1. 在 `src/lib/` 或 `agents/` 有一個 protocol-agnostic 的 **capability 函式**（如 `searchPois`）
2. **REST**：在 `src/app/api/plugin/<name>/route.ts` 薄包一層（re-export 內部 handler，或 import capability 直接呼叫）
3. **MCP**：在 `mcp-server/server.js` 的 `TOOLS` 加一個 tool 定義，並在 `callTool` 加一個 case 打對應的 REST 端點
4. middleware 的 `matcher: '/api/plugin/:path*'` 會自動涵蓋新端點，金鑰把關無需改動
