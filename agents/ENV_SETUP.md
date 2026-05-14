# Agents 環境變數設定指南

## 概述

Navigator 有兩個獨立的 Agent，各需配置自己的 `.env` 檔。

- **poi-verifier** — 批次驗證景點，檢查資訊真實性、爬取部落格評價、決定景點 Level 分級
- **contingency-handler** — 即時應變系統，偵測天氣/交通/場地風險，產出替代方案

---

## 共用變數（兩個 Agent 都需要）

| 變數                        | 服務                     | 來源                                    | 備註                   |
| --------------------------- | ------------------------ | --------------------------------------- | ---------------------- |
| `SUPABASE_URL`              | Supabase 資料庫連線      | https://supabase.com/dashboard/projects | 專案 API URL           |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 後端金鑰        | Supabase 控制台 Settings → API          | 權限最高，僅限後端使用 |
| `GEMINI_API_KEY`            | Google Gemini AI（主要） | https://ai.google.dev                   | 主要 LLM，成本較低     |
| `ANTHROPIC_API_KEY`         | Claude Haiku（備援）     | https://console.anthropic.com           | 結構化輸出備援         |

### 額度概況

| 變數           | 免費額度                                | 首超費率                                         |
| -------------- | --------------------------------------- | ------------------------------------------------ |
| **Supabase**   | 500 MB DB、5 GB 頻寬、50k MAU、2 個專案 | Pro：$25/月                                      |
| **Gemini API** | 免費層 (Token)                          | Gemini 2.5 Flash：輸入 $0.30／1M、輸出 $2.50／1M |
| **Claude API** | 無免費層，需信用卡                      | Haiku 4.5：輸入 $1.00／1M、輸出 $5.00／1M        |

---

## poi-verifier 額外需要

| 變數                     | 服務                  | 來源                                                    | 用途                                                                | 備註                                                            |
| ------------------------ | --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `GOOGLE_PLACES_API_KEY`  | Google Places API     | https://console.cloud.google.com                        | 景點基礎資料驗證（名稱、地址、營業時段）                            | 每月訂閱制（Starter $100+ 或隨用隨付）                          |
| `SERPER_API_KEY`         | Serper（Google 搜尋） | https://serper.dev                                      | 部落格遊記爬取（最新評價、入場感受）                                | 2,500 次免費；超出約 $50/月                                     |
| `SUPABASE_DEMO_GROUP_ID` | Supabase 資料庫       | Supabase UI → `travel_groups` 表，取得某筆資料列的 UUID | 關聯 POI 驗證結果到某個行程群組（執行 `npm run batch:ingest` 時用） | 必須是有效的 UUID，格式：`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `SUPABASE_DEMO_USER_ID`  | Supabase 資料庫       | Supabase Auth 或 `users` 表查詢                         | 關聯 POI 驗證結果到某個使用者（執行 `npm run batch:ingest` 時用）   | 與 SUPABASE_DEMO_GROUP_ID 配套使用                              |

### 使用流程

```
npm run verify       # 驗證單一景點（需所有共用 key + Google Places API）
npm run batch        # 批次驗證 45 筆（需所有共用 key + Google Places API + Serper 可選）
npm run batch:ingest # 驗證 + 直接寫入 Supabase（需全部變數）
npm run ingest       # 單獨 ingest（需 Supabase 三個變數）
```

---

## contingency-handler 額外需要

| 變數                    | 服務               | 來源                        | 用途                                 | 備註                 |
| ----------------------- | ------------------ | --------------------------- | ------------------------------------ | -------------------- |
| `CWA_API_KEY`           | 中央氣象署天氣 API | https://opendata.cwa.gov.tw | 天氣事件偵測（下雨、暴雨、極端溫度） | 政府免費；需註冊帳號 |
| `GOOGLE_PLACES_API_KEY` | Google Places API  | 同上                        | 場地可用性檢測（景點是否關閉）       | 同上                 |

#### CWA_API_KEY 向後相容

程式碼支援兩個別名：

```javascript
const CWA_API_KEY = process.env.CWA_API_KEY || process.env.WEATHER_API_KEY;
```

優先使用 `CWA_API_KEY`；若未設，則回退到 `WEATHER_API_KEY`。

### 使用流程

```
npm run demo         # 跑應變 demo（需所有 key）
npm run handle       # 觸發應變偵測
npm test             # integration test
```

---

## 快速設定

### 方案 A：分離式（推薦）

每個 Agent 資料夾內各放一個 `.env`：

```bash
agents/poi-verifier/.env
agents/contingency-handler/.env
```

**優勢**：各 Agent 獨立維護，便於複製 Agent 到其他專案。

### 方案 B：集中式

在專案根目錄 `.env.local`，兩個 Agent 都讀同一份。

Node.js 預設搜尋順序：

```
1. .env.local
2. .env
```

---

## 必填變數速查表

| Agent                   | 變數                      | 用途                 |
| ----------------------- | ------------------------- | -------------------- |
| **共用**                | SUPABASE_URL              | 資料庫連線           |
| **共用**                | SUPABASE_SERVICE_ROLE_KEY | 資料庫後端金鑰       |
| **共用**                | GEMINI_API_KEY            | 主 AI 模型           |
| **共用**                | ANTHROPIC_API_KEY         | Claude 備援          |
| **poi-verifier**        | GOOGLE_PLACES_API_KEY     | 景點驗證             |
| **poi-verifier**        | SERPER_API_KEY            | 部落格搜尋（可選）   |
| **poi-verifier**        | SUPABASE_DEMO_GROUP_ID    | Ingestion 目標群組   |
| **poi-verifier**        | SUPABASE_DEMO_USER_ID     | Ingestion 目標使用者 |
| **contingency-handler** | CWA_API_KEY               | 天氣偵測             |
| **contingency-handler** | GOOGLE_PLACES_API_KEY     | 場地檢測             |

---

## 驗證和測試

### 檢查環境變數是否已載入

```bash
# poi-verifier
cd agents/poi-verifier
node -e "console.log(process.env.GEMINI_API_KEY ? 'OK' : 'MISSING')"

# contingency-handler
cd agents/contingency-handler
node -e "console.log(process.env.CWA_API_KEY ? 'OK' : 'MISSING')"
```

### 執行試運行

```bash
# poi-verifier — 驗證單一景點
cd agents/poi-verifier
npm run verify

# poi-verifier — 批次驗證 + 寫入 Supabase
cd agents/poi-verifier
npm run batch:ingest

# contingency-handler — 跑 demo
cd agents/contingency-handler
npm run demo
```

### 如何取得 SUPABASE_DEMO_GROUP_ID 和 SUPABASE_DEMO_USER_ID

1. 登入 [Supabase 控制台](https://supabase.com/dashboard)
2. 選擇你的專案
3. 左側 → SQL Editor，執行：

```sql
-- 查看所有行程群組
SELECT id, name FROM public.travel_groups LIMIT 5;

-- 查看所有使用者
SELECT id, email FROM auth.users LIMIT 5;
```

4. 複製任一筆的 `id` 到 `.env` 的對應變數

---

## 常見問題

**Q: 為什麼 Gemini 和 Claude 都要設？**  
A: Gemini 是主 LLM（快、便宜），Claude 是備援；某些應用需要 Claude 的結構化輸出格式（JSON Schemas）更穩定。

**Q: SERPER_API_KEY 不設會怎樣？**  
A: poi-verifier 會略過部落格搜尋階段，只用 Google Places + OSM 驗證景點；評分和 Level 分級精度下降。

**Q: CWA_API_KEY 不設會怎樣？**  
A: contingency-handler 無法偵測天氣事件，只能檢測場地關閉；應變觸發率降低。

**Q: SUPABASE_DEMO_GROUP_ID / SUPABASE_DEMO_USER_ID 不設會怎樣？**  
A: `npm run batch:ingest` 和 `npm run ingest` 會失敗；但 `npm run batch` 單純驗證仍能運作。

**Q: 如何輪轉 API Key（例如 Gemini quota 用完）？**  
A: 換一個新 key，存進 `.env` 重新跑即可；無需改程式碼。

---

## 安全提示

- ⚠️ `.env` **絕對不要 commit** 進 git；用 `.gitignore` 排除
- ⚠️ 避免在 console.log 輸出 API key
- ⚠️ 定期檢查 API key 使用量，防止意外超支
- ⚠️ 若 key 外洩，立即在官方控制台重新生成
- ⚠️ SUPABASE_SERVICE_ROLE_KEY 和 SUPABASE_DEMO_USER_ID 是機敏資料，不應分享

---

## 額度和成本估算

### poi-verifier 一次跑 45 筆 POI（參考）

假設平均每筆 POI：

- **Gemini** 約 800 tokens（輸入 400 + 輸出 400）
  - 45 筆 = 36,000 tokens ≈ $0.02 USD
- **Google Places** 約 1-2 API calls／筆
  - 45 筆 = 45–90 calls ≈ $0 USD（免費額度內）

- **Serper** 約 1 call／筆（查部落格）
  - 45 筆 = 45 calls ≈ $0 USD（2,500 免費內）

**月度預估** — 若每週跑一次批次：

- Gemini：$0.08 USD／月（免費層內）
- Google Places：需訂閱（最低 Starter $100/月）
- Serper：需訂閱（若超過 2,500，約 $50/月）

### contingency-handler 每次應變（參考）

一次應變觸發約：

- **Gemini** 200–500 tokens ≈ $0.001–0.002 USD
- **CWA**：免費
- **Google Places**：1–2 API calls ≈ $0 USD（免費額度內）

**月度預估** — 若每次出遊觸發 3–5 次：

- Gemini：$0.01 USD／月（免費層內）
- 其他：免費

---

## 參考文檔

- API 額度詳情：[API_KEY_PRICING.md](../API_KEY_PRICING.md)
- 運行指南：[RUN_CODE_GUIDE.md](../RUN_CODE_GUIDE.md)
- poi-verifier README：[agents/poi-verifier/README.md](./poi-verifier/README.md)
- contingency-handler README：[agents/contingency-handler/README.md](./contingency-handler/README.md)
