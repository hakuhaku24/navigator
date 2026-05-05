# POI 驗證 Agent — Prototype 設計計畫與實作步驟

> 給 AI 協作者（Claude / Gemini）的工作 prompt。
> 本檔定義 poi-verifier 的 Prototype 目標、設計決策、逐步實作順序。
> 閱讀完再動手，不要跳過「設計計畫」直接寫 code。

---

## 背景脈絡

Navigator 是一套多人旅遊規劃系統，核心痛點之一是「網路景點資訊真假難辨」。
poi-verifier 是解決這個痛點的子系統，負責：

1. 從 Google Places、OSM 交叉驗證景點是否存在、資訊是否準確
2. 自動判斷景點的 L0–L3 等級（可替換性分級）
3. 根據等級產出對應的 Swap / Switch 備案邏輯

**本 Prototype 的定位**：端對端可執行的驗證原型，能跑真實 API、輸出結構化 JSON 報告，
供教授 Demo 與後續整合主應用使用。目前 45 筆 POI 的 `fact_check_status` 全是
`mock_demo_data`，Prototype 要能把其中 3–5 筆換成真實驗證結果。

---

## Prototype 設計計畫

### 目標（Prototype 範圍，非完整產品）

| #   | 目標               | 驗收標準                                                  |
| --- | ------------------ | --------------------------------------------------------- |
| 1   | 單筆景點端對端驗證 | 給一個景點名稱＋座標，能回傳 `VerificationResult` JSON    |
| 2   | L0–L3 自動分級     | 分級結果含理由說明（`level_reasoning`），不能只給數字     |
| 3   | 備案邏輯生成       | 至少支援 `swap_same_level` 與 `switch_time_slot` 兩種策略 |
| 4   | 成本控制           | 單次驗證 token 使用量 < NT$5（Gemini 1.5 Flash 計費）     |
| 5   | Demo 報告輸出      | 能輸出 `verification_report.json`，供 CLI 或測試腳本呼叫  |

### 不在 Prototype 範圍

- Redis 快取（先跑通再優化）
- pgvector / Supabase 寫入（輸出 JSON 即可）
- 批次 batch API（先做單筆）
- 真實時間軸整合進主應用（Route Handler 先以 mock 串接）

### 架構決策

```
輸入：POI 基本資料（名稱、座標、使用者描述）
                        ↓
            [Step 1] 外部 API 查詢層
            Google Places Text Search → 取得 place_id、opening_hours、rating
            OSM Nominatim → 取得官方名稱、地址確認
            Blog Post Search → 抓真實部落格/旅遊文章，補充使用者視角與最新營運狀態
                        ↓
            [Step 2] LLM 交叉驗證層（Gemini 1.5 Flash）
            對比三個來源，判斷資訊一致性、偵測官方資料是否過度美化
            輸出 reliability_score（0–1）
                        ↓
            [Step 3] L0–L3 分級層（Rule-based + LLM 補充）
            先跑 Rule-based（has_reservation → 傾向 L0/L1，is_outdoor → 傾向 L2/L3）
            再用 LLM 根據 context（vibe_tags、group_size、blog evidence）微調
                        ↓
            [Step 4] 備案邏輯生成層（LLM）
            根據 level、weather_sensitivity、space_type 產出 backup_logic
                        ↓
輸出：VerificationResult JSON（含 facts、level、backup_logic、cost_estimate）
```

### LLM 使用策略（成本控制）

- **Step 2 + Step 3 + Step 4 合併成一次 LLM 呼叫**，避免多次往返
- System prompt 固定，user prompt 帶入外部 API 結果
- 預期 token：input ~800、output ~400，總計 < NT$1.5/次
- 備援：Gemini 呼叫失敗時 fallback 到 Claude Haiku

---

## 實作步驟

### Step 0：建立目錄結構

```bash
mkdir -p agents/poi-verifier/src/validators
mkdir -p agents/poi-verifier/src/enrichers
mkdir -p agents/poi-verifier/tests
```

目標結構：

```
agents/poi-verifier/
├── src/
│   ├── types.ts                  # 所有 TypeScript 型別（先寫這個）
│   ├── validators/
│   │   ├── google-places.ts      # Google Places API 查詢
│   │   ├── osm.ts               # OSM Nominatim 查詢
│   │   ├── blog-search.ts        # Blog Post 搜尋與解析（新增）
│   │   └── index.ts             # 交叉驗證協調器 + 時效性衰減
│   ├── enrichers/
│   │   ├── level-classifier.ts  # L0-L3 分級（Rule-based 優先）
│   │   ├── multi-criteria-ranker.ts  # 多準則排序（新增）
│   │   ├── resilience-generator.ts  # backup_logic 生成（擴充）
│   │   └── index.ts             # 增強流程控制
│   └── agent.ts                 # 主 Agent（串接所有模組）
├── tests/
│   ├── validators.test.ts
|  ├── enrichers.test.ts
│   └── integration.test.ts
├── PROMPT.md                    # 本檔
└── README.md
```

---

### Step 1：定義型別（`src/types.ts`）

先寫型別，再寫實作。所有模組都 import 這裡的型別，避免不一致。

需要定義的型別：

```typescript
// 輸入
interface PoiInput {
  name: string;
  location: { latitude: number; longitude: number };
  user_description?: string;
}

interface VerificationContext {
  trip_id?: string;
  group_size?: number;
  vibe_tags?: string[];
  scenario?: "heavy_rain" | "closure" | "fatigue"; // 備案排序時的動態權重調整
}

// POI 候選池元素（已驗證的景點物件）
interface POI {
  poi_id: string;
  name: string;
  rating: number;                        // Google Maps 評分 0–5
  review_count: number;
  distance_km: number;
  opening_hours_margin_minutes: number;
  cost_within_budget: boolean;
  weather_compatibility: number;         // 天氣相容度 0–1
  crowd_level: number;                   // 人潮程度 0–1（用於計分）
  current_crowd_level?: "low" | "moderate" | "high" | "extremely_busy"; // 用於字串比對篩選
  energy_consumption: number;            // 體力消耗 0–100
  space_type: "indoor" | "semi_outdoor" | "outdoor";
  decision_tags: { vibe: string[]; limitations: string[] };
  source_reliability_score: number;      // 多來源聚合信度 0–1（取代未定義的 primary_source_credibility）
  last_verified_at: string;             // ISO8601（用於計算時效，取代未定義的 days_since_update）
  level: 0 | 1 | 2 | 3;
  requires_reservation: boolean;
  last_update_date?: number;             // timestamp ms，用於時效篩選
  touches_group_taboo?: boolean;
}

// 外部 API 原始結果
interface GooglePlacesRaw {
  place_id: string | null;
  official_name: string | null;
  formatted_address: string | null;
  opening_hours: string[] | null; // 原始文字，不要 parse
  rating: number | null;
  user_ratings_total: number | null;
  business_status: string | null; // "OPERATIONAL" | "CLOSED_PERMANENTLY" | ...
}

interface OsmRaw {
  osm_id: string | null;
  display_name: string | null;
  address: Record<string, string> | null;
  category: string | null;
}

// 來源信度分級
type SourceCredibility =
  | "official"
  | "semi_official"
  | "blog_travel"
  | "user_feedback";

interface SourceMetadata {
  source_type: SourceCredibility;
  last_updated_at: string; // ISO8601
  time_decay_factor: number; // 0–1，根據距離當前日期衰減
  confidence: number; // 0–1，此來源對此欄位的可信度
}

// 驗證結果
interface VerificationResult {
  exists: boolean;
  sources: Array<"google_places" | "osm" | "blog_post" | "llm_inferred">;
  reliability_score: number; // 0–1
  source_breakdown?: {
    official?: SourceMetadata;
    semi_official?: SourceMetadata;
    blog_travel?: SourceMetadata;
    user_feedback?: SourceMetadata;
  };
  facts: {
    official_name: string;
    address: string;
    hours: string;
    average_stay_minutes: number;
    last_verified_at: string; // ISO8601
    latest_blog_post_date?: string; // YYYY-MM-DD
    is_indoor: boolean;
    weather_sensitivity: "low" | "medium" | "high";
    source_citation?: {
      field: string;
      primary_source: SourceCredibility;
      confidence: number;
    }[];
  };
}

// 多準則排序權重配置
interface MultiCriteriaWeights {
  rating: number; // 官方評分 (0–5) — 預設 25%
  review_count: number; // 評論數 — 預設 15%
  distance: number; // 距離（公里）— 預設 20%
  opening_hours_margin: number; // 開放時間餘裕（分鐘）— 預設 15%
  cost_within_budget: boolean; // 費用符合預算 — 預設 10%
  weather_compatibility: number; // 天氣相容度 — 預設 20%
  crowd_capacity: number; // 人潮容納度 — 預設 10%
  energy_consumption: number; // 體力消耗程度 — 預設 10%
  group_preference_match: number; // 符合族群偏好度 — 預設 15%
  source_credibility_boost: number; // 官方來源加分 — 預設 +5%
  recency_bonus: number; // 近期更新加分 — 預設 +5%
}

// 增強結果
interface EnrichmentResult {
  suggested_level: 0 | 1 | 2 | 3;
  level_reasoning: string;
  candidate_pool?: {
    poi_id: string;
    name: string;
    distance_km: number;
    multi_criteria_score: number; // 0–100，綜合排序分數
    score_breakdown?: {
      rating_score: number;
      distance_score: number;
      hours_margin_score: number;
      weather_compatibility_score: number;
      source_credibility_score: number;
      recency_score: number;
    };
    disqualification_reasons?: string[];
  }[];
  backup_logic: {
    strategy_type:
      | "swap_same_level"
      | "switch_time_slot"
      | "cancel_with_notice";
    description: string;
    candidate_pool_tags: string[];
    proximity_threshold_meters: number;
    recommended_backup?: string; // 候選池中最高分的景點 ID
  };
}

// 最終輸出
interface PoiVerifierOutput {
  poi_input: PoiInput;
  verification_result: VerificationResult;
  enrichment_result: EnrichmentResult;
  cost_estimate: {
    tokens_used: number;
    estimated_cost_ntd: number;
  };
  raw_sources?: {
    google_places?: GooglePlacesRaw;
    osm?: OsmRaw;
  };
}
```

---

### Step 1.5：時效性驗證機制 — 來源分級與時間衰減

在組合多個驗證來源時，需要區分資訊的來源層級與時效性，避免將過時資訊當作現況。

#### 來源信度分級（Source Credibility Tiers）

```
Tier 1: 官方 (Official)
  - 景點官網、政府觀光局、官方 APP
  - 更新頻率：應 ≤2 個月
  - 信度權重：100% × time_decay
  - 判定規則：如果官方資訊 > 2 個月未更新 → 降級為 Tier 2

Tier 2: 半官方 (Semi-official)
  - Google Places（商家可自行編輯）
  - OpenStreetMap（社群維護）
  - 更新頻率：應 ≤30 天
  - 信度權重：80% × time_decay
  - 判定規則：如果 > 30 天未驗證 → 建議使用者致電確認

Tier 3: 部落格/旅遊文章 (Blog Travel)
  - 真實遊客體驗分享
  - 更新頻率：無固定週期，但「最近發布日期」是核心判據
  - 信度權重：60% × recency_boost（越近越可信）
  - 判定規則：優先採用最近 6 個月內的文章；> 1 年的文章降權 50%

Tier 4: 使用者回報 (User Feedback)
  - 使用者在 App 內的即時回報
  - 信度權重：40%（未經系統驗證）
  - 判定規則：僅用於立即提示，不納入長期決策
```

#### 時間衰減公式 (Time Decay Function)

```
time_decay_factor = e^(-(d / h))

其中：
  d = 距離上次驗證的天數
  h = 半衰期（source tier 的預設衰減半徑）
    - Official: h = 60 天（兩個月）
    - Semi-official: h = 30 天
    - Blog: h = 180 天（六個月）
    - User feedback: h = 1 天（實時性強）

舉例：
  Google Places 上次更新是 15 天前
  time_decay_factor = e^(-(15 / 30)) = 0.61
  該資訊的加權信度 = 80% × 0.61 = 0.488
```

#### 多來源聚合邏輯 (Multi-source Aggregation)

當同一欄位（例如營業時間）來自多個來源時：

```
aggregated_fact = Σ(source_value × time_decay_factor × tier_weight)
aggregated_confidence = Σ(time_decay_factor × tier_weight) / Σ(tier_weight)

// 若聚合信度 < 0.5，在輸出中標記為 ⚠️ 建議確認
// 若聚合信度 < 0.3，不應使用該資訊做決策
```

---

### Step 2：實作外部 API 查詢層

#### `src/validators/google-places.ts`

使用 Google Places **Text Search API**（非 Geocoding）：

- Endpoint：`https://maps.googleapis.com/maps/api/place/textsearch/json`
- 參數：`query={name}&location={lat},{lng}&radius=2000&language=zh-TW&key={API_KEY}`
- 取第一筆結果即可（Prototype 不需要多筆排序）
- 如果 `business_status === "CLOSED_PERMANENTLY"` → `exists = false`
- **錯誤處理**：API key 缺失或配額用盡時，回傳 `null`（不要 throw，讓協調器降級處理）

#### `src/validators/osm.ts`

使用 OSM Nominatim Search API：

- Endpoint：`https://nominatim.openstreetmap.org/search`
- 參數：`q={name}&countrycodes=tw&format=json&limit=1&accept-language=zh-TW`
- **必須**帶 `User-Agent: Navigator-POI-Verifier/0.1`（Nominatim 要求）
- rate limit：1 req/s，Prototype 階段手動控制即可（`await sleep(1100)`）

#### `src/validators/index.ts`

交叉驗證協調器邏輯：

1. 並行呼叫 Google Places + OSM（`Promise.all`）
2. 至少一個來源回傳結果 → `exists = true`
3. 兩個都回傳 → `reliability_score = 0.85–1.0`
4. 只有一個 → `reliability_score = 0.5–0.7`
5. 都沒有 → `exists = false`，`reliability_score = 0`

---

### Step 3：實作 LLM 整合層（`src/enrichers/`）

這是成本最敏感的部分，**一次 LLM 呼叫做三件事**：

1. 從 Google Places + OSM + blog post 原始資料萃取 `facts`（補缺、統一格式）
2. 判斷 L0–L3 等級並給出 `level_reasoning`
3. 產出 `backup_logic`

#### System Prompt 設計

```
你是 Navigator 旅遊系統的景點資訊分析師，負責：
1. 整合多個資料來源，萃取可信的景點事實資訊
2. 根據景點屬性與旅行脈絡，判斷景點的彈性等級（L0–L3）
3. 為可替換景點產出備案邏輯
4. 以部落格/旅遊文章補足官方資料的觀點，讓結果更貼近旅客實際體驗

L0–L3 等級定義：
- L0 絕對錨點：有預訂或門票、系統禁止自動替換
- L1 彈性錨點：主要目的地、可平移時段但不換景點
- L2 條件變動：天氣敏感、雨天可換室內同類景點
- L3 水位調節：沿路順遊、隨時可 swap

你要特別注意：政府或官方資訊經常會使用行銷化、過度美化的描述，請優先以 blog post 的最近日期和實際遊客回饋來驗證「目前真實狀態」，並在輸出中加上 `latest_blog_post_date`。

回傳格式必須是合法 JSON，不要加 markdown code block。
```

#### User Prompt 模板

```
景點名稱：{name}
座標：{latitude}, {longitude}
使用者描述：{user_description}
旅行人數：{group_size}
旅行 vibe：{vibe_tags}

Google Places 資料：
{google_places_raw_json}

OSM 資料：
{osm_raw_json}

Blog Post 資料：
{blog_post_raw_json}

請輸出以下 JSON 結構：
{
  "facts": {
    "official_name": "...",
    "address": "...",
    "hours": "...",
    "average_stay_minutes": 數字,
    "is_indoor": true/false,
    "weather_sensitivity": "low" | "medium" | "high",
    "latest_blog_post_date": "YYYY-MM-DD"
  },
  "suggested_level": 0-3,
  "level_reasoning": "說明為何給這個等級",
  "backup_logic": {
    "strategy_type": "swap_same_level" | "switch_time_slot" | "cancel_with_notice",
    "description": "...",
    "candidate_pool_tags": ["..."],
    "proximity_threshold_meters": 數字
  },
  "tourist_friendly_description": "用旅客角度描述這個景點的吸引力、注意事項或建議"
}
```

#### `src/enrichers/level-classifier.ts`

在送 LLM 前先跑 Rule-based 預分類（降低 LLM 判斷負擔）：

```typescript
function preClassifyLevel(
  poi: PoiInput,
  google: GooglePlacesRaw,
): 0 | 1 | 2 | 3 | null {
  if (google.business_status === "CLOSED_PERMANENTLY") return null;
  // requires_reservation 欄位目前靠 LLM 判斷，rule-based 留 null
  // 其他 rule 可以在此擴充
  return null; // 讓 LLM 決定
}
```

Prototype 階段 rule-based 先回傳 `null`（全部讓 LLM 跑），後續可以加規則降成本。

#### `src/enrichers/multi-criteria-ranker.ts`（新增）

多準則排序模組，用來對備案候選池進行加權評分：

```typescript
// 預設權重配置（加總必須 = 1.0；原版本加總為 1.5，已修正）
const DEFAULT_WEIGHTS: MultiCriteriaWeights = {
  rating: 0.15,               // 基礎品質
  review_count: 0.10,         // 聲量
  distance: 0.15,             // 距離
  weather_compatibility: 0.20, // 氣候相容 (核心變數)
  opening_hours_margin: 0.10,  // 營業時間餘裕
  group_preference_match: 0.10, // 偏好符合
  cost_within_budget: 0.05,
  crowd_capacity: 0.05,
  energy_consumption: 0.05,
  source_credibility_boost: 0.025,
  recency_bonus: 0.025
};
// 驗算：0.20+0.10+0.15+0.10+0.05+0.15+0.05+0.05+0.10+0.025+0.025 = 1.0 ✓

// 動態調整權重（根據突發狀況；每個 case 完整列出所有欄位，加總 = 1.0）
function adjustWeightsForScenario(
  scenario: "heavy_rain" | "closure" | "fatigue",
): MultiCriteriaWeights {
  switch (scenario) {
    case "heavy_rain":
      return {
        weather_compatibility: 0.35,
        distance: 0.15, rating: 0.15, opening_hours_margin: 0.10,
        crowd_capacity: 0.05, energy_consumption: 0.05,
        group_preference_match: 0.07, review_count: 0.05,
        cost_within_budget: 0.03, source_credibility_boost: 0.025, recency_bonus: 0.025,
      }; // sum = 1.0 ✓
    case "closure":
      return {
        opening_hours_margin: 0.30,
        distance: 0.20, rating: 0.15, weather_compatibility: 0.10,
        crowd_capacity: 0.08, energy_consumption: 0.05,
        group_preference_match: 0.05, review_count: 0.04,
        cost_within_budget: 0.02, source_credibility_boost: 0.01, recency_bonus: 0.00,
      }; // sum = 1.0 ✓
    case "fatigue":
      return {
        energy_consumption: 0.30,
        distance: 0.20, crowd_capacity: 0.15, rating: 0.12,
        opening_hours_margin: 0.10, weather_compatibility: 0.05,
        group_preference_match: 0.05, review_count: 0.02,
        cost_within_budget: 0.01, source_credibility_boost: 0.00, recency_bonus: 0.00,
      }; // sum = 1.0 ✓
  }
}

// 計分函式
function scoreCandidate(
  poi: POI,
  weights: MultiCriteriaWeights,
  context: { current_position; remaining_time; user_energy; group_preferences },
): number {
  let score = 0;

  score += (poi.rating / 5) * weights.rating * 100;
  score +=
    (Math.log(poi.review_count + 1) / Math.log(1000)) *
    weights.review_count *
    100;
  score += (1 - Math.min(poi.distance_km, 5) / 5) * weights.distance * 100;
  score +=
    Math.min(poi.opening_hours_margin_minutes / 60, 1) *
    weights.opening_hours_margin *
    100;
  score += (poi.cost_within_budget ? 1 : 0) * weights.cost_within_budget * 100;

  score += poi.weather_compatibility * weights.weather_compatibility * 100;
  score += (1 - poi.crowd_level) * weights.crowd_capacity * 100;
  score +=
    (1 - poi.energy_consumption / 100) * weights.energy_consumption * 100;
  score +=
    matchUserPreferences(poi, context.group_preferences) *
    weights.group_preference_match *
    100;

  // source_reliability_score 取代原本未定義的 primary_source_credibility
  score +=
    (poi.source_reliability_score ?? 0) *
    weights.source_credibility_boost *
    100;

  // 用 last_verified_at 計算距今天數，取代原本未定義的 days_since_update
  const daysSinceUpdate =
    (Date.now() - new Date(poi.last_verified_at).getTime()) / 86_400_000;
  score +=
    (1 - Math.min(daysSinceUpdate / 180, 1)) *
    weights.recency_bonus *
    100;

  return Math.min(score, 100);
}

// --- 輔助函式 stub（實作時填入真實邏輯）---

function matchUserPreferences(
  poi: POI,
  groupPreferences: string[],
): number {
  if (!groupPreferences?.length) return 0.5; // 無偏好資料，給中性分
  const matches = poi.decision_tags.vibe.filter((v) =>
    groupPreferences.includes(v),
  ).length;
  return Math.min(matches / groupPreferences.length, 1);
}

function isUserBudgetFriendly(poi: POI, _context: VerificationContext): boolean {
  // TODO: 接上使用者預算資料後實作；現階段以 cost_within_budget 欄位為準
  return poi.cost_within_budget;
}
```

#### `src/enrichers/resilience-generator.ts`（擴充）

從 `suggested_level` 對應預設的 `proximity_threshold_meters`，並生成多準則排序的備案池：

```typescript
function generateBackupLogic(
  poi: POI,
  level: number,
  context: VerificationContext,
  candidatePool: POI[],
): EnrichmentResult["backup_logic"] | null {
  if (level === 0) {
    return null; // L0 不生成 backup_logic（回傳型別加上 | null）
  }

  const proximityThreshold = {
    1: 10000, // L1: 10km
    2: 5000, // L2: 5km
    3: 2000, // L3: 2km
  }[level];

  // 嚴格檢查機制：篩掉不適合的景點
  const qualified = candidatePool.filter((candidate) => {
    const disqualifications = [];

    if (candidate.current_crowd_level === "extremely_busy") {
      disqualifications.push("人潮爆滿");
    }
    if (candidate.opening_hours_margin_minutes < 5) {
      disqualifications.push("即將打烊");
    }
    if (
      candidate.last_update_date < Date.now() - 30 * 24 * 60 * 60 * 1000 &&
      !candidate.requires_reservation
    ) {
      disqualifications.push("官方資訊 > 30 天未更新");
    }
    if (!isUserBudgetFriendly(candidate, context)) {
      disqualifications.push("費用超出預算");
    }
    if (candidate.touches_group_taboo) {
      disqualifications.push("觸碰成員禁忌");
    }

    return disqualifications.length === 0;
  });

  // 多準則排序（scenario 為 optional，沒傳時用預設權重）
  const weights = context.scenario
    ? adjustWeightsForScenario(context.scenario)
    : DEFAULT_WEIGHTS;
  const scored = qualified
    .map((poi) => ({
      ...poi,
      multi_criteria_score: scoreCandidate(poi, weights, context),
    }))
    .sort((a, b) => b.multi_criteria_score - a.multi_criteria_score);

  return {
    strategy_type: "swap_same_level",
    description: `備案池已根據評分、距離、營業時間、天氣相容度等準則排序`,
    candidate_pool_tags: scored
      .slice(0, 3)
      .flatMap((p) => p.decision_tags?.vibe ?? []),
    proximity_threshold_meters: proximityThreshold,
    recommended_backup: scored[0]?.poi_id,
  };
}
```

---

### Step 4：實作主 Agent（`src/agent.ts`）

主邏輯的串接流程：

```typescript
async function verifyPoi(
  input: PoiInput,
  context?: VerificationContext,
): Promise<PoiVerifierOutput> {
  // 1. 外部 API 查詢（並行）
  const [googleRaw, osmRaw] = await Promise.all([
    queryGooglePlaces(input),
    queryOsm(input),
  ]);

  // 2. 計算 reliability_score（不用 LLM）
  const preliminaryVerification = crossValidate(googleRaw, osmRaw);
  if (!preliminaryVerification.exists) {
    return buildNotFoundResult(input, preliminaryVerification);
  }

  // 3. LLM 一次呼叫（facts + level + backup_logic）
  const llmOutput = await callLlm(input, context, googleRaw, osmRaw);

  // 4. 組裝最終輸出
  return assembleOutput(input, preliminaryVerification, llmOutput);
}
```

**錯誤處理原則**：

- Google Places 失敗 → 繼續跑 OSM + LLM，降低 reliability_score
- OSM 失敗 → 同上
- LLM 失敗 → fallback 到 Claude Haiku；Haiku 也失敗 → 回傳 partial result（facts 為空，level = null）
- 不要讓任何單點失敗直接 crash 整個 Agent

---

### Step 5：撰寫測試

#### `tests/validators.test.ts`

測試重點：

- Google Places 回傳 CLOSED_PERMANENTLY 時，`exists = false`
- OSM 找不到結果時，函式回傳 `null` 而非 throw
- 兩個來源都有結果時，`reliability_score >= 0.85`

使用真實 API（Prototype 不用 mock），但帶固定的測試景點：

- 陽明山竹子湖海芋（座標：25.168, 121.541）— 應該能找到
- 一個不存在的假地名（例：「台北星球大戰主題樂園」）— 應該 `exists = false`

#### `tests/enrichers.test.ts`

測試重點：

- L0 景點不生成 backup_logic
- level_reasoning 不能是空字串
- backup_logic.proximity_threshold_meters 符合等級對應值

#### `tests/integration.test.ts`

端對端測試：

- 跑完整 `verifyPoi()` 流程，輸出合法的 `PoiVerifierOutput` JSON
- 輸出寫入 `tests/fixtures/verification_report_{poi_name}.json` 供人工審查
- 記錄 `cost_estimate.tokens_used`，超過 1500 tokens 就 console.warn

---

### Step 5.5：嚴格檢查機制 — Disqualification Rules

在產出備案時，必須自動篩掉高風險景點，避免導向更糟結果：

```typescript
type DisqualificationReason =
  | "人潮爆滿"          // Google Maps 即時人流 > 80%
  | "即將打烊"          // opening_hours_margin < 5 分鐘
  | "資訊過時"          // 官方資訊 > 30 天未更新（預約景點除外）
  | "費用超預算"        // cost > user_budget × 1.1
  | "觸碰禁忌"          // poi.tags 與 user_taboos 交集
  | "交通不達"          // 無合適大眾運輸，且距離 > user_tolerance
  | "備案不足"          // 推薦景點 < 目標景點體驗度 20%
  | "未驗證"            // 該景點未在驗證池中
  | "信度過低";         // 多來源聚合信度 < 0.3

// 應變流程中檢查順序（務必嚴格）：
1. 人潮 API 查詢 → 若爆滿直接刪除
2. 開放時間檢查 → 若 < 5 分鐘直接刪除
3. 資訊時效檢查 → 若 > 30 天未驗證 → 建議致電
4. 預算檢查 → 若超預算直接刪除
5. 群組禁忌檢查 → 若觸碰禁忌直接刪除
6. 信度檢查 → 多來源聚合信度 < 0.5 → 標記警告
```

---

### Step 6：CLI 執行腳本（Demo 用）

在 `agents/poi-verifier/` 根目錄建立 `verify-poi.ts`：

```typescript
// 使用方式：npx ts-node verify-poi.ts "竹子湖海芋" 25.168 121.541
const [, , name, lat, lng] = process.argv;
const result = await verifyPoi({
  name,
  location: { latitude: +lat, longitude: +lng },
});
console.log(JSON.stringify(result, null, 2));
```

Demo 場景腳本（`demo-scenarios.ts`）跑兩個極端案例：

1. **正常案例**：竹子湖海芋 → 應得到 L2、swap 策略
2. **異常案例**：找一個已知永久歇業的景點 → 應得到 `exists: false`

---

## 環境變數

在 repo 根目錄 `.env.local`（不要 commit）加入：

```
GOOGLE_PLACES_API_KEY=你的金鑰
# Gemini
GEMINI_API_KEY=你的金鑰
# Claude（fallback 用）
ANTHROPIC_API_KEY=你的金鑰
```

Agent 從 `process.env` 讀取，**不要 hardcode**，也不要在前端呼叫（會 expose key）。

---

## 驗收檢查清單

在 PR / Demo 前確認以下項目：

- [ ] `src/types.ts` 所有型別定義完整，無 `any`；含 `SourceMetadata`、`time_decay_factor`、`MultiCriteriaWeights`
- [ ] `validators/google-places.ts` 能從真實 API 取得竹子湖海芋資料
- [ ] `validators/osm.ts` 附上正確 User-Agent，不觸發 Nominatim 封鎖
- [ ] `validators/blog-search.ts` 能透過搜尋引擎或內容抓取取得部落格文章，並標註 `latest_blog_post_date`
- [ ] `validators/index.ts` 實作時效性衰減聚合邏輯，輸出 `source_breakdown` 與 `source_citation`
- [ ] `enrichers/multi-criteria-ranker.ts` 實作動態權重調整與多準則計分
- [ ] `enrichers/resilience-generator.ts` 包含嚴格檢查機制（人潮、開放時間、資訊時效、預算、禁忌）
- [ ] `agent.ts` 任一 API 失敗時不 crash，有 graceful degradation
- [ ] LLM 呼叫單次 token 使用 < 1500（約 NT$1.5）
- [ ] `tests/integration.test.ts` 能輸出可讀的 JSON 報告，含來源信度分解與備案排序分數
- [ ] CLI `verify-poi.ts` 能從命令列執行並印出結果，包括來源分級和時效性警告
- [ ] `demo-scenarios.ts` 包含至少 3 個場景：(1) 晴天正常驗證 (2) 下雨應變 (3) 景點關閉應變
- [ ] 備案推薦欄位 `recommended_backup` 在前 3 個備案中選出最高分
- [ ] 所有被嚴格檢查篩掉的景點都標註 `disqualification_reasons` 供人工審查
- [ ] 多來源聚合信度 < 0.5 時，在輸出中標記 ⚠️ 建議確認
- [ ] 來源分級檢查：官方資訊 > 2 個月未更新時自動降級，半官方 > 30 天時提示致電
- [ ] `.env.local` 不在 git 追蹤範圍（確認 `.gitignore`）
- [ ] L0 景點的 backup_logic 為 null，不是空物件

---

## 實作順序建議

```
types.ts（新增 SourceMetadata、time_decay_factor、MultiCriteriaWeights 欄位）
  → validators/google-places.ts
  → validators/osm.ts
  → validators/blog-search.ts（新增）
  → validators/index.ts（交叉驗證 + 時效性衰減聚合）
  → enrichers/level-classifier.ts（rule-based 骨架）
  → enrichers/multi-criteria-ranker.ts（新增）
  → enrichers/resilience-generator.ts（擴充，加入嚴格檢查）
  → enrichers/index.ts（LLM 整合，system prompt + user prompt）
  → agent.ts（串接全部）
  → tests/validators.test.ts（加入時效性衰減測試）
  → tests/enrichers.test.ts（加入排序與篩選測試）
  → tests/integration.test.ts
  → verify-poi.ts（CLI，展示來源信度 + 備案排序）
  → demo-scenarios.ts（Demo 腳本：驗證應變場景）
```

每個檔案完成後跑一次快速 smoke test，確認不 crash 再往下。
不要等全部寫完才測試。

---

**建立日期**：2026-04-30
**對應 README**：[agents/poi-verifier/README.md](./README.md)
**對應 CLAUDE.md**：section 9（當前進度）
