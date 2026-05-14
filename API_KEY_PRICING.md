API Key 額度說明（資料截至 2025 年 5 月，以官網為準）

---

NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
服務：Supabase（PostgreSQL + pgvector + Auth + Realtime）
官方定價頁：https://supabase.com/pricing

免費方案（Free）：
- 資料庫儲存：500 MB
- 頻寬（egress）：5 GB／月
- API 請求：無限制
- 認證使用者（MAU）：50,000 人／月
- Realtime 同時連線：200 條
- Edge Functions 呼叫：500,000 次／月
- 檔案儲存（Storage）：1 GB
- 活躍專案上限：2 個
- ⚠️ 非活躍超過 1 週會自動暫停（Pause）

付費（Pro，$25 USD／月）：
- 資料庫：8 GB 含括，超出 $0.125／GB
- 頻寬：250 GB，超出 $0.09／GB
- MAU：100,000 人含括，超出 $0.00325／人
- Realtime：500 條含括，超出 $10／1,000 條

---

NEXT_PUBLIC_MAPBOX_TOKEN
服務：Mapbox GL JS（地圖渲染）
官方定價頁：https://www.mapbox.com/pricing

免費配額（每月）：
- 地圖載入（Web）：50,000 次
- Geocoding API：100,000 次
- Directions API：100,000 次
- Static Images API：50,000 次
- Search Box API：500 sessions（⚠️ 屬試行預覽定價，非永久免費；正式費率為 $11.50／1,000 sessions）

超出免費額度費率（以 1,000 次為單位，USD）：
- 地圖載入：$5.00（5–10 萬）→ $4.00（10–20 萬）→ $3.00（20–100 萬）
- Geocoding：$0.75（10–50 萬）→ $0.60（50–100 萬）
- Directions：$2.00（10–50 萬）→ $1.60（50–100 萬）

---

GOOGLE_PLACES_API_KEY
服務：Google Places API (New)
官方定價頁：https://developers.google.com/maps/documentation/places/web-service/usage-and-billing

⚠️ 注意：2025 年 2 月後 Google 已改為訂閱制，原 $200／月信用額度方案已調整。

訂閱方案（參考）：
- Starter：$100 USD／月
- Essentials：$275 USD／月（含 100,000 次／月）
- Pro：$1,200 USD／月

SKU 分層（影響費率）：
- Essentials 層：Autocomplete、Place IDs Only
- Pro 層：Nearby Search、Place Details、Text Search
- Enterprise 層：含 Photos、Atmosphere 欄位

節費技巧：
- 使用 Field Masks 只取所需欄位
- Autocomplete + Place Details 搭配 session token 可省費用

---

SERPER_API_KEY
服務：Serper（Google 搜尋結果 API，用於 POI 驗證爬取部落格資料）
官方網站：https://serper.dev

免費方案：
- 2,500 次免費查詢（無需信用卡）
- 支援 Web、Images、News、Maps、Places 等查詢類型

付費方案：
- ⚠️ 定價頁面（serper.dev/pricing）目前無法存取，請至官網確認最新方案
- 社群參考：約 $50 USD／月含 50,000 次，或按量 ~$0.001／次

---

GEMINI_API_KEY
服務：Google Gemini API（主要 AI 模型）
官方定價頁：https://ai.google.dev/pricing

⚠️ Gemini 1.5 Flash 已從定價頁完全下架（非僅標示棄用），任何仍引用該模型的程式碼或設定請立即更換。

Gemini 2.0 Flash（過渡方案，2026/6/1 關閉）：
- 免費層：輸入／輸出 Token 免費；Google Search grounding 每日 500 次免費
- 付費層輸入：$0.10／1M tokens
- 付費層輸出：$0.40／1M tokens
- Google Search 超出免費：$35／1,000 次

Gemini 2.5 Flash（建議長期使用）：
- 免費層：Token 免費；Google Search 每日 500 次免費
- 付費層輸入：$0.30／1M tokens
- 付費層輸出：$2.50／1M tokens

速率限制：依帳戶 Tier 動態設定，需至 Google AI Studio 控制台查看個人上限。

---

ANTHROPIC_API_KEY
服務：Anthropic Claude API（備援 AI 模型，結構化輸出用）
官方定價頁：https://platform.claude.com/docs/en/about-claude/pricing
（注意：www.anthropic.com/pricing 已導向消費者頁面，開發者 API 定價請查上方連結）

⚠️ 無免費方案，需填信用卡後按量計費。

主要模型費率：
- Claude Haiku 4.5（claude-haiku-4-5）：輸入 $1.00／1M tokens，輸出 $5.00／1M tokens，Context 200k
- Claude Sonnet 4.6（claude-sonnet-4-6）：輸入 $3.00／1M tokens，輸出 $15.00／1M tokens，Context 1M
- Claude Opus 4.7（claude-opus-4-7）：輸入 $5.00／1M tokens，輸出 $25.00／1M tokens，Context 1M

Haiku 4.5 優化選項：
- Prompt Caching 寫入（5 分鐘 TTL）：$1.25／1M tokens
- Prompt Caching 寫入（1 小時 TTL）：$2.00／1M tokens
- Prompt Caching 讀取（命中）：$0.10／1M tokens（大幅省費）
- Batch API：省 50%（輸入 $0.50／1M，輸出 $2.50／1M）

速率限制：依帳戶消費累積提升 Tier，新帳戶從較低限額開始，需至 Console 查看個人上限。

---

CWA_API_KEY
服務：中央氣象署開放資料平台（天氣 API）
官方平台：https://opendata.cwa.gov.tw
開發者手冊：https://opendata.cwa.gov.tw/devManual

免費方案：
- 政府免費開放資料，無費用
- 需至官網註冊帳號取得 Authorization Key

常用資料集（Navigator 相關）：
- F-C0032-001：一般天氣預報（縣市級）
- F-D0047-xxx：各縣市鄉鎮天氣預報
- O-A0001-001：自動氣象站即時觀測資料

API 呼叫格式：
https://opendata.cwa.gov.tw/api/v1/rest/datastore/{datasetId}?Authorization={CWA_API_KEY}

速率限制：
- ⚠️ 官方文件未明確公開數字，開發者社群回報約每秒 1–5 次請求
- 建議加入請求間隔（100–500ms），避免觸發限流
- 請登入後查閱開發者手冊確認最新限制
