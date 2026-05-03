# 應變系統 Agent — Prototype 設計計畫與實作步驟

> 給 AI 協作者（Claude / Gemini）的工作 prompt。
> 本檔定義 contingency-handler 的 Prototype 目標、設計決策、逐步實作順序。
> 閱讀完再動手，不要跳過「設計計畫」直接寫 code。

---

## 背景脈絡

Navigator 多人旅遊規劃系統面臨的第二個核心痛點是「旅途中遇到突發狀況，無法即時應變」。
contingency-handler 是解決這個痛點的 Agent 系統，負責：

1. 實時監測突發狀況（天氣驟變、交通癱瘓、景點臨時休館、成員體力耗盡）
2. 自動計算期望值（Expected Value）判斷是否需要啟動應變
3. 執行嚴格檢查機制，避免推薦更糟的備案
4. 基於多準則排序，推薦最佳替代景點與行程調整方案

**本 Prototype 的定位**：端對端可執行的應變原型，能在真實突發狀況下快速生成應變計畫，
供教授 Demo 與後續整合主應用使用。Demo 應涵蓋至少 2 個極端場景（大雨、景點關閉），
每個場景從事件檢測到備案推薦應在 3 秒內完成。

---

## Prototype 設計計畫

### 目標（Prototype 範圍，非完整產品）

| #   | 目標           | 驗收標準                                                  |
| --- | -------------- | --------------------------------------------------------- |
| 1   | 事件實時檢測   | 接收天氣 API / 使用者手動觸發，能判斷突發事件的嚴重度     |
| 2   | 期望值決策邏輯 | 根據景點等級 × 降雨機率 × 天氣敏感度，計算是否觸發應變    |
| 3   | 嚴格檢查機制   | 自動篩掉人潮爆滿、即將打烊、資訊過時的備案                |
| 4   | 智能備案推薦   | 推薦排序後的備案景點 3–5 筆，含替換原因和風險提示         |
| 5   | 成本與速度控制 | 單次應變決策 < 2 秒；LLM token 使用 < 1000（~NT$1）       |
| 6   | 應變計畫輸出   | JSON 報告含事件信息、期望值計算、備案清單、使用者決策步驟 |

### 不在 Prototype 範圍

- 行程重新規劃（保留給 Architect Agent）
- 實時交通導航（先用 mock API）
- 使用者偏好學習（第一版用預設值）
- 多語言翻譯（只支援繁體中文）
- 推播通知排序（簡化邏輯）

### 架構決策

```
事件來源（多渠道）
  ├─ [Police 1] API 輪詢層：天氣 API（中央氣象署）、人潮 API（Google Maps）
  ├─ [Police 2] 使用者手動觸發：「回報狀況」按鈕（App 前端）
  ├─ [Police 3] IoT 感測（未來）：群組位置、步數、心率（現階段 mock）
                        ↓
            [Step 1] 事件偵測與分類層
            判定事件類型（天氣、交通、場地、人員）、嚴重度、影響範圍
                        ↓
            [Step 2] 期望值評估層
            計算 EV_current = P晴 × L + P雨 × (L × α)
            判定是否 L - EV_current > 應變門檻（預設 20）
                        ↓
            [Step 3] 嚴格檢查機制層
            掃描備案池，自動篩掉高風險景點
            標記「需致電確認」的邊界案例
                        ↓
            [Step 4] 多準則備案排序層
            根據事件類型動態調整權重，計分 0–100
            取前 3–5 筆推薦
                        ↓
            [Step 5] 應變計畫生成層（LLM）
            將結構化決策打包給 LLM，生成人性化建議文案
            標記「風險」和「機會」
                        ↓
輸出：ContingencyPlan JSON（含決策過程透明化、備案清單、使用者選項）
```

### LLM 使用策略（成本控制）

- **Step 5 只用一次 LLM 呼叫**，所有決策邏輯都在前 4 步做完（rule-based + ranking）
- System prompt 固定，user prompt 帶入結構化決策結果
- 預期 token：input ~400、output ~300，總計 < NT$1/次
- 備援：Gemini 失敗 → fallback Claude Haiku；Haiku 也失敗 → 回傳 raw JSON（不要 LLM 文案）

---

## 實作步驟

### Step 0：建立目錄結構

```bash
mkdir -p agents/contingency-handler/src/{detectors,evaluators,generators}
mkdir -p agents/contingency-handler/tests
```

目標結構：

```
agents/contingency-handler/
├── src/
│   ├── types.ts                      # 所有 TypeScript 型別
│   ├── detectors/
│   │   ├── weather-detector.ts       # 天氣事件偵測
│   │   ├── traffic-detector.ts       # 交通事件偵測
│   │   ├── venue-detector.ts         # 場地狀態偵測
│   │   ├── group-detector.ts         # 群組狀態偵測
│   │   └── index.ts                  # 事件聚合協調器
│   ├── evaluators/
│   │   ├── expected-value-calculator.ts  # 期望值計算
│   │   ├── strict-checker.ts         # 嚴格檢查機制
│   │   └── index.ts                  # 評估流程控制
│   ├── generators/
│   │   ├── contingency-plan-generator.ts # 應變計畫生成
│   │   └── index.ts                  # LLM 整合
│   └── agent.ts                      # 主 Orchestrator Agent
├── tests/
│   ├── detectors.test.ts
│   ├── evaluators.test.ts
│   ├── generators.test.ts
│   └── integration.test.ts
├── contingency-handler腳本附prompt.md  # 本檔
└── README.md
```

---

### Step 1：定義型別（`src/types.ts`）

先寫型別，再寫實作。所有模組都 import 這裡的型別，避免不一致。

需要定義的型別：

```typescript
// ===== 事件定義 =====

// 事件類型列舉
type EventType =
  | "heavy_rain"
  | "high_temperature"
  | "traffic_jam"
  | "venue_closure"
  | "group_fatigue"
  | "user_manual_report";

type EventSeverity = "low" | "medium" | "high" | "critical";

// 天氣事件
interface WeatherEvent {
  type: "heavy_rain" | "high_temperature" | "strong_wind" | "other";
  severity: EventSeverity;
  rainfall_probability: number; // 0–1
  temperature_celsius: number;
  affected_location: { latitude: number; longitude: number; radius_km: number };
  forecast_duration_minutes: number;
  data_source: "central_weather_bureau" | "weather_api";
  timestamp: string; // ISO8601
}

// 交通事件
interface TrafficEvent {
  type: "traffic_jam" | "accident" | "road_closure";
  severity: EventSeverity;
  affected_route: string;
  estimated_delay_minutes: number;
  alternative_routes?: string[];
  data_source: "google_maps" | "traffic_api";
  timestamp: string;
}

// 場地事件
interface VenueEvent {
  type: "venue_closure" | "overcrowding" | "no_reservation_available";
  severity: EventSeverity;
  venue_id: string;
  venue_name: string;
  reason: string;
  estimated_recovery_minutes?: number;
  current_crowd_level?: "low" | "moderate" | "high" | "extremely_busy";
  data_source: "google_maps" | "user_report";
  timestamp: string;
}

// 群組事件
interface GroupEvent {
  type: "fatigue" | "injury" | "member_separation" | "lost_item";
  severity: EventSeverity;
  affected_member_id?: string;
  description: string;
  timestamp: string;
}

// 統一事件型別
type ContingencyEvent = WeatherEvent | TrafficEvent | VenueEvent | GroupEvent;

// ===== 評估結果 =====

interface ExpectedValueResult {
  original_poi_level: 0 | 1 | 2 | 3;
  original_poi_score: number; // L
  rainfall_probability: number; // P_rain
  fine_probability: number; // P_fine = 1 - P_rain
  weather_impact_factor: number; // α
  expected_value_current: number; // EV_current = P_fine × L + P_rain × (L × α)
  score_drop: number; // L - EV_current
  contingency_threshold: number; // 預設 20
  should_trigger_contingency: boolean; // score_drop > threshold
  confidence: number; // 0–1，評估信心度
}

// ===== 備案推薦 =====

interface ContingencyCandidate {
  poi_id: string;
  name: string;
  distance_km: number;

  // 適合度評分（根據事件類型調整權重）
  multi_criteria_score: number; // 0–100
  score_breakdown: {
    weather_fit: number;
    distance_score: number;
    availability_score: number;
    crowd_capacity_score: number;
    group_preference_match: number;
  };

  // 風險標記
  has_recent_positive_reviews: boolean;
  is_verified: boolean;
  last_info_update_age_days: number;

  // 篩選結果
  is_qualified: boolean;
  disqualification_reasons?: string[];
  risk_warnings?: string[];

  // 情境適合度說明
  suitability_reason: string;
}

// ===== 應變計畫 =====

interface ContingencyPlan {
  // 事件信息
  event: ContingencyEvent;
  event_severity: EventSeverity;
  detection_timestamp: string;

  // 評估過程
  expected_value_analysis: ExpectedValueResult;
  trigger_reason: string; // 為何觸發應變（人類可讀）

  // 嚴格檢查結果
  checked_candidate_count: number;
  qualified_candidate_count: number;
  disqualified_details: {
    poi_id: string;
    reason: string;
  }[];

  // 備案推薦
  recommended_contingencies: ContingencyCandidate[]; // 前 3–5 筆
  primary_recommendation?: ContingencyCandidate; // 最高分

  // 應變策略
  strategy_type:
    | "swap_poi"
    | "delay_timeslot"
    | "skip_activity"
    | "route_change";
  strategy_description: string;
  impact_assessment: {
    time_impact_minutes: number;
    cost_impact_ntd: number;
    group_satisfaction_impact: "positive" | "neutral" | "negative";
  };

  // 使用者決策
  user_action_required: boolean;
  user_options: Array<{
    option_id: string;
    description: string;
    action: string;
  }>;

  // 成本估計
  decision_latency_ms: number;
  llm_tokens_used: number;
}

// ===== 應變計畫設定 =====

interface ContingencyConfig {
  // 期望值設定
  contingency_threshold: number; // 預設 20

  // 事件敏感度設定
  weather_severity_threshold: EventSeverity; // 何時觸發天氣應變
  traffic_severity_threshold: EventSeverity;
  venue_severity_threshold: EventSeverity;

  // 嚴格檢查設定
  max_crowd_level_allowed: "moderate" | "high"; // 超過則篩掉
  max_info_age_days: number; // 預設 30
  min_review_count: number; // 預設 5

  // 備案候選池設定
  search_radius_km: number; // L2=5km, L3=2km
  min_qualified_candidates: number; // 預設 3

  // 成本控制
  max_decision_latency_ms: number; // 預設 3000（3 秒）
  max_llm_tokens: number; // 預設 1000
}
```

---

### Step 2：實作事件偵測層（`src/detectors/`）

#### `src/detectors/weather-detector.ts`

監控天氣 API，判斷是否有雨或高溫：

```typescript
async function detectWeatherEvent(location: {
  latitude: number;
  longitude: number;
}): Promise<WeatherEvent | null> {
  // 呼叫中央氣象署 API
  // 檢查降雨機率、溫度、風速
  // 回傳 null（無異常）或 WeatherEvent
  // Prototype 階段可用 mock：
  // - 降雨機率 > 60% → heavy_rain
  // - 溫度 > 35°C → high_temperature
}

async function queryWeatherApi(
  latitude: number,
  longitude: number,
  apiKey: string,
): Promise<{
  rainfall_probability: number;
  temperature: number;
  forecast_hours: number;
}> {
  const endpoint = `https://opendata.cwb.gov.tw/api/v1/rest/querydata/F-C0032-001`;
  // locationName 需對應氣象局的鄉鎮代號
  // 返回 12 小時與 36 小時的降雨機率與溫度
}
```

#### `src/detectors/traffic-detector.ts`

監控交通 API 或使用者回報：

```typescript
async function detectTrafficEvent(route: {
  origin: LatLng;
  destination: LatLng;
}): Promise<TrafficEvent | null> {
  // 呼叫 Google Maps Distance Matrix API 查詢行進時間
  // 與 baseline（正常）比較，如超過 50% → traffic_jam
}
```

#### `src/detectors/venue-detector.ts`

監控場地狀態（Google Maps 人潮、營業狀態）：

```typescript
async function detectVenueEvent(
  poiId: string,
  poiName: string,
  googlePlaceId: string,
): Promise<VenueEvent | null> {
  // 查詢 Google Places API：
  // - business_status === "CLOSED_PERMANENTLY" → venue_closure
  // - crowd_level > 80% → overcrowding
  // - opening_hours 顯示即將關閉 → overcrowding
}
```

#### `src/detectors/group-detector.ts`

監控群組狀態（手動或 App 內回報）：

```typescript
async function detectGroupEvent(groupState: {
  current_location: LatLng;
  member_positions: LatLng[];
  timestamps: string[];
}): Promise<GroupEvent | null> {
  // 檢查成員距離：如超過 100m → member_separation
  // 檢查步數/心率歷史：如突然下降 → fatigue
  // 現階段都是 mock
}
```

#### `src/detectors/index.ts`

事件聚合協調器：

```typescript
async function detectAllContingencies(
  tripContext: TripContext,
  config: ContingencyConfig,
): Promise<ContingencyEvent[]> {
  const events = await Promise.all([
    detectWeatherEvent(tripContext.current_location),
    detectTrafficEvent(tripContext.current_route),
    detectVenueEvent(tripContext.current_poi),
    detectGroupEvent(tripContext.group_state),
  ]);

  // 篩掉 null，回傳實際發生的事件
  return events.filter((e) => e !== null);
}
```

---

### Step 3：實作期望值評估層（`src/evaluators/`）

#### `src/evaluators/expected-value-calculator.ts`

根據景點等級與天氣情況計算期望值：

```typescript
function calculateExpectedValue(
  currentPoi: POI,
  weatherEvent: WeatherEvent,
  config: ContingencyConfig,
): ExpectedValueResult {
  const L = currentPoi.level; // L0–L3
  const P_rain = weatherEvent.rainfall_probability;
  const P_fine = 1 - P_rain;

  // 定義天氣敏感度 (α)
  const alpha = {
    完全室內: 0.95, // 幾乎不受影響
    半戶外: 0.5, // 中等影響
    開放式戶外: 0.1, // 大幅影響
  }[currentPoi.space_type];

  const EV_current = P_fine * L + P_rain * (L * alpha);
  const score_drop = L - EV_current;

  return {
    original_poi_level: L,
    original_poi_score: L,
    rainfall_probability: P_rain,
    fine_probability: P_fine,
    weather_impact_factor: alpha,
    expected_value_current: EV_current,
    score_drop,
    contingency_threshold: config.contingency_threshold,
    should_trigger_contingency: score_drop > config.contingency_threshold,
    confidence: 0.9, // 根據天氣 API 品質調整
  };
}

// L0–L3 預設分數
const LEVEL_SCORES = {
  0: 100, // 絕對錨點，不應觸發應變
  1: 75,
  2: 50,
  3: 25,
};
```

#### `src/evaluators/strict-checker.ts`

篩掉高風險備案：

```typescript
function performStrictCheck(
  candidates: POI[],
  event: ContingencyEvent,
  config: ContingencyConfig,
): { qualified: POI[]; disqualified: { poi_id: string; reason: string }[] } {
  const qualified = [];
  const disqualified = [];

  for (const candidate of candidates) {
    const disqualifications = [];

    // 檢查 1：人潮爆滿
    if (candidate.current_crowd_level === "extremely_busy") {
      disqualifications.push("人潮爆滿");
    }

    // 檢查 2：營業時間
    if (candidate.opening_hours_margin_minutes < 5) {
      disqualifications.push("即將打烊");
    }

    // 檢查 3：資訊時效
    if (candidate.last_info_update_age_days > config.max_info_age_days) {
      disqualifications.push(`資訊超過 ${config.max_info_age_days} 天未更新`);
    }

    // 檢查 4：營業狀態
    if (candidate.business_status === "CLOSED_PERMANENTLY") {
      disqualifications.push("永久歇業");
    }

    // 檢查 5：體驗度檢查
    // 若替代景點評分 < 原景點 30% 以上 → 標記為備選
    if (candidate.rating < 3.0) {
      disqualifications.push("評分過低，建議確認");
    }

    if (disqualifications.length === 0) {
      qualified.push(candidate);
    } else {
      disqualified.push({
        poi_id: candidate.poi_id,
        reason: disqualifications.join(" | "),
      });
    }
  }

  return { qualified, disqualified };
}
```

---

### Step 4：實作應變計畫生成層（`src/generators/`）

#### `src/generators/contingency-plan-generator.ts`

結合 rank & multi-criteria scoring 選出最佳備案：

```typescript
async function generateContingencyPlan(
  event: ContingencyEvent,
  currentPoi: POI,
  expectedValueResult: ExpectedValueResult,
  candidatePool: POI[],
  config: ContingencyConfig,
  llmClient: LLMClient
): Promise<ContingencyPlan> {
  // Step 1: 嚴格檢查
  const { qualified, disqualified } = performStrictCheck(
    candidatePool,
    event,
    config
  );

  // Step 2: 多準則排序（根據事件類型調整權重）
  const weights = getWeightsForEvent(event.type);
  const scored = qualified
    .map(poi => ({
      ...poi,
      multi_criteria_score: scoreCandidate(poi, weights, event),
    }))
    .sort((a, b) => b.multi_criteria_score - a.multi_criteria_score)
    .slice(0, 5); // 取前 5 筆

  // Step 3: 決定應變策略
  const strategy = selectStrategy(event, scored);

  // Step 4: LLM 生成人性化建議（可選）
  const llmText = await generateLLMNarrative(
    event,
    expectedValueResult,
    scored,
    strategy,
    llmClient
  );

  // Step 5: 組裝應變計畫
  return {
    event,
    event_severity: event.severity,
    detection_timestamp: event.timestamp,
    expected_value_analysis: expectedValueResult,
    trigger_reason: `...",
    checked_candidate_count: candidatePool.length,
    qualified_candidate_count: qualified.length,
    disqualified_details: disqualified,
    recommended_contingencies: scored,
    primary_recommendation: scored[0],
    strategy_type: strategy.type,
    strategy_description: strategy.description,
    impact_assessment: strategy.impact,
    user_action_required: true,
    user_options: generateUserOptions(strategy, scored),
  };
}

// 根據事件類型動態調整權重
function getWeightsForEvent(eventType: EventType): MultiCriteriaWeights {
  switch (eventType) {
    case "heavy_rain":
      // 天氣適合度優先
      return {
        weather_compatibility: 0.4,
        distance: 0.2,
        rating: 0.15,
        // ...
      };
    case "venue_closure":
      // 開放時間餘裕優先
      return {
        opening_hours_margin: 0.35,
        distance: 0.25,
        rating: 0.15,
        // ...
      };
    case "group_fatigue":
      // 休息友善度優先
      return {
        energy_consumption: 0.3,
        rest_facilities: 0.25,
        distance: 0.2,
        // ...
      };
    // ...
  }
}

function selectStrategy(
  event: ContingencyEvent,
  candidates: ContingencyCandidate[]
): {
  type: "swap_poi" | "delay_timeslot" | "skip_activity" | "route_change";
  description: string;
  impact: ImpactAssessment;
} {
  // 邏輯：根據事件類型與候選清單決策
  // 如 L2 景點下雨 + 有室內替代 → swap_poi
  // 如 L3 景點下雨 + 無好替代 → delay_timeslot
  // 如 L3 景點 + 人潮爆滿 → skip_activity
}
```

---

### Step 5：實作主 Orchestrator Agent（`src/agent.ts`）

主邏輯串接所有模組：

```typescript
async function handleContingency(
  tripContext: TripContext,
  config: ContingencyConfig = DEFAULT_CONFIG,
  llmClient?: LLMClient,
): Promise<ContingencyPlan | null> {
  const startTime = Date.now();

  try {
    // 1. 偵測所有事件
    const events = await detectAllContingencies(tripContext, config);
    if (events.length === 0) {
      return null; // 無突發事件
    }

    // 2. 優先級排序（critical > high > medium > low）
    const primaryEvent = events.sort(
      (a, b) => SEVERITY_PRIORITY[b.severity] - SEVERITY_PRIORITY[a.severity],
    )[0];

    // 3. 期望值計算（僅天氣事件適用）
    let evResult = null;
    if (
      primaryEvent.type === "heavy_rain" ||
      primaryEvent.type === "high_temperature"
    ) {
      evResult = calculateExpectedValue(
        tripContext.current_poi,
        primaryEvent,
        config,
      );

      // 若不應觸發應變，提前結束
      if (!evResult.should_trigger_contingency) {
        return null;
      }
    }

    // 4. 取得備案候選池
    const candidates = getCandidatePools(
      tripContext.current_poi,
      primaryEvent,
      config,
    );

    // 5. 生成應變計畫
    const plan = await generateContingencyPlan(
      primaryEvent,
      tripContext.current_poi,
      evResult,
      candidates,
      config,
      llmClient,
    );

    // 紀錄決策延遲
    plan.decision_latency_ms = Date.now() - startTime;

    return plan;
  } catch (error) {
    console.error("應變決策失敗", error);
    // Graceful degradation：回傳 null，前端顯示「無法產生應變方案」
    return null;
  }
}
```

---

### Step 6：撰寫測試

#### `tests/detectors.test.ts`

測試事件偵測邏輯：

```typescript
describe("WeatherDetector", () => {
  it("should detect heavy rain event when rainfall probability > 60%", async () => {
    // mock weather API response
    const event = await detectWeatherEvent(mockLocation);
    expect(event.type).toBe("heavy_rain");
    expect(event.severity).toBe("high");
  });

  it("should return null when no adverse weather", async () => {
    const event = await detectWeatherEvent(mockFineLocation);
    expect(event).toBeNull();
  });
});
```

#### `tests/evaluators.test.ts`

測試期望值計算與嚴格檢查：

```typescript
describe("ExpectedValueCalculator", () => {
  it("should trigger contingency when score drop > threshold", () => {
    const result = calculateExpectedValue(
      L2OutdoorPOI, // L=50, 開放式戶外 α=0.1
      rainEvent, // P_rain=0.8
      defaultConfig, // threshold=20
    );
    // EV = 0.2×50 + 0.8×(50×0.1) = 10 + 4 = 14
    // drop = 50 - 14 = 36 > 20 → should trigger
    expect(result.should_trigger_contingency).toBe(true);
  });
});

describe("StrictChecker", () => {
  it("should disqualify overcrowded venues", () => {
    const { qualified, disqualified } = performStrictCheck(
      [overcrownedCafe, normalCafe],
      rainEvent,
      config,
    );
    expect(disqualified[0].reason).toContain("人潮爆滿");
    expect(qualified[0].name).toBe("normalCafe");
  });
});
```

#### `tests/integration.test.ts`

端對端測試應變流程：

```typescript
describe("Integration: Full Contingency Flow", () => {
  it("should handle heavy rain scenario end-to-end", async () => {
    const plan = await handleContingency(
      heavyRainTripContext,
      config,
      mockLLMClient,
    );

    expect(plan).not.toBeNull();
    expect(plan.event.type).toBe("heavy_rain");
    expect(plan.should_trigger_contingency).toBe(true);
    expect(plan.recommended_contingencies.length).toBeGreaterThan(0);
    expect(plan.decision_latency_ms).toBeLessThan(
      config.max_decision_latency_ms,
    );
  });
});
```

---

### Step 7：CLI 執行腳本 & Demo

在 `agents/contingency-handler/` 根目錄建立 `handle-contingency.ts`：

```typescript
// 使用方式：
// npx ts-node handle-contingency.ts "heavy_rain" "25.168,121.541"

const [, , eventType, location] = process.argv;
const [lat, lng] = location.split(",").map(Number);

const tripContext = {
  current_location: { latitude: lat, longitude: lng },
  current_poi: mockCurrentPOI,
  group_state: mockGroupState,
};

const plan = await handleContingency(tripContext, DEFAULT_CONFIG);
console.log(JSON.stringify(plan, null, 2));
```

Demo 場景腳本（`demo-scenarios.ts`）：

```typescript
// 場景 1：大雨下，L2 戶外景點
// 預期：觸發應變 → 推薦 3–5 間室內景點

// 場景 2：景點突然關閉，L1 熱門餐廳
// 預期：觸發應變 → 推薦同區域替代餐廳

// 場景 3：成員體力耗盡，L3 步道景點
// 預期：建議延遲或跳過 → 推薦周邊休息點
```

---

## 環境變數

在 repo 根目錄 `.env.local` 加入：

```
# 氣象 API
WEATHER_API_KEY=中央氣象署 API 金鑰

# Google Maps
GOOGLE_MAPS_API_KEY=你的金鑰

# LLM（非必須，Prototype 可無 LLM）
GEMINI_API_KEY=你的金鑰
ANTHROPIC_API_KEY=你的金鑰（fallback）
```

---

## 驗收檢查清單

在 PR / Demo 前確認以下項目：

- [ ] `src/types.ts` 所有型別完整，事件、評估、應變計畫結構清晰
- [ ] 四個 detector（weather, traffic, venue, group）都能獨立執行，無 crash
- [ ] `expected-value-calculator.ts` 計算邏輯正確，符合 EV = P_fine × L + P_rain × (L × α) 公式
- [ ] `strict-checker.ts` 成功篩掉人潮爆滿、即將打烊、資訊過時的備案
- [ ] 多準則排序根據事件類型動態調整權重（雨天重天氣，關閉重營業時間）
- [ ] LLM 呼叫單次 token < 1000（~NT$1）
- [ ] `handleContingency()` 決策延遲 < 3 秒
- [ ] 所有測試通過：detector、evaluator、generator、integration tests
- [ ] CLI 腳本能執行，輸出結構化 JSON
- [ ] Demo 場景 3 個都能正常執行，給出合理推薦
- [ ] 備案清單 ≥ 3 筆（或「無合適備案」訊息）
- [ ] 嚴格檢查篩掉的景點都標註 `disqualification_reasons`
- [ ] 期望值計算展示透明（在輸出中秀出 L, P_rain, α, EV_current, score_drop）
- [ ] `.env.local` 不在 git 追蹤範圍（確認 `.gitignore`）

---

## 實作順序建議

```
types.ts（定義所有事件、評估、應變計畫型別）
  → detectors/weather-detector.ts
  → detectors/traffic-detector.ts
  → detectors/venue-detector.ts
  → detectors/group-detector.ts
  → detectors/index.ts（事件聚合）
  → evaluators/expected-value-calculator.ts（EV 計算）
  → evaluators/strict-checker.ts（篩選邏輯）
  → evaluators/index.ts（評估流程）
  → generators/contingency-plan-generator.ts（備案生成）
  → generators/index.ts（LLM 整合，可選）
  → agent.ts（串接全部）
  → tests/detectors.test.ts
  → tests/evaluators.test.ts
  → tests/generators.test.ts
  → tests/integration.test.ts
  → handle-contingency.ts（CLI）
  → demo-scenarios.ts（Demo 腳本）
```

每個檔案完成後跑一次 smoke test，確認不 crash 再往下。
**不要等全部寫完才測試。**

---

## 系統設計原則

### 1. 透明度優先（Transparency First）

所有決策（EV 計算、篩選原因、排序分數）都在輸出中明確呈現，
讓使用者理解「為什麼系統推薦這個」。

### 2. 嚴格優於尋求（Strictness > Optimization）

寧可推薦較少的「高信心」備案，也不要推薦「風險較高」的方案。

- 人潮爆滿 → 直接篩掉，不冒險
- 資訊過時 → 標記「建議致電確認」
- 評分過低 → 降權或篩掉

### 3. 避免損失感（Loss Aversion）

應變推薦應強調「新機會」而非「損失」。
例如：「下雨天，這間咖啡廳有文創展覽，更值得一去！」

### 4. 快速決策（Fast Decision）

控制總決策延遲 < 3 秒，確保在使用者等待時給出答案。
所有 rule-based 邏輯在 Step 1–4 完成；LLM 僅用於最後文案潤飾。

---

**建立日期**：2026-05-03
**對應 README**：[agents/contingency-handler/README.md](./README.md)
**對應 CLAUDE.md**：section 9（當前進度），應變系統設計部分
