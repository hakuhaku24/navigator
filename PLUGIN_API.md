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
