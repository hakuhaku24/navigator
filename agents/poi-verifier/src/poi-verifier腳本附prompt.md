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
                        ↓
            [Step 2] LLM 交叉驗證層（Gemini 1.5 Flash）
            對比兩來源，判斷資訊一致性、填補缺漏欄位
            輸出 reliability_score（0–1）
                        ↓
            [Step 3] L0–L3 分級層（Rule-based + LLM 補充）
            先跑 Rule-based（has_reservation → 傾向 L0/L1，is_outdoor → 傾向 L2/L3）
            再用 LLM 根據 context（vibe_tags、group_size）微調
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
│   │   └── index.ts             # 交叉驗證協調器
│   ├── enrichers/
│   │   ├── level-classifier.ts  # L0-L3 分級（Rule-based 優先）
│   │   ├── resilience-generator.ts  # backup_logic 生成
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

// 驗證結果
interface VerificationResult {
  exists: boolean;
  sources: Array<"google_places" | "osm" | "llm_inferred">;
  reliability_score: number; // 0–1
  facts: {
    official_name: string;
    address: string;
    hours: string;
    average_stay_minutes: number;
    last_verified_at: string; // ISO8601
    is_indoor: boolean;
    weather_sensitivity: "low" | "medium" | "high";
  };
}

// 增強結果
interface EnrichmentResult {
  suggested_level: 0 | 1 | 2 | 3;
  level_reasoning: string;
  backup_logic: {
    strategy_type:
      | "swap_same_level"
      | "switch_time_slot"
      | "cancel_with_notice";
    description: string;
    candidate_pool_tags: string[];
    proximity_threshold_meters: number;
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

1. 從 Google Places + OSM 原始資料萃取 `facts`（補缺、統一格式）
2. 判斷 L0–L3 等級並給出 `level_reasoning`
3. 產出 `backup_logic`

#### System Prompt 設計

```
你是 Navigator 旅遊系統的景點資訊分析師，負責：
1. 整合多個資料來源，萃取可信的景點事實資訊
2. 根據景點屬性與旅行脈絡，判斷景點的彈性等級（L0–L3）
3. 為可替換景點產出備案邏輯

L0–L3 等級定義：
- L0 絕對錨點：有預訂或門票、系統禁止自動替換
- L1 彈性錨點：主要目的地、可平移時段但不換景點
- L2 條件變動：天氣敏感、雨天可換室內同類景點
- L3 水位調節：沿路順遊、隨時可 swap

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

請輸出以下 JSON 結構：
{
  "facts": {
    "official_name": "...",
    "address": "...",
    "hours": "...",
    "average_stay_minutes": 數字,
    "is_indoor": true/false,
    "weather_sensitivity": "low" | "medium" | "high"
  },
  "suggested_level": 0-3,
  "level_reasoning": "說明為何給這個等級",
  "backup_logic": {
    "strategy_type": "swap_same_level" | "switch_time_slot" | "cancel_with_notice",
    "description": "...",
    "candidate_pool_tags": ["..."],
    "proximity_threshold_meters": 數字
  }
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

#### `src/enrichers/resilience-generator.ts`

從 `suggested_level` 對應預設的 `proximity_threshold_meters`：

- L0：不生成 backup_logic（直接回傳 null）
- L1：`proximity_threshold_meters = 10000`
- L2：`proximity_threshold_meters = 5000`
- L3：`proximity_threshold_meters = 2000`

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

- [ ] `src/types.ts` 所有型別定義完整，無 `any`
- [ ] `validators/google-places.ts` 能從真實 API 取得竹子湖海芋資料
- [ ] `validators/osm.ts` 附上正確 User-Agent，不觸發 Nominatim 封鎖
- [ ] `agent.ts` 任一 API 失敗時不 crash，有 graceful degradation
- [ ] LLM 呼叫單次 token 使用 < 1500（約 NT$1.5）
- [ ] `tests/integration.test.ts` 能輸出可讀的 JSON 報告
- [ ] CLI `verify-poi.ts` 能從命令列執行並印出結果
- [ ] `demo-scenarios.ts` 兩個極端案例都能執行並給出預期結果
- [ ] `.env.local` 不在 git 追蹤範圍（確認 `.gitignore`）
- [ ] L0 景點的 backup_logic 為 null，不是空物件

---

## 實作順序建議

```
types.ts
  → validators/google-places.ts
  → validators/osm.ts
  → validators/index.ts（交叉驗證）
  → enrichers/level-classifier.ts（rule-based 骨架）
  → enrichers/resilience-generator.ts
  → enrichers/index.ts（LLM 整合，system prompt + user prompt）
  → agent.ts（串接全部）
  → tests/validators.test.ts
  → tests/enrichers.test.ts
  → tests/integration.test.ts
  → verify-poi.ts（CLI）
  → demo-scenarios.ts（Demo 腳本）
```

每個檔案完成後跑一次快速 smoke test，確認不 crash 再往下。
不要等全部寫完才測試。

---

**建立日期**：2026-04-30
**對應 README**：[agents/poi-verifier/README.md](./README.md)
**對應 CLAUDE.md**：section 9（當前進度）
