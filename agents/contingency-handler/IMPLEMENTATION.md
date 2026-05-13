# Contingency Handler — 實作報告與待解決問題

> 日期：2026-05-12
> 對應設計文件：[src/contingency-handler腳本附prompt.md](src/contingency-handler腳本附prompt.md)
> 範圍：依照腳本完成端對端 prototype，含真實 CWA 氣象 API 整合與 Gemini LLM 文案

---

## 1. 之前對話中討論但未完成 / 待釐清的問題

| # | 問題 | 來源 | 目前狀態 |
|---|------|------|---------|
| 1 | Google CSE API key 403 錯誤 | 5/12 對話 | **不會解決**。Google 2026 政策將新建 GCP organization 永久封鎖 CSE API。已在 [agents/poi-verifier/docs/search-providers-evaluation.md](../poi-verifier/docs/search-providers-evaluation.md) 留結論 |
| 2 | Tavily vs Serper 搜尋備援選擇 | 5/12 對話 | 結論：四層架構 Tavily（主）→ DuckDuckGo（現有）→ Serper（fallback）→ LLM 推斷。**未實作**，poi-verifier 仍只使用 DDG |
| 3 | 教授的「資料架構」三層分離 | 5/12 對話 | 已概念性解釋（LLM 通識 / 系統獨有資料 / 偏好觸發器），**未落地到任何程式碼** |
| 4 | 「為什麼不直接用 ChatGPT？」 killer question 答法 | 5/12 對話 | 已準備口頭答案：可信度（多源交叉驗證）+ 應變能力（即時資料 + EV 公式）+ 多人共識 |
| 5 | 3 個 P0 先決任務（保險絲、降級策略、人在環中） | 5/12 對話 | 使用者選擇跳過直接實作 → **未做**，需在 demo 前補回 |
| 6 | 成本估算誤差（NT$5.94 vs NT$0.22） | 5/12 對話 | 已修正：實際 NT$0.22 / 次（GCP 月帳 NT$22.67 ÷ ~105 次驗證） |
| 7 | Nicole 5/8 修的 4 個 POI verifier bug | 5/8 commits | 已 review 並併入主分支 (cfbeee6, d12ef8c) |
| 8 | CWA API LocationName 空回傳 | 5/12 對話 | **已解決**：原本用 dataset F-D0047-091（縣市級）配 LocationName=北投區 → 空陣列。改用 F-D0047-061（鄉鎮級）即可正確回傳 |

---

## 2. 本次實作內容（依設計腳本）

### 2.1 檔案地圖

```
agents/contingency-handler/
├── src/
│   ├── types.ts                          # 所有型別 + 常數 (LEVEL_SCORES, ALPHA_MAP, DEFAULT_CONFIG, DEFAULT_WEIGHTS)
│   ├── poi-adapter.ts                    # src/data/pois.ts → 標準 POI schema
│   ├── detectors/
│   │   ├── weather-detector.ts           # 真實 CWA API + OSM Nominatim 反向地理編碼
│   │   ├── traffic-detector.ts           # mock（保留 interface）
│   │   ├── venue-detector.ts             # POI 內 snapshot + Google Places 備援
│   │   ├── group-detector.ts             # mock（成員距離檢測）
│   │   └── index.ts                      # 4 個 detector 並行聚合
│   ├── evaluators/
│   │   ├── expected-value-calculator.ts  # EV = P_fine × L + P_rain × (L × α)
│   │   ├── strict-checker.ts             # 5 項硬篩 + 事件特化規則
│   │   └── index.ts
│   ├── generators/
│   │   ├── contingency-plan-generator.ts # 多準則排序 + 策略選擇 + 計畫組裝
│   │   ├── llm-client.ts                 # Gemini 2.5 Flash → Claude Haiku fallback
│   │   └── index.ts
│   └── agent.ts                          # handleContingency() 主協調器
├── handle-contingency.ts                 # CLI：手動觸發單一事件
├── demo-scenarios.ts                     # 3 個 demo 場景批次跑
├── tests/
│   ├── evaluators.test.ts                # 8 assertions
│   └── integration.test.ts               # 12 assertions
├── package.json
└── tsconfig.json
```

### 2.2 五階段管線

```
TripContext + DetectorOverrides
        ↓
[Stage 1] detectAllContingencies()
        ↓ Promise.all([weather, traffic, venue, group]) → ContingencyEvent[]
[Stage 2] pickPrimary() by SEVERITY_PRIORITY
        ↓
[Stage 3] calculateExpectedValue()  ← 僅天氣事件
        ↓ EV = P_fine × L + P_rain × (L × α)
        ↓ drop = L - EV；drop > threshold ? trigger
[Stage 4] loadAllPois() → poisWithin(radius) → performStrictCheck()
        ↓ 篩掉 overcrowded / closed / stale / 低評分 / 戶外（雨天）
[Stage 5] scoreCandidate() × N → sort → top 5
        ↓ selectStrategy() → swap_poi / delay_timeslot / skip_activity / route_change
        ↓ generateNarrative() via Gemini
        ↓
ContingencyPlan (JSON)
```

### 2.3 關鍵設計決策

| 決策 | 內容 | 理由 |
|------|------|-----|
| Detector 並行 | `Promise.all([weather, traffic, venue, group])` | 4 個獨立 I/O，並行比序列快 ~3× |
| Detector overrides | 每個 detector 接 `override` 參數 | 同一條程式碼可跑「real API（demo / 期末展示）」與「mock 場景（單元測試）」 |
| LLM 只用一次 | 規則 + 排序在前 4 步做完，LLM 只負責 narrative | 控制成本 < NT$1 / 次；prompt 固定，user prompt 結構化 |
| EV 觸發門檻 | 預設 20 分 | 對應 L2 戶外景點 drop 36 會觸發、L2 室內 drop 2 不觸發（已在 evaluators.test.ts 驗證） |
| 動態權重 | 雨天重 weather_compatibility(0.35)、關閉重 opening_hours_margin(0.30)、疲憊重 energy_consumption(0.30) | 每組權重總和 = 1.0，避免不同事件下都用同套權重失準 |
| α (天氣影響) | indoor 0.95 / semi_outdoor 0.50 / outdoor 0.10 | 對應「下雨對體驗的耗損率」；用 `POI['space_type']` 當 key（避免原腳本用中文 key 失誤） |
| POI adapter | `require()` `src/data/pois.ts` 而非 textual parse | 中文敘述含換行字元，正則解析失敗；ts-node 內 require() 最穩 |
| CWA dataset | F-D0047-061（鄉鎮 3 天）而非 F-D0047-091（縣市 1 週） | LocationName 直接用鄉鎮名（如 `北投區`）即可命中；091 需先縣市再 nested 過濾 |

### 2.4 真實 API 整合

**CWA 氣象開放資料**
- 端點：`https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-061`
- 流程：lat/lng → Nominatim 反向地理編碼 → 取得 city/town → 查詢 `LocationName=<town>` → 取 `3小時降雨機率` 與 `溫度` 的第一個時間切片
- Severity 對應：rain ≥ 0.8 critical / ≥ 0.6 high / ≥ 0.4 medium / 其他 null
- 高溫（temp ≥ 35）獨立判定，獨立 event type
- Key：`.env.local` 的 `CWA_API_KEY`

**Gemini 2.5 Flash → Claude Haiku Fallback**
- 重用 poi-verifier 的相同 prompt 模式（system prompt 固定，user prompt 結構化）
- System prompt 強調 loss aversion：「強調新機會而非損失」
- Token 預算：max 800 output（實測 demo 每次 977–1083 tokens）

---

## 3. 驗證結果

### 3.1 TypeScript 編譯
```
npx tsc --noEmit  →  無錯誤
```

### 3.2 單元測試（evaluators.test.ts）
8/8 全通過：
- EV 計算正確：L2 戶外（L=50, α=0.1）+ P_rain=0.8 → EV=14, drop=36
- EV 計算正確：L2 室內（α=0.95）+ P_rain=0.8 → EV=48, drop=2 → 不觸發
- 嚴格篩選正確：4 個候選 → 1 個 qualified（室內博物館）、3 個 disqualified（人潮 / 低分 / 戶外）

### 3.3 整合測試（integration.test.ts）
12/12 全通過：
- 真實載入 45 筆 POI from `src/data/pois.ts`
- 搜尋半徑 5 km 內有 6 個候選 → 嚴格篩選後 2 個 qualified
- 規則層延遲 479 ms（< 3 s 預算）
- 策略正確選為 swap_poi

### 3.4 端對端 Demo（demo-scenarios.ts）

| 場景 | 當前 POI | 偵測事件 | 觸發原因 | 推薦備案 | 延遲 |
|------|---------|---------|----------|---------|------|
| 1. 大雨 + L2 戶外 | 老梅綠石槽 (L2, outdoor) | weather/heavy_rain critical | drop=38.3 > 20 | 北海岸特產專賣店 (score 85) / 白沙灣探索館 (84.7) | 5.6 s |
| 2. L1 場地關閉 | 野柳地質公園 (L1, outdoor) | venue/venue_closure high | 事件嚴重度 high | 野柳海洋世界 (83.2) / 龜吼漁港 (80.6) / 神祕海岸 (75.5) | 4.7 s |
| 3. L3 體力耗盡 | 石門洞 (L3, outdoor) | group/fatigue medium | 事件嚴重度 medium | 石門婚紗廣場 (74) / 北海岸特產 (74) | 5.5 s |

LLM 文案範例（場景 1）：
> 「天氣變化為您的旅程帶來新契機，我們推薦您前往北海岸特產專賣店 (劉家肉粽)，享受不受⋯」

### 3.5 CLI Auto 模式（真實 CWA）
```bash
npx ts-node handle-contingency.ts auto 25.134,121.494 NCA-002
→ {"status": "no_action_required"}
```
北投區當前無顯著降雨 → 正確回傳「不需應變」。

---

## 4. 已知問題 / 待解決事項

### 4.1 阻擋級（demo 前要處理）

| # | 問題 | 影響 | 建議解法 |
|---|------|------|---------|
| **B1** | 端到端延遲 4.7–5.6 s 超出 3 s 預算 | 規則層只佔 ~480 ms，瓶頸在 LLM (~4 s) | (a) 把 LLM narrative 改成非同步事件（先回 plan，narrative 後到）；(b) max_tokens 降到 300；(c) demo 時直接用 fallback 文案跳過 LLM |
| **B2** | CWA 鄉鎮 → dataset id 映射只覆蓋臺北/新北/基隆/宜蘭 4 縣市 | 其他縣市座標會 fallback 失效 | 擴充 `TOWNSHIP_DATASET` 完整 22 縣市映射表（CWA 官網有 dataset 清單） |
| **B3** | 5/12 對話中討論的 3 個 P0 仍未做（保險絲 / 降級策略 / 人在環中） | 教授可能在 demo 時追問「LLM 掛了怎麼辦」 | 已部分有：LLM fallback 已實作（Gemini → Claude → 空字串）；保險絲與人在環中尚缺 |

### 4.2 改進項（非阻擋）

| # | 問題 | 改善方向 |
|---|------|---------|
| I1 | `inferSpaceType()` 用名稱關鍵字 heuristic 推斷 semi_outdoor | 短期可接受；長期應在 `src/data/pois.ts` 直接加 `space_type` 欄位 |
| I2 | `group_preference_match` 評分硬寫 60（placeholder） | 需接 group profile 才能算（待 Architect Agent 整合） |
| I3 | `source_credibility_boost` 評分硬寫 70 | 待整合 poi-verifier 的 `reliability_score` 結果 |
| I4 | Traffic detector 完全是 mock | 等決定要不要用 Google Distance Matrix（成本高） |
| I5 | `last_info_update_age_days` POI 未填值 → strict-check 跳過該規則 | 需 poi-verifier 在驗證時回填這個欄位 |
| I6 | 即時狀態驗證（Tavily / 外部搜尋） | jerry 5/13 加的 pgvector + `extractInsights()` 已涵蓋約 90% 內部查詢（離線預處理部落格洞察存進 `blog_snippets`）。剩 ~10% 「景點現在還在嗎」這類時效性場景仍需外部搜尋。**降級為 P2**：等 POI 庫擴張或 demo 要展示即時應變時再做 |

### 4.3 設計層待釐清（屬於整體系統）

| # | 問題 | 備註 |
|---|------|------|
| D1 | 教授的「資料架構」三層分離（LLM 通識 / 系統獨有 / 偏好觸發器）尚未落地 | 目前 contingency-handler 把所有資料平鋪在 POI 物件上，未顯式區分三層 |
| D2 | 「為什麼不直接用 ChatGPT」killer question 的程式碼證據 | 本 agent 的 EV 公式 + 即時 CWA + 規則篩選 = 答案的具體證據，需在 demo 時口頭串起來 |
| D3 | 與 Architect Agent 的介面尚未定義 | `handleContingency()` 目前回傳獨立 `ContingencyPlan`；如果要回填到主行程，需要約定 callback 或 event bus |
| D4 | 候選池資料來源 vs jerry 新加的 `poi_catalog` | 目前 contingency-handler 讀靜態的 `src/data/pois.ts`（45 筆 demo）。jerry 已在 commit `33e64e3` 建好 `poi_catalog` 全域知識庫 + `match_poi_catalog` RPC（pgvector 768 維 + Gemini embedding + blog_snippets）。**下一步應將 [poi-adapter.ts](src/poi-adapter.ts) 的 `loadAllPois()` 改成查 Supabase RPC**，這樣才能用上向量搜尋找語意接近的備案，而非單純距離過濾。延遲也可順帶降低（DB 查詢比靜態 require 多 100ms 左右，但能省掉每次 require 整份檔案） |

---

## 5. 使用方式速查

```bash
# 安裝（已完成）
cd agents/contingency-handler
npm install

# 跑單元測試
npx ts-node tests/evaluators.test.ts
npx ts-node tests/integration.test.ts

# 跑 3 個 demo 場景
npx ts-node demo-scenarios.ts

# CLI（mock 大雨 @ 北投區，當前 POI = 野柳地質公園）
npx ts-node handle-contingency.ts heavy_rain 25.134,121.494 NCA-002

# CLI（auto 模式 - 真實 CWA 抓當下降雨機率）
npx ts-node handle-contingency.ts auto 25.134,121.494 NCA-002

# 環境變數（已在 repo 根目錄 .env.local）
# CWA_API_KEY、GEMINI_API_KEY、ANTHROPIC_API_KEY、GOOGLE_PLACES_API_KEY
```

---

## 6. 下一步建議

1. **先處理 B1 延遲問題**（demo 體感差很多）— 把 LLM narrative 改非同步
2. **補完 3 個 P0**（保險絲、降級、人在環中）— 教授會問
3. **接 jerry 的 poi_catalog（D4）** — 把 `loadAllPois()` 改成查 Supabase `match_poi_catalog` RPC，候選池從「同區域 5 km 內」升級為「語意相似的備案」（雨天找室內、體力低找輕鬆景點）。這是接下來把兩個 agent 串起來最關鍵的一步
4. **資料架構三層分離（D1）**— 在 types.ts 加註解區分，至少 demo 時能講
5. **擴充 CWA 縣市映射（B2）**— 期末若展示其他地區會用到
6. **整合 poi-verifier 的 `reliability_score`（I3, I5）**— 把兩個 agent 的輸出串起來
7. **Tavily 暫緩（I6 → P2）** — pgvector + extractInsights 已覆蓋大部分查詢；等 POI 庫擴張或 Strategy Agent 要做即時驗證時再做
