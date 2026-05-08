# POI 驗證 Agent — Prototype 設計計畫與實作步驟（0508 修訂版）

> **⚠️ 此為「增量修訂」文件，不是從頭實作的 prompt。**
> 程式碼已依照原始版本（`poi-verifier腳本附prompt.md`）實作完畢。
> **讀這份文件時，只需套用「0508 修訂說明」列出的變更，不要重寫已存在的檔案。**
> 若需要了解完整架構背景，請先閱讀原始版本再回來看修訂說明。

---

## 0508 修訂說明（5/6 組員討論後更新）

本次修訂針對 5/6 報告後討論的四個核心問題：

| # | 問題 | 修訂位置 |
|---|------|---------|
| 1 | 部落格搜尋無法回傳日期 | `validators/blog-search.ts`、`validators/index.ts` |
| 2 | 部落格回傳同名但不同地點的景點 | `validators/blog-search.ts` |
| 3 | 測試景點 L2 佔 90%；L0 定義不夠明確；同座標預約/一般點處理 | `enrichers/index.ts`（SYSTEM_PROMPT）、`enrichers/level-classifier.ts` |
| 4 | Reliability score 算法問題（單一來源找到景點時分數過低）| `validators/index.ts` |
| 4b | 應變Agent（`resilience-generator.ts`）的「信度過低」淘汰門檻（`< 0.3`）是否需要跟著調整？ — <!-- 待組員確認 --> | 暫未修改，詳見下方 Step 1.5 說明 |

**暫緩（非程式碼修訂）：**
- 比較系統與一般 LLM 的差異 → Demo 場景腳本補充說明
- Apify 爬蟲替代方案 → 待評估，見下方附錄

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
            先跑 Rule-based（預約關鍵字 → L0；has_reservation → 傾向 L0/L1；is_outdoor → 傾向 L2/L3）
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

## 實作步驟（供參考；已實作部分請勿重寫，僅修改 0508 修訂說明標注的內容）

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
│   │   ├── blog-search.ts        # Blog Post 搜尋與解析（含地點篩選、日期萃取）
│   │   └── index.ts             # 交叉驗證協調器 + 時效性衰減
│   ├── enrichers/
│   │   ├── level-classifier.ts  # L0-L3 分級（Rule-based 優先）
│   │   ├── multi-criteria-ranker.ts  # 多準則排序
│   │   ├── resilience-generator.ts  # backup_logic 生成
│   │   └── index.ts             # 增強流程控制（LLM 呼叫）
│   └── agent.ts                 # 主 Agent（串接所有模組）
├── tests/
│   ├── validators.test.ts
│   ├── enrichers.test.ts
│   └── integration.test.ts
├── scripts/
│   └── ddg_search.py            # DuckDuckGo Python 橋接（已含日期萃取）
├── PROMPT.md                    # 原始版本
├── poi-verifier腳本附prompt_0508.md  # 本檔（0508 修訂版）
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

#### 多來源聚合邏輯（0508 修訂：動態權重正規化）

**問題背景（5/6 回饋）**：部分景點只有 Google 或只有 OSM 能查到，固定權重導致這些景點的 reliability_score 被錯誤壓低。

**修訂後算法**：

```
baseWeights = { google: 0.50, osm: 0.30 }

// 若 OSM 找不到，將 OSM 的 0.30 重分配給 Google
googleWeight = google && osm ? 0.50 : google ? 0.65 : 0
osmWeight    = google && osm ? 0.30 : osm    ? 0.50 : 0

// Blog 固定 0.25（補充性來源，不納入正規化）
// 部落格日期未知時，保守估計為 180 天前（避免虛增 recency bonus）
```

**說明**：
- 兩個結構化來源都找到：維持原始 Google 0.50、OSM 0.30
- 只有 Google：Google 提升至 0.65（補償 OSM 缺席）
- 只有 OSM：OSM 提升至 0.50（補償 Google 缺席）
- 部落格的 0.25 不受影響，維持補充性角色

**應變Agent 淘汰門檻的連動影響 — <!-- 待組員確認 -->**

`enrichers/resilience-generator.ts` 中有以下淘汰規則：

```typescript
if (candidate.source_reliability_score < 0.3) {
  reasons.push('信度過低')
}
```

以舊算法，OSM 單一來源的最高得分約 0.24（`0.30 × 0.80`），低於 0.3，導致這類備案景點被錯誤淘汰。
以新算法，OSM 單一來源最高得分提升至 0.40（`0.50 × 0.80`），可通過門檻。

**目前做法**：不修改 0.3 的門檻，由修正後的驗證算法間接修正此問題。
**待確認**：若重新跑測試後仍有備案景點被「信度過低」誤殺，需評估是否將門檻降至 0.25，或在淘汰邏輯中區分「OSM 單一來源」與「真正低信度」兩種情況。

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

#### `src/validators/blog-search.ts`（0508 修訂）

**修訂 1：日期萃取**

Python 側 `ddg_search.py` 已在 `extract_date()` 中支援 ISO 格式（`2025-03-15`）及中文格式（`2025年3月15日`）。TypeScript 側額外提供 `extractDateFromSnippet()` 函式作為備援：

```typescript
export function extractDateFromSnippet(text: string): string | null {
  // 中文格式：2025年3月15日
  const cnMatch = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/)
  if (cnMatch) {
    const [, y, m, d] = cnMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // ISO：2025-03-15
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (isoMatch) return isoMatch[0]
  // 斜線格式：2025/3/15
  const slashMatch = text.match(/\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/)
  if (slashMatch) {
    const [, y, m, d] = slashMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}
```

**修訂 2：地點篩選（防止同名異地誤判）**

```typescript
const TW_REGIONS = ['台北', '新北', '基隆', '宜蘭', '花蓮', '台東', '澎湖', '金門', '馬祖',
  '桃園', '新竹', '苗栗', '台中', '彰化', '南投', '雲林', '嘉義', '台南',
  '高雄', '屏東', '陽明山', '北海岸', '東北角']

// searchBlogPosts：將 user_description 中識別到的縣市加入搜尋詞
const regionHint = poi.user_description
  ? (TW_REGIONS.find(r => poi.user_description!.includes(r)) ?? '')
  : ''
const query = `${poi.name} ${regionHint} 旅遊 心得 2024 OR 2025`.trim()

// filterByLocation：搜尋後再以地區關鍵字篩選結果
function filterByLocation(posts: BlogPostRaw[], poi: PoiInput): BlogPostRaw[] {
  const regionInDesc = poi.user_description
    ? TW_REGIONS.find(r => poi.user_description!.includes(r))
    : undefined
  if (!regionInDesc) return posts
  const relevant = posts.filter(p =>
    `${p.title} ${p.snippet}`.includes(regionInDesc) || `${p.title} ${p.snippet}`.includes(poi.name)
  )
  return relevant.length > 0 ? relevant : posts  // fallback: 篩完沒剩就保留全部
}
```

**修訂 3：`latestBlogDate` 補上 snippet 備援萃取 + ISO 格式驗證**

```typescript
export function latestBlogDate(posts: BlogPostRaw[]): string | undefined {
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
  const dates = posts
    .map((p) => p.published_date ?? extractDateFromSnippet(p.snippet))
    .filter((d): d is string => !!d && ISO_DATE.test(d))
    .sort()
    .reverse()
  return dates[0]
}
```

#### `src/validators/index.ts`（0508 修訂）

交叉驗證協調器邏輯：

1. 並行呼叫 Google Places + Blog search（`Promise.all`）
2. 序列呼叫 OSM（1 req/s rate limit）
3. Google 結果距離超過 50km → 視為地址不符，排除
4. **（新）動態權重正規化**：見 Step 1.5 修訂算法
5. **（新）部落格日期未知時**：用 180 天前的日期（保守），而非 today（避免虛增 recency confidence）

---

### Step 3：實作 LLM 整合層（`src/enrichers/`）

這是成本最敏感的部分，**一次 LLM 呼叫做三件事**：

1. 從 Google Places + OSM + blog post 原始資料萃取 `facts`（補缺、統一格式）
2. 判斷 L0–L3 等級並給出 `level_reasoning`
3. 產出 `backup_logic`

#### System Prompt 設計（0508 修訂版）

```
你是 Navigator 旅遊系統的景點資訊分析師，負責：
1. 整合多個資料來源，萃取可信的景點事實資訊
2. 根據景點屬性與旅行脈絡，判斷景點的彈性等級（L0–L3）
3. 為可替換景點產出備案邏輯
4. 以部落格/旅遊文章補足官方資料的觀點，讓結果更貼近旅客實際體驗

L0–L3 等級定義（嚴格遵守，避免過度集中在 L2）：
- L0 絕對錨點：【必須事先預約或購票】才能入場的景點
  （例：預約制餐廳、需購門票景點、訂位制設施）
  若免費可自由入場，不得歸類 L0。系統禁止自動替換。
- L1 彈性錨點：本次行程主要目的地，有明確時段安排，
  無需事先預訂但不換景點，可平移時段。
- L2 條件變動：天氣敏感的戶外景點，晴天才去、下雨可換室內同類；
  或「想去但非必去」的一般景點。
- L3 水位調節：沿途順遊的附加景點，隨時可跳過或替換，不影響行程骨架。

等級分佈參考（避免 L2 佔比超過 50%）：
  L0 約 5–15%、L1 約 15–25%、L2 約 35–45%、L3 約 20–35%

特別提示：同一座標若同時存在「需預約版本」（例如特定導覽）與
「免預約一般版本」，請視為兩個不同景點，分別給予 L0 與 L2/L3，
並在 level_reasoning 中說明。

政府或官方資訊經常使用行銷化、過度美化的描述，請優先以 blog post 的最近日期
和實際遊客回饋驗證「目前真實狀態」，並在輸出中加上 latest_blog_post_date。

回傳格式必須是合法 JSON，不要加 markdown code block。
```

#### `src/enrichers/level-classifier.ts`（0508 修訂）

新增預約關鍵字規則：

```typescript
const RESERVATION_KEYWORDS = ['預約', '訂位', '購票', '門票', '需預訂', '要預訂', '預訂制', '預約制']

export function preClassifyLevel(
  poi: PoiInput,
  google: GooglePlacesRaw | null,
): 0 | 1 | 2 | 3 | null {
  if (google?.business_status === 'CLOSED_PERMANENTLY') return null

  // L0 hint: user description or name explicitly mentions reservation/ticket required
  const text = `${poi.name} ${poi.user_description ?? ''}`.toLowerCase()
  if (RESERVATION_KEYWORDS.some(k => text.includes(k))) return 0

  return null  // let LLM decide
}
```

**重要**：`preClassifyLevel` 的回傳值現在會被傳入 `buildUserPrompt`，注入為 LLM 的「系統規則提示」，確保 LLM 的最終輸出尊重 rule-based 判斷。

#### User Prompt 模板（含規則提示注入）

```
景點名稱：{name}
座標：{latitude}, {longitude}
使用者描述：{user_description}
旅行人數：{group_size}
旅行 vibe：{vibe_tags}
系統規則提示：此景點已被規則引擎初步判定為 L{ruleLevel}，請確認後輸出相同或更合理的等級。（僅當 ruleLevel 不為 null 時出現）

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
    "latest_blog_post_date": "YYYY-MM-DD 或 null"
  },
  "suggested_level": 0-3,
  "level_reasoning": "說明為何給這個等級（L0 必須說明需預約的依據）",
  "backup_logic": {
    "strategy_type": "swap_same_level" | "switch_time_slot" | "cancel_with_notice",
    "description": "...",
    "candidate_pool_tags": ["..."],
    "proximity_threshold_meters": 數字
  },
  "tourist_friendly_description": "用旅客角度描述這個景點的吸引力、注意事項或建議"
}
```

#### `src/enrichers/multi-criteria-ranker.ts`

多準則排序模組，用來對備案候選池進行加權評分：

```typescript
// 預設權重配置（加總必須 = 1.0；原版本加總為 1.5，已修正）
const DEFAULT_WEIGHTS: MultiCriteriaWeights = {
  rating: 0.15,
  review_count: 0.10,
  distance: 0.15,
  weather_compatibility: 0.20,
  opening_hours_margin: 0.10,
  group_preference_match: 0.10,
  cost_within_budget: 0.05,
  crowd_capacity: 0.05,
  energy_consumption: 0.05,
  source_credibility_boost: 0.025,
  recency_bonus: 0.025
};
// 驗算：0.15+0.10+0.15+0.20+0.10+0.10+0.05+0.05+0.05+0.025+0.025 = 1.0 ✓

// 動態調整權重（根據突發狀況）
function adjustWeightsForScenario(
  scenario: "heavy_rain" | "closure" | "fatigue",
): MultiCriteriaWeights { ... }
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
  const [googleRaw, blogs] = await Promise.all([queryGooglePlaces(input), searchBlogPosts(input)])
  const osmRaw = await queryOsm(input)  // sequential: 1 req/s

  // 2. 計算 reliability_score（不用 LLM）
  const preliminaryVerification = crossValidate(googleRaw, osmRaw, blogs)
  if (!preliminaryVerification.exists) {
    return buildNotFoundResult(input, preliminaryVerification)
  }

  // 3. LLM 一次呼叫（facts + level + backup_logic）
  const llmOutput = await enrich(input, context, googleRaw, osmRaw, blogs)

  // 4. 組裝最終輸出
  return assembleOutput(input, preliminaryVerification, llmOutput)
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
- **（新）只有 Google 有結果時，`reliability_score >= 0.55`**（驗證動態權重正規化）
- **（新）blog post 日期欄位為 null 時，`validators/index.ts` 使用 180 天前日期而非 today**

使用真實 API（Prototype 不用 mock），但帶固定的測試景點：

- 陽明山竹子湖海芋（座標：25.168, 121.541）— 應該能找到
- 一個不存在的假地名（例：「台北星球大戰主題樂園」）— 應該 `exists = false`

#### `tests/enrichers.test.ts`

測試重點：

- L0 景點不生成 backup_logic
- level_reasoning 不能是空字串
- backup_logic.proximity_threshold_meters 符合等級對應值
- **（新）user_description 含「預約」時，preClassifyLevel 回傳 0**
- **（新）LLM prompt 中出現規則提示 hint 字串**

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
  | "人潮爆滿"
  | "即將打烊"
  | "資訊過時"
  | "費用超預算"
  | "觸碰禁忌"
  | "交通不達"
  | "備案不足"
  | "未驗證"
  | "信度過低";

// 應變流程中檢查順序（務必嚴格）：
// 1. 人潮 API → 若爆滿直接刪除
// 2. 開放時間 → 若 < 5 分鐘直接刪除
// 3. 資訊時效 → 若 > 30 天未驗證 → 建議致電
// 4. 預算 → 若超預算直接刪除
// 5. 群組禁忌 → 若觸碰禁忌直接刪除
// 6. 信度 → 聚合信度 < 0.5 → 標記警告
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

Demo 場景腳本（`demo-scenarios.ts`）跑三個案例：

1. **正常案例**：竹子湖海芋 → 應得到 L2、swap 策略
2. **預約景點**：user_description 含「預約」→ 應得到 L0、backup_logic = null
3. **異常案例**：找一個已知永久歇業的景點 → 應得到 `exists: false`

---

## 環境變數

在 repo 根目錄 `.env.local`（不要 commit）加入：

```
GOOGLE_PLACES_API_KEY=你的金鑰
GEMINI_API_KEY=你的金鑰
ANTHROPIC_API_KEY=你的金鑰（Claude fallback 用）
SERPER_API_KEY=你的金鑰（Blog 搜尋備援用）
```

Agent 從 `process.env` 讀取，**不要 hardcode**，也不要在前端呼叫（會 expose key）。

---

## 驗收檢查清單（0508 更新）

- [ ] `src/types.ts` 所有型別定義完整，無 `any`；含 `SourceMetadata`、`time_decay_factor`、`MultiCriteriaWeights`
- [ ] `validators/google-places.ts` 能從真實 API 取得竹子湖海芋資料
- [ ] `validators/osm.ts` 附上正確 User-Agent，不觸發 Nominatim 封鎖
- [ ] `validators/blog-search.ts` 搜尋詞含地區 hint；`filterByLocation` 篩掉同名異地文章
- [ ] `validators/blog-search.ts` `latestBlogDate` 能從 snippet 萃取中文日期（`extractDateFromSnippet`）
- [ ] `validators/index.ts` 動態權重：只有 Google 時 weight=0.65；只有 OSM 時 weight=0.50
- [ ] `validators/index.ts` 部落格日期未知時，保守使用 180 天前（非 today）
- [ ] `enrichers/level-classifier.ts` 含「預約/購票」關鍵字時回傳 L0 hint
- [ ] `enrichers/index.ts` SYSTEM_PROMPT 中 L0 定義明確為「必須事先預約或購票」
- [ ] `enrichers/index.ts` SYSTEM_PROMPT 含等級分佈參考（L0 5–15%、L1 15–25%、...）
- [ ] `enrichers/index.ts` SYSTEM_PROMPT 含「同座標預約/一般版本」處理說明
- [ ] `enrichers/index.ts` `buildUserPrompt` 有 `ruleLevel` 參數且注入提示到 prompt
- [ ] `enrichers/multi-criteria-ranker.ts` 實作動態權重調整與多準則計分
- [ ] `enrichers/resilience-generator.ts` 包含嚴格檢查機制（人潮、開放時間、資訊時效、預算、禁忌）
- [ ] `agent.ts` 任一 API 失敗時不 crash，有 graceful degradation
- [ ] LLM 呼叫單次 token 使用 < 1500（約 NT$1.5）
- [ ] `tests/validators.test.ts` 含單一來源 reliability_score 下限測試
- [ ] `tests/enrichers.test.ts` 含 preClassifyLevel 關鍵字規則測試
- [ ] `tests/integration.test.ts` 能輸出可讀的 JSON 報告，含來源信度分解與備案排序分數
- [ ] CLI `verify-poi.ts` 能從命令列執行並印出結果
- [ ] `demo-scenarios.ts` 包含 3 個場景：正常驗證、預約景點（L0）、景點關閉
- [ ] `.env.local` 不在 git 追蹤範圍（確認 `.gitignore`）
- [ ] L0 景點的 backup_logic 為 null，不是空物件

---

## 附錄：Apify 爬蟲替代方案（待評估）

5/6 討論提到「可使用 Apify 來寫網頁爬蟲，不用依賴爬蟲 API，以省 Token」。

**評估重點**：

| 方案 | 優點 | 缺點 |
|------|------|------|
| 現行 DuckDuckGo (ddgs Python) | 免費、無配額、已上線 | 日期有時為 null；無法爬全文 |
| Serper (備援) | 有日期欄位較穩定 | 有 API 配額費用 |
| Apify Actor | 可爬旅遊論壇/痞客邦全文 | 需額外費用與設定；延遲較高 |

**建議**：Prototype 階段維持 DDG + Serper 組合即可；若 Demo 前日期精準度不足，再評估 Apify 的特定 Actor（如 Blog Article Scraper）。

---

## 實作順序建議

```
types.ts（含 SourceMetadata、time_decay_factor、MultiCriteriaWeights）
  → validators/blog-search.ts（地點篩選 + 日期萃取）
  → validators/google-places.ts
  → validators/osm.ts
  → validators/index.ts（動態權重 + 保守日期回退）
  → enrichers/level-classifier.ts（預約關鍵字規則）
  → enrichers/multi-criteria-ranker.ts
  → enrichers/resilience-generator.ts（嚴格檢查機制）
  → enrichers/index.ts（SYSTEM_PROMPT 0508 版 + ruleLevel hint）
  → agent.ts（串接全部）
  → tests/validators.test.ts（含單一來源測試）
  → tests/enrichers.test.ts（含關鍵字規則測試）
  → tests/integration.test.ts
  → verify-poi.ts（CLI）
  → demo-scenarios.ts（3 個 Demo 場景）
```

每個檔案完成後跑一次快速 smoke test，確認不 crash 再往下。
不要等全部寫完才測試。

---

**建立日期**：2026-04-30
**修訂日期**：2026-05-08（5/6 組員討論後更新）
**對應 README**：[agents/poi-verifier/README.md](./README.md)
**對應 CLAUDE.md**：section 9（當前進度）
