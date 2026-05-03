# 應變系統 Agent (contingency-handler)

> Navigator 旅遊應變系統的核心 Agent，負責實時偵測突發狀況、評估影響、生成應變計畫。

---

## 概述

當旅途中發生突發狀況（大雨、景點關閉、成員體力耗盡等），應變 Agent 會：

1. **實時偵測**：監控天氣、交通、場地、群組狀態
2. **期望值評估**：計算景點價值下降是否超過應變門檻
3. **嚴格檢查**：自動篩掉人潮爆滿、即將打烊等高風險備案
4. **多準則排序**：根據事件類型調整權重，推薦最佳替代方案
5. **應變計畫生成**：打包決策理由、備案清單、使用者選項

## 快速開始

### 安裝依賴

```bash
npm install axios dotenv ts-node
# 或搭配 poi-verifier 的 package.json
```

### 執行 Demo

```bash
# 場景 1：大雨應變
npx ts-node src/agent.ts "heavy_rain"

# 場景 2：景點關閉應變
npx ts-node src/agent.ts "venue_closure"

# 場景 3：成員體力耗盡
npx ts-node src/agent.ts "group_fatigue"
```

### 單元測試

```bash
npm test -- tests/detectors.test.ts
npm test -- tests/evaluators.test.ts
npm test -- tests/generators.test.ts
npm test -- tests/integration.test.ts
```

---

## 核心概念

### 期望值 (Expected Value)

決策是否啟動應變的數學基礎：

$$EV_{current} = P_{fine} \times L + P_{rain} \times (L \times \alpha)$$

其中：

- $L$ = 原景點等級分數（L0:100, L1:75, L2:50, L3:25）
- $P_{rain}$ = 降雨機率（0–1）
- $P_{fine}$ = 1 - $P_{rain}$
- $\alpha$ = 天氣敏感度（室內 0.95, 半戶外 0.5, 戶外 0.1）

當 $L - EV_{current}$ > 門檻（預設 20）時，觸發應變。

### 嚴格檢查清單

備案景點必須通過以下檢查，否則自動篩掉：

| 檢查項   | 標準                 | 篩掉條件                |
| -------- | -------------------- | ----------------------- |
| 人潮     | Google Maps 實時人流 | > 80%（extremely_busy） |
| 營業時間 | 距離關閉時間         | < 5 分鐘                |
| 資訊時效 | 上次更新距今         | > 30 天                 |
| 營業狀態 | Google Places 狀態   | CLOSED_PERMANENTLY      |
| 評價度   | 評分                 | < 3.0 分                |

### 多準則排序

根據事件類型動態調整權重：

```
天氣事件（下雨/高溫）：
  - 天氣相容度（40%）
  - 距離（20%）
  - 評分（15%）
  - 評論數（10%）
  - 開放時間（10%）
  - 費用符合（5%）

場地事件（關閉/擁擠）：
  - 開放時間餘裕（35%）
  - 距離（25%）
  - 評分（15%）
  - 評論數（10%）
  - 族群偏好（10%）
  - 人潮容納度（5%）

成員事件（體力耗盡）：
  - 體力消耗低（30%）
  - 休息友善度（25%）
  - 距離（20%）
  - 評分（15%）
  - 開放時間（10%）
```

---

## 檔案結構

```
agents/contingency-handler/
├── src/
│   ├── types.ts                  # 型別定義
│   │
│   ├── detectors/                # 事件偵測層
│   │   ├── weather-detector.ts   # 天氣監控
│   │   ├── traffic-detector.ts   # 交通監控
│   │   ├── venue-detector.ts     # 場地監控
│   │   ├── group-detector.ts     # 群組狀態監控
│   │   └── index.ts              # 事件聚合
│   │
│   ├── evaluators/               # 評估決策層
│   │   ├── expected-value-calculator.ts  # EV 計算
│   │   ├── strict-checker.ts     # 嚴格檢查機制
│   │   └── index.ts              # 評估協調
│   │
│   ├── generators/               # 應變計畫生成層
│   │   ├── contingency-plan-generator.ts # 計畫生成
│   │   └── index.ts              # LLM 整合（可選）
│   │
│   └── agent.ts                  # 主 Orchestrator
│
├── tests/
│   ├── detectors.test.ts
│   ├── evaluators.test.ts
│   ├── generators.test.ts
│   └── integration.test.ts
│
├── contingency-handler腳本附prompt.md  # 實作指南（本檔）
├── README.md                     # 本檔
├── handle-contingency.ts         # CLI 執行腳本
└── demo-scenarios.ts             # Demo 場景
```

---

## 應變計畫結構

### 輸入

```json
{
  "event": {
    "type": "heavy_rain",
    "severity": "high",
    "rainfall_probability": 0.8,
    "affected_location": {
      "latitude": 25.168,
      "longitude": 121.541,
      "radius_km": 5
    }
  },
  "tripContext": {
    "current_location": { "latitude": 25.168, "longitude": 121.541 },
    "current_poi": {
      "poi_id": "YM-001",
      "level": 2,
      "space_type": "開放式戶外"
    },
    "group_state": { "member_count": 5, "fatigue_level": "normal" }
  }
}
```

### 輸出

```json
{
  "event_severity": "high",
  "detection_timestamp": "2026-05-03T14:30:00Z",

  "expected_value_analysis": {
    "original_poi_level": 2,
    "original_poi_score": 50,
    "rainfall_probability": 0.8,
    "weather_impact_factor": 0.1,
    "expected_value_current": 14,
    "score_drop": 36,
    "contingency_threshold": 20,
    "should_trigger_contingency": true
  },

  "trigger_reason": "戶外景點 L2 在降雨機率 80% 下，價值下降 36 分，超過門檻 20",

  "checked_candidate_count": 12,
  "qualified_candidate_count": 5,
  "disqualified_details": [
    { "poi_id": "YM-002", "reason": "人潮爆滿" },
    { "poi_id": "YM-003", "reason": "即將打烊 | 資訊超過 30 天未更新" }
  ],

  "recommended_contingencies": [
    {
      "poi_id": "NC-001",
      "name": "金山獅頭山景觀餐廳",
      "distance_km": 3.2,
      "multi_criteria_score": 85,
      "score_breakdown": {
        "weather_fit": 95,
        "distance_score": 80,
        "availability_score": 90,
        "rating": 4.6,
        "reviews": 320
      },
      "suitability_reason": "室內用餐空間，下雨天完全不受影響；臨近目前位置；評價極高"
    },
    {
      "poi_id": "NC-002",
      "name": "基隆廟口夜市",
      "distance_km": 5.1,
      "multi_criteria_score": 72,
      "suitability_reason": "有頂蓋區域，適合下雨天；美食多樣；開放至晚上"
    }
  ],

  "strategy_type": "swap_poi",
  "strategy_description": "原景點（陽明山竹子湖）在大雨下體驗度大幅下降，建議替換為室內用餐景點",

  "impact_assessment": {
    "time_impact_minutes": 15,
    "cost_impact_ntd": 200,
    "group_satisfaction_impact": "positive"
  },

  "user_action_required": true,
  "user_options": [
    {
      "option_id": "accept_primary",
      "description": "接受第一個推薦，前往金山景觀餐廳",
      "action": "update_current_poi(NC-001)"
    },
    {
      "option_id": "accept_secondary",
      "description": "接受第二個推薦，前往基隆廟口",
      "action": "update_current_poi(NC-002)"
    },
    {
      "option_id": "delay_1hour",
      "description": "延遲 1 小時，等雨停",
      "action": "delay_timeslot(60)"
    },
    {
      "option_id": "skip_activity",
      "description": "跳過此景點，往下一個行程",
      "action": "skip_to_next_poi()"
    }
  ],

  "decision_latency_ms": 1850,
  "llm_tokens_used": 320
}
```

---

## 環境變數

在專案根目錄 `.env.local` 建立：

```env
# 氣象 API（中央氣象署）
WEATHER_API_KEY=your_cwb_api_key

# Google Maps API
GOOGLE_MAPS_API_KEY=your_google_api_key

# LLM（可選，Prototype 可不設）
GEMINI_API_KEY=your_gemini_key
ANTHROPIC_API_KEY=your_claude_key

# 應變系統設定
CONTINGENCY_THRESHOLD=20
MAX_DECISION_LATENCY_MS=3000
```

---

## 主要 API

### `handleContingency(tripContext, config?, llmClient?)`

主入口函式，執行完整應變決策流程。

**參數**

- `tripContext: TripContext` — 行程上下文（當前位置、景點、群組狀態）
- `config?: ContingencyConfig` — 設定覆蓋（可選，使用預設值）
- `llmClient?: LLMClient` — LLM 客戶端（可選，若無則跳過文案潤飾）

**回傳**

- `Promise<ContingencyPlan | null>` — 應變計畫，或 null（無需應變）

**範例**

```typescript
const plan = await handleContingency(tripContext, config);
if (plan) {
  console.log(`建議：${plan.recommended_contingencies[0].name}`);
  console.log(`使用者選項：${plan.user_options.length} 個`);
}
```

### `calculateExpectedValue(poi, weatherEvent, config)`

計算期望值，判斷是否觸發應變。

**回傳**

```typescript
{
  original_poi_score: 50,
  expected_value_current: 14,
  score_drop: 36,
  should_trigger_contingency: true
}
```

### `performStrictCheck(candidates, event, config)`

篩掉高風險備案。

**回傳**

```typescript
{
  qualified: [...], // 通過檢查的景點
  disqualified: [    // 被篩掉的景點 + 原因
    { poi_id: "...", reason: "人潮爆滿" }
  ]
}
```

---

## 測試與 Demo

### 執行測試

```bash
# 全部測試
npm test

# 特定測試檔
npm test -- tests/evaluators.test.ts

# 觀看測試覆蓋率
npm test -- --coverage
```

### Demo 場景

```bash
# 執行內建 demo 場景
npx ts-node demo-scenarios.ts

# 輸出：3 個場景的應變計畫，可視化每個決策步驟
```

---

## 性能目標

| 指標               | 目標   | 現狀        |
| ------------------ | ------ | ----------- |
| 決策延遲           | < 3 秒 | ~1.8 秒     |
| LLM Token（每次）  | < 1000 | ~320        |
| 備案推薦數         | ≥ 3 筆 | 通常 3–5 筆 |
| 正確率（嚴格檢查） | > 95%  | 測試中      |

---

## 已知限制

1. **天氣 API 時效性**：中央氣象署 API 更新頻率為 3 小時，可能不夠即時
2. **人潮數據**：Google Maps 人潮資訊為近似值，可能有延遲
3. **交通 API**：目前使用 Google Maps Distance Matrix，即時性有限
4. **群組狀態**：成員位置、體力等資訊仍需手動回報或 mock
5. **備案景點池**：目前限於預驗證的 POI 池，未來需動態擴展

---

## 後續優化方向

- [ ] 連接 Telegram / Line Bot，推播應變通知
- [ ] 加入多語言支援（英文、日文、韓文）
- [ ] 學習使用者偏好，動態調整推薦權重
- [ ] 與行程規劃 Agent 連動，自動重組後續行程
- [ ] 引入 A/B 測試，驗證應變策略有效性

---

## 相關資源

- [完整設計文件](./contingency-handler腳本附prompt.md)
- [POI 驗證 Agent](../poi-verifier/)
- [Navigator 架構書](../../Navigator_MVP_架構書.docx)
- [教授回饋整理](../../references/0429_教授回饋整理.md)
