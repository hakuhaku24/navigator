# Navigator（領航者）— 原始碼簡報

**日期：** 2026-06-26  
**專案性質：** 國立中央大學資訊管理系畢業專題  
**給誰看：** 組員、指導教授、以及接手這個 repo 的 Claude

---

## 一、這個專案在解決什麼問題

> ⚠️ 2026-07-16 拍板：多人共識決策已移出範圍，定位收斂為單人使用情境＋可信景點資料庫＋即時應變。詳見 `0716_減法決策與不做清單.md`。

Navigator 針對以下問題設計：

| 痛點                                       | Navigator 的解法                                        |
| ------------------------------------------ | ------------------------------------------------------- |
| ~~大家意見不一致，沒有辦法決定要去哪~~     | ~~多人 Token 投票收斂~~ — 2026-07-16 已移出範圍，程式碼保留不開發 |
| 行程臨時出狀況（下雨、景點關閉），沒有備案 | **即時應變系統**，規則引擎先篩，再讓 LLM 寫建議文字     |
| 網路上的景點資訊品質不一，真假難辨         | **五層驗證 Pipeline**，三個來源交叉比對才給出可信度分數 |

---

## 二、Repo 結構

```
navigator/
├── src/                          # 主應用（Next.js 14，前端 + BFF）
│   └── app/
│       ├── page.tsx              # 首頁
│       ├── group/                # 群組旅遊房間（new / [id]）
│       └── globals.css
│
├── agents/
│   ├── poi-verifier/             # 景點驗證 Agent
│   │   ├── src/
│   │   │   ├── agent.ts          # 主流程協調器
│   │   │   ├── validators/       # google-places.ts · osm.ts · blog-search.ts · ptt.ts · youtube.ts
│   │   │   ├── enrichers/        # level-classifier.ts · multi-criteria-ranker.ts · resilience-generator.ts
│   │   │   ├── tdx-types.ts      # TDX API TypeScript 型別
│   │   │   └── tdx-mapper.ts     # TDX → Navigator Schema 映射
│   │   ├── hybrid-search.ts      # bigram + pgvector RRF 混合搜尋
│   │   ├── rag-reranker.ts       # Stage-2 Gemini 交叉評分重排
│   │   ├── ingest-from-tdx.ts    # TDX 觀光 API 批次入庫 CLI
│   │   ├── tests/fixtures/       # 五個場景的輸出 JSON（含 RAG fixture）
│   │   └── demo-scenarios.ts     # 教授 demo — 五個場景執行器
│   │
│   └── contingency-handler/      # 應變處理 Agent（即時韌性）
│       └── src/
│           ├── detectors/        # weather · venue · traffic · group 四種偵測器
│           ├── evaluators/       # strict-checker（規則篩選） · expected-value-calculator
│           └── generators/       # contingency-plan-generator.ts · llm-client.ts
│
├── data/
│   ├── poi_enriched.json         # 45 筆示範景點資料（已清洗驗證）
│   └── poi_map_preview.html      # Leaflet 地圖視覺化
│
└── prototypes/ui-demo/           # UI 設計原型（已完成，僅供參考）
```

---

## 三、技術亮點一：部落格爬蟲 + 三源交叉驗證

**相關檔案：**

- [agents/poi-verifier/src/validators/blog-search.ts](agents/poi-verifier/src/validators/blog-search.ts)
- [agents/poi-verifier/src/validators/google-places.ts](agents/poi-verifier/src/validators/google-places.ts)
- [agents/poi-verifier/src/validators/osm.ts](agents/poi-verifier/src/validators/osm.ts)

景點驗證不依賴單一來源，三個獨立管道同時查詢，結果不一致時可信度就下降：

| 來源類型   | 工具                             | 查什麼                                          |
| ---------- | -------------------------------- | ----------------------------------------------- |
| 半官方     | Google Places API                | 正式名稱、地址、營業時間、評分、business_status |
| 社群地圖   | OpenStreetMap Nominatim          | 座標交叉確認、地點分類                          |
| 使用者產生 | DuckDuckGo（主）+ Serper（備援） | 最近部落格遊記 → 當作資訊新鮮度的代理指標       |

**部落格搜尋的設計邏輯（為什麼這樣做）：**

```typescript
// blog-search.ts 核心邏輯

// 查詢字串格式：「景點名稱 + 地區提示 + 旅遊 心得 2024 OR 2025」
const query = `${poi.name} ${regionHint} 旅遊 心得 2024 OR 2025`;

// DuckDuckGo 用 Python subprocess 呼叫（免費、沒有 quota 限制）
// 只有當 DDG 回傳結果不足 2 筆，才動用 Serper（節省付費額度）
const ddgResults = await duckduckgoSearch(query);
if (ddgResults.length >= 2) return filterByLocation(ddgResults, poi);

// 地區過濾：避免「同名不同地」的景點污染結果
// 例如：台北的「竹子湖」vs. 其他縣市可能有同名地點
function filterByLocation(posts, poi): BlogPostRaw[] {
  const regionInDesc = TW_REGIONS.find((r) =>
    poi.user_description?.includes(r),
  );
  // 找不到地區提示就不過濾，避免全部被砍掉
}
```

---

## 四、技術亮點二：Agent 系統核心決策邏輯

### 4.1 景點驗證 Agent（`agents/poi-verifier/src/agent.ts`）

整個流程是**五步驟流水線**，三個外部 API 查完之後才進 LLM，目的是壓低 token 用量：

```
使用者輸入（景點名稱 + 座標）
        │
        ▼
【步驟 1+2】crossValidate() — 外部 API 查詢
   ├── Google Places  → 評分、營業時間、business_status
   ├── OpenStreetMap  → 座標交叉確認
   └── 部落格搜尋     → 資訊新鮮度
        │
        ▼  ← 如果 exists = false，直接回傳，不進 LLM
        │
【步驟 3+4+5】enrich() — 單次 Gemini 1.5 Flash 呼叫
   ├── 事實萃取       → 正式名稱、營業時間、室內/戶外
   ├── Level 分類     → L0 / L1 / L2 / L3 + 分類理由
   └── 備案邏輯生成   → 建議的候選池標籤、距離門檻
        │
        ▼
PoiVerifierOutput（可信度分數、建議等級、觀光客友善描述）
```

**成本控制機制：** token 用量超過 1,500 就會在 console 印警告；每次驗證費用約 NT$0.01。

---

### 4.2 應變處理 Agent（`agents/contingency-handler/src/generators/contingency-plan-generator.ts`）

偵測到觸發事件後，**規則引擎先跑完四步，LLM 只在最後負責寫人話**：

```
觸發事件（heavy_rain | venue_closure | group_fatigue | traffic）
        │
        ▼
【步驟 1】嚴格規則篩選（strict-checker.ts）
   直接排除以下候選景點：
   - 人潮爆滿（extremely_busy）
   - 即將打烊（剩餘營業時間 < 5 分鐘）
   - 資訊過期（超過設定天數未更新）
   - 永久或臨時歇業
   - 評分低於 3.0
   - 下雨/高溫事件中的開放式戶外景點
        │
        ▼
【步驟 2】多準則評分（0–100 分）
   根據事件類型動態調整權重向量
   例如下雨時，weather_compatibility 從 0.20 提升到 0.35
        │
        ▼
【步驟 3】策略選擇（selectStrategy）
   ├── swap_poi        → 找到評分 ≥ 60 的替代景點
   ├── delay_timeslot  → 找不到好替代（天氣事件）
   ├── skip_activity   → 景點關閉且無替代
   └── route_change    → 交通壅塞
        │
        ▼
【步驟 4】LLM 寫使用者建議（Gemini / Claude Haiku 備援）
   System prompt 要求：積極語氣、強調新機會而非損失
   輸出格式：純文字 1–2 句，無 markdown
        │
        ▼
ContingencyPlan（策略類型、前 5 名候選景點、影響評估、三個使用者選項）
```

---

### 4.3 多準則評分的權重設計

根據當下事件類型，各項權重會動態切換（所有欄位加總 = 1.0）：

| 評分維度     | 預設值 | 下大雨   | 景點關閉 | 成員疲勞 |
| ------------ | ------ | -------- | -------- | -------- |
| 天氣相容度   | 0.20   | **0.35** | 0.10     | 0.05     |
| 營業時間餘裕 | 0.10   | 0.10     | **0.30** | 0.10     |
| 體力消耗     | 0.05   | 0.05     | 0.05     | **0.30** |
| 距離         | 0.15   | 0.15     | 0.20     | 0.20     |
| 評分         | 0.15   | 0.15     | 0.15     | 0.12     |

---

## 五、API 與 CLI 介面

兩個 Agent 都可以直接用命令列執行（不需要起 Next.js server）：

```bash
# 景點驗證 — 跑全部五個場景（POI 驗證 ×3 + RAG 應變 ×2），輸出 JSON 到 tests/fixtures/
npx ts-node agents/poi-verifier/demo-scenarios.ts

# 快速 demo — 只跑 RAG Reranker 兩個應變場景（不呼外部 API）
npx ts-node agents/poi-verifier/demo-scenarios.ts --only-rag

# TDX 批次入庫（dry-run，不需任何 API key）
npx ts-node agents/poi-verifier/ingest-from-tdx.ts --dry-run

# Hybrid Search + RAG Reranker
npx ts-node agents/poi-verifier/hybrid-search.ts --query "雨天室內文藝景點"
npx ts-node agents/poi-verifier/rag-reranker.ts --query "北海岸海景備案"

# 應變處理 — 指定事件類型、GPS 座標、當前景點 ID
npx ts-node agents/contingency-handler/handle-contingency.ts heavy_rain 25.168,121.541 NCA-002
npx ts-node agents/contingency-handler/handle-contingency.ts venue_closure 25.033,121.565
npx ts-node agents/contingency-handler/handle-contingency.ts auto 25.168,121.541
# auto 模式會呼叫真實的中央氣象署 API
```

Next.js 主應用的群組房間功能放在 `src/app/group/[id]/`（🧊 2026-07-16 已凍結，見 `CLAUDE.md` §7.5，程式碼保留不開發），後端走 pgvector 語意檢索。

---

## 六、完整使用案例（從輸入到真實輸出）

### 場景一：正常驗證 — 竹子湖海芋

**輸入：**

```json
{
  "name": "竹子湖海芋",
  "location": { "latitude": 25.168, "longitude": 121.541 }
}
```

**管道執行過程：**

1. Google Places → 找到「鐘聲幸福觀景台 - 竹子湖海芋季」，狀態 `OPERATIONAL`，評分 4.3（690 則評論）
2. OSM → 座標確認吻合「竹子湖，北投區，臺北市」
3. 部落格搜尋 → 查詢「竹子湖海芋 陽明山 旅遊 心得 2024 OR 2025」

**實際輸出（2026-05-06 真實執行，存放於 `tests/fixtures/`）：**

```json
{
  "verification_result": {
    "exists": true,
    "sources": ["google_places", "osm"],
    "reliability_score": 0.67,
    "facts": {
      "official_name": "鐘聲幸福觀景台 - 竹子湖海芋季",
      "address": "112台灣臺北市北投區竹子湖路67之8號",
      "is_indoor": false,
      "weather_sensitivity": "high"
    }
  },
  "enrichment_result": {
    "suggested_level": 2,
    "level_reasoning": "季節性戶外景點，極度受天氣影響，建議可替換為室內同類型景點。",
    "backup_logic": {
      "strategy_type": "swap_same_level",
      "proximity_threshold_meters": 5000
    }
  },
  "tourist_friendly_description": "竹子湖海芋季是陽明山春天的一大盛事，每年3到5月，純白的海芋花海在山谷間綻放...",
  "cost_estimate": {
    "tokens_used": 3114,
    "estimated_cost_ntd": 0.01
  }
}
```

---

### 場景二：應變觸發 — 同景點遇到大雨（降雨機率 80%）

```bash
npx ts-node agents/contingency-handler/handle-contingency.ts heavy_rain 25.168,121.541
```

**預期輸出結構：**

```json
{
  "strategy_type": "swap_poi",
  "strategy_description": "天氣不佳，推薦替換為：[附近最高分室內景點]",
  "llm_narrative": "雨天正好是探索室內文化景點的好機會！建議改往附近的...",
  "impact_assessment": {
    "time_impact_minutes": 15,
    "group_satisfaction_impact": "neutral"
  },
  "user_options": [
    { "option_id": "accept", "description": "接受推薦備案" },
    { "option_id": "browse", "description": "查看所有備案" },
    { "option_id": "ignore", "description": "維持原計畫" }
  ]
}
```

---

### 場景三：異常偵測 — 不存在的景點

```json
{
  "name": "台北星球大戰主題樂園",
  "location": { "latitude": 25.033, "longitude": 121.565 }
}
```

**輸出：** `exists: false`，`reliability_score: 0`，不進入 LLM 流程，直接回傳空結果。  
這個場景示範了系統的**防禦性設計**：先確認景點存在，才花錢呼叫 LLM。

---

## 七、技術選型總覽

| 層次       | 技術                                               |
| ---------- | -------------------------------------------------- |
| 前端框架   | Next.js 14（App Router）+ TypeScript               |
| UI 元件    | TailwindCSS + shadcn/ui                            |
| 用戶端狀態 | Zustand                                            |
| 伺服器狀態 | TanStack Query                                     |
| 資料庫     | Supabase（PostgreSQL + pgvector）+ Redis           |
| AI 主力    | Gemini 1.5 Flash（約 NT$0.01 / 次驗證）            |
| AI 備援    | Claude Haiku（結構化輸出穩定）                     |
| 部落格搜尋 | DuckDuckGo via Python ddgs（免費）→ Serper（備援） |
| 天氣       | 中央氣象署 CWA Open API（免費、官方資料）          |
| 景點資料   | Google Places API + OpenStreetMap Nominatim        |
| 地圖       | Leaflet（Demo）→ Mapbox GL JS（正式）              |

---

## 八、給 Claude 的提示（接手 context 用）

- 這是**畢業專題**，不是商業產品，功能範圍以期末 demo 為準
- `agents/` 裡的兩個子系統可以**獨立執行**，不需要跑整個 Next.js app
- `data/poi_enriched.json` 有 45 筆示範景點，是目前所有 demo 的資料來源
- **L0 景點不能被自動替換**（系統設計上的硬限制，不是 bug）
- **VETO 票不是 −5 分，是直接讓景點出局**，處理時要特別注意
- AI key 一律存在 `.env.local`，絕對不能直接放在前端頁面呼叫
- 詳細架構說明在 `CLAUDE.md`；開發日誌在 `DEVLOG.md`

---

_本文件由原始碼直接提取，最後更新：2026-06-26_
