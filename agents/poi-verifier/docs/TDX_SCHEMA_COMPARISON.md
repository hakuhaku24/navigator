# TDX Schema vs Navigator POI 欄位設計對照

> **資料來源**：TDX 觀光資訊 API（交通部運輸資料流通服務平臺）  
> 端點前綴：`https://ptx.transportdata.tw/MOTC/v2/Tourism/`  
> 驗證日期：2026-06-25（Live API 實際回應）

---

## 1. TDX 觀光資料 Schema

TDX 觀光 API 提供四種實體：**ScenicSpot（景點）**、**Restaurant（餐廳）**、**Hotel（旅宿）**、**Activity（活動）**。
以下欄位模板來自真實 API 回應，標示 `?` 的欄位為選填（常見為空物件或 null）。

---

### 1-1. ScenicSpot（景點）

```jsonc
{
  "ScenicSpotID":    "C1_376420000A_000253",   // string  唯一識別碼（政府編碼格式）
  "ScenicSpotName":  "石牌縣界公園",             // string  景點名稱
  "DescriptionDetail": "...",                   // string  詳細描述（長文，自由文字）
  "Description":     "...",                    // string  簡短描述（常與 DescriptionDetail 相同）
  "Phone":           "886-3-9312152",          // string  聯絡電話（+ 國碼格式）
  "Address":         "宜蘭縣261頭城鎮北宜公路56.5km處", // string  地址
  "ZipCode":         "261",                    // string  郵遞區號
  "OpenTime":        "全年開放",                // string  開放時間（自由文字，非結構化）
  "TravelInfo":      "國道1號》中清交流道...",   // string? 交通資訊（自由文字）
  "Class1":          "自然風景類",              // string  景點類別（政府分類詞彙）
  "Class2":          null,                     // string? 次分類
  "Class3":          null,                     // string? 三級分類
  "Keyword":         "溫泉,四重溪,車城",        // string? 關鍵字（逗號分隔純文字）
  "WebsiteUrl":      "https://...",            // string? 官方網站 URL
  "Picture": {                                 // object? 圖片（最多 3 組）
    "PictureUrl1":         "https://...",
    "PictureDescription1": "景點外觀",
    "PictureUrl2":         "https://...",
    "PictureDescription2": "...",
    "PictureUrl3":         null,
    "PictureDescription3": null
  },
  "Position": {                                // object  地理座標
    "PositionLon": 121.775,                    //   float  經度 (WGS84)
    "PositionLat": 24.865,                     //   float  緯度 (WGS84)
    "GeoHash":     "wsqt7nd1f"                //   string  GeoHash 字串
  },
  "ParkingPosition": {},                       // object? 停車場座標（同 Position 結構，常為空）
  "City":          "新北市",                   // string  行政縣市
  "SrcUpdateTime": "2026-06-25T01:41:46+08:00", // datetime 原始資料來源更新時間
  "UpdateTime":    "2026-06-25T02:31:56+08:00"  // datetime TDX 平台同步更新時間
}
```

---

### 1-2. Restaurant（餐廳）

```jsonc
{
  "RestaurantID":   "C3_382000000A_206113",    // string
  "RestaurantName": "旺角迷你石頭火鍋",          // string
  "Description":    "...",                     // string  描述（無 DescriptionDetail）
  "Address":        "新北市241三重區正義南路2-1號", // string
  "ZipCode":        "241",                     // string
  "Phone":          "886-2-29747815",          // string
  "OpenTime":       "11:30 ~ 23:30 (過年休除夕~初二)", // string 自由文字
  "Class":          "其他",                    // string  單一分類（無 Class2/Class3）
  "City":           "新北市",                  // string
  "Picture": {                                 // object?
    "PictureUrl1":         "https://...",
    "PictureDescription1": "旺角迷你石頭火鍋客人用餐"
  },
  "Position": { "PositionLon": 121.498, "PositionLat": 25.062, "GeoHash": "wsqqsf2ht" },
  "SrcUpdateTime": "2026-06-25T01:44:16+08:00",
  "UpdateTime":    "2026-06-25T02:31:56+08:00"
}
```

---

### 1-3. Hotel（旅宿）

```jsonc
{
  "HotelID":      "C4_A15010000H_000133",      // string
  "HotelName":    "萬金龍民宿",                  // string
  "Description":  "位於新北市的民宿",             // string
  "Address":      "新北市萬里區萬里加投45之6號",   // string
  "ZipCode":      "207",                       // string
  "Phone":        "886-2-24986166",            // string
  "Fax":          "886-2-24986155",            // string? 傳真（觀光景點無此欄位）
  "Class":        "民宿",                      // string  旅宿類型
  "ServiceInfo":  "無線網路,三溫暖,停車場,溫泉設施,寵物友善旅宿", // string? 設施服務（逗號分隔）
  "ParkingInfo":  "車位:小客車20輛、機車0輛、大客車0輛",         // string? 停車資訊（自由文字）
  "City":         "新北市",                    // string
  "Picture": {
    "PictureUrl1": "https://...", "PictureDescription1": "外觀",
    "PictureUrl2": "https://...", "PictureDescription2": "房間1",
    "PictureUrl3": "https://...", "PictureDescription3": null
  },
  "Position": { "PositionLon": 121.639, "PositionLat": 25.211, "GeoHash": "wsqrrvrpe" },
  "SrcUpdateTime": "2026-06-25T01:46:21+08:00",
  "UpdateTime":    "2026-06-25T02:31:56+08:00"
}
```

---

### 1-4. Activity（活動）

```jsonc
{
  "ActivityID":   "C2_382000000A_003248",       // string
  "ActivityName": "2025文資新生活｜新店十四張歷史建築園區", // string
  "Description":  "...",                       // string
  "Location":     "...",                       // string? 活動地點描述（自由文字，非座標）
  "Address":      "新北市231新店區央北二路206巷6號",       // string
  "Phone":        "886-2-29603456",            // string
  "Organizer":    "新北市政府文化局",            // string  主辦單位（景點/餐廳無此欄位）
  "StartTime":    "2025-03-15T00:00:00+08:00", // datetime 活動開始（景點無此欄位）
  "EndTime":      "2025-12-31T23:59:59+08:00", // datetime 活動結束
  "Class1":       "年度活動",                  // string
  "City":         "新北市",                    // string
  "Picture": {},                               // object?
  "Position": { "PositionLon": 121.527, "PositionLat": 24.980, "GeoHash": "wsqqj7t9d" },
  "SrcUpdateTime": "2026-06-25T01:43:58+08:00",
  "UpdateTime":    "2026-06-25T02:31:56+08:00"
}
```

---

### 1-5. TDX 共用欄位摘要

| 欄位 | ScenicSpot | Restaurant | Hotel | Activity |
|------|:---:|:---:|:---:|:---:|
| `*ID` / `*Name` | ✓ | ✓ | ✓ | ✓ |
| `Description` | ✓ (+ `DescriptionDetail`) | ✓ | ✓ | ✓ |
| `Address` / `ZipCode` / `Phone` | ✓ | ✓ | ✓ | ✓ |
| `OpenTime` | ✓ | ✓ | — | — |
| `Class1` / `Class2` / `Class3` | ✓ | `Class` only | `Class` only | `Class1` |
| `Keyword` | ✓ | — | — | — |
| `WebsiteUrl` | ✓ | — | — | — |
| `TravelInfo` | ✓ | — | — | — |
| `Fax` | — | — | ✓ | — |
| `ServiceInfo` / `ParkingInfo` | — | — | ✓ | — |
| `Organizer` | — | — | — | ✓ |
| `StartTime` / `EndTime` | — | — | — | ✓ |
| `Picture` (1–3 組) | ✓ | ✓ | ✓ | ✓ |
| `Position` (lon/lat/geohash) | ✓ | ✓ | ✓ | ✓ |
| `ParkingPosition` | ✓ | — | — | — |
| `City` | ✓ | ✓ | ✓ | ✓ |
| `SrcUpdateTime` / `UpdateTime` | ✓ | ✓ | ✓ | ✓ |

**TDX 全體缺失欄位**：評分（Rating）、客評數量、室內/室外標記、天氣敏感度、預約需求、語意向量。

---

## 2. Navigator POI Schema

Navigator POI 資料分四層，每層代表不同的處理深度。

### Layer 0 — 前端展示層（`src/data/pois.ts`）

```ts
interface POI {
  id:                   string        // "NCA-001"（自訂格式：縮寫 + 序號）
  name:                 string
  region:               '陽明山' | '北海岸' | '東北角'  // 策展後的旅遊區域分區
  category:             string        // 自訂類別（"自然景觀", "藝術展館", ...）
  level:                0 | 1 | 2 | 3 // L0–L3 韌性分級（見第 3 節）
  weather_sensitivity:  '低' | '中' | '高' | '極高'
  tags:                 string[]      // 多維特性標籤（含 vibe + 功能描述）
  is_indoor:            boolean
  indoor_type:          string        // "表演館" | "美術館" | "" 等
  duration_min:         number        // 預估停留時間（分鐘，已 parse，非自由文字）
  lat:                  number
  lng:                  number
  backup_strategy:      string        // 人工撰寫備援說明
  image_url:            string        // 單一代表圖 URL
  semantic_description: string        // 人工撰寫語意敘述（用於 embedding）
  rating:               number        // 來自 Google Places（TDX 無此欄位）
}
```

### Layer 1 — 結構化豐富層（`data/poi_enriched.json`）

```ts
interface EnrichedPOI {
  poi_id:   string
  name:     string
  location: {
    latitude:  number
    longitude: number
    address:   string
  }
  resilience_metadata: {
    level:               0 | 1 | 2 | 3
    level_name:          string           // "絕對錨點" | "彈性錨點" | ...
    is_indoor:           boolean
    space_type:          string           // "室內" | "半戶外" | "戶外"
    weather_sensitivity: "low" | "medium" | "high"
    backup_logic: {
      strategy_type:               "swap_same_level" | "switch_time_slot" | "cancel_with_notice"
      description:                 string
      candidate_pool_tags:         string[]  // 尋找備援景點的標籤條件
      proximity_threshold_meters:  number
    }
  }
  business_logic: {
    average_stay_minutes: number    // 結構化數字（TDX 的 OpenTime 是自由文字）
    requires_reservation: boolean
  }
  decision_tags: {
    vibe:        string[]   // 情境風格標籤，用於 Tinder swipe UI 篩選
    limitations: string[]   // 限制條件（"需體力", "年齡限制", "潮汐限制"）
  }
  validation_log: {
    last_verified_at:   string   // ISO8601
    source_reliability: string
    fact_check_status:  "mock_demo_data" | "verified"
  }
}
```

### Layer 2 — 驗證輸出層（`results/poi_verified.json` / `src/types.ts`）

```ts
interface PoiVerifierOutput {
  poi_id:     string
  name:       string
  region:     string
  verified_at: string   // ISO8601

  verification_result: {
    exists:            boolean
    sources:           Array<'google_places' | 'osm' | 'blog_post' | 'youtube' | 'ptt' | 'official_website'>
    reliability_score: number | null   // 0–1 綜合可信度分數
    source_breakdown: {
      official?:      SourceMetadata
      semi_official?: SourceMetadata
      blog_travel?:   SourceMetadata
      user_feedback?: SourceMetadata
      // SourceMetadata: { source_type, last_updated_at, time_decay_factor, confidence }
    }
    facts: {
      official_name:         string
      address:               string
      hours:                 string
      average_stay_minutes:  number
      last_verified_at:      string   // ISO8601
      latest_blog_post_date: string   // YYYY-MM-DD（部落格近期活躍度代理指標）
      is_indoor:             boolean
      weather_sensitivity:   "low" | "medium" | "high"
    }
  }

  enrichment_result: {
    suggested_level:  0 | 1 | 2 | 3
    level_reasoning:  string   // AI 推論說明
    backup_logic:     BackupLogic | null  // L0 為 null
    candidate_pool?:  CandidateScore[]
  }

  tourist_friendly_description: string   // LLM 整合多來源後生成

  cost_estimate: {
    tokens_used:          number
    estimated_cost_ntd:   number
  }

  raw_sources: {
    google_places?: {
      place_id:            string
      official_name:       string
      formatted_address:   string
      opening_hours:       string[] | null
      rating:              number            // Google 評分（TDX 無此欄位）
      user_ratings_total:  number            // 評論數量
      business_status:     "OPERATIONAL" | "CLOSED_PERMANENTLY" | ...
      geometry:            { lat: number; lng: number }
    }
    blog_posts?:       BlogPostRaw[]
    youtube_videos?:   YoutubeVideoRaw[]
    ptt_posts?:        PttPostRaw[]
    official_website?: OfficialWebsiteRaw
  }
}
```

### Layer 3 — 資料庫層（`poi_catalog` table, Supabase）

```sql
poi_catalog (
  id           UUID PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  address      TEXT,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  tags         TEXT[]    DEFAULT '{}',
  embedding    VECTOR(768),            -- Gemini text-embedding-004，語意向量（TDX 無此欄位）
  metadata     JSONB     DEFAULT '{}', -- 承接 poi_enriched 所有欄位的 KV 儲存
  source_id    TEXT      UNIQUE,       -- 原始 POI ID，如 "NCA-001"
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ
)
```

---

## 3. 欄位對照差異表

### 3-1. 共同欄位（概念相同，表示方式不同）

| 概念 | TDX | Navigator | 差異說明 |
|------|-----|-----------|---------|
| 名稱 | `ScenicSpotName` (string) | `name` (string) | 命名方式不同，值相同 |
| 地址 | `Address` (原始字串) | `location.address` / `facts.address` | Navigator 經驗證比對 |
| 座標 | `Position.{PositionLon, PositionLat}` (巢狀) | `lat`, `lng` (平坦 float) | TDX 多一個 `GeoHash`；Navigator 欄位更扁平 |
| 類別 | `Class1` / `Class2` / `Class3` (政府詞彙) | `category` (自訂) + `tags[]` | TDX 用政府固定分類；Navigator 用策展式自訂標籤 |
| 關鍵字 | `Keyword` (逗號分隔字串) | `tags[]` + `decision_tags.vibe[]` | TDX 是非結構化字串；Navigator 是型別化陣列 |
| 描述 | `DescriptionDetail` + `Description` (原始文字) | `semantic_description` + `tourist_friendly_description` | Navigator 有人工策展版 + LLM 整合多來源後生成版 |
| 開放時間 | `OpenTime` (自由文字) | `facts.hours` (文字) + `requires_reservation` (bool) + `average_stay_minutes` (int) | TDX 是純文字；Navigator 拆分為結構化欄位 |
| 圖片 | `Picture.PictureUrl1-3` (最多 3 組) | `image_url` (單一字串) | TDX 提供多張；Navigator 目前只存代表圖 |
| 更新時間 | `SrcUpdateTime` + `UpdateTime` | `verified_at` + `facts.last_verified_at` | TDX 追蹤系統同步時間；Navigator 追蹤人工驗證時間 |
| 地理區域 | `City` (行政縣市，如 "新北市") | `region` (旅遊策展區，如 "北海岸") | TDX 按行政區；Navigator 按旅遊邏輯分區 |
| 識別碼 | `ScenicSpotID` (政府編碼，如 "C1_376420000A_000253") | `id` ("NCA-001") + `source_id` (DB 層) | Navigator 用人類可讀短碼 |

### 3-2. 僅 TDX 有的欄位

| TDX 欄位 | 出現在 | 說明 | Navigator 是否需要 |
|---------|--------|------|------------------|
| `ZipCode` | 全部實體 | 郵遞區號 | ❌ 導航不需要，地址已足夠 |
| `GeoHash` | `Position` 物件 | 地理雜湊索引字串 | ⚠️ pgvector 不需要，如需地理分桶可補入 `metadata` |
| `TravelInfo` | ScenicSpot | 交通資訊（自由文字） | ⚠️ 未來交通韌性功能可引入 |
| `WebsiteUrl` | ScenicSpot | 官方網站 | ✅ Navigator 已在 `raw_sources.official_website.url` 儲存 |
| `ParkingPosition` / `ParkingInfo` | ScenicSpot / Hotel | 停車場 | ❌ MVP 範圍外 |
| `Fax` | Hotel | 傳真號碼 | ❌ 不適用 |
| `ServiceInfo` | Hotel | 旅宿設施服務 | ❌ Navigator 不規劃住宿類型 POI |
| `Organizer` | Activity | 活動主辦單位 | ❌ Navigator 不規劃時間性活動實體 |
| `StartTime` / `EndTime` | Activity | 活動起訖日期 | ❌ Navigator 的「景點」是常設性，非活動 |
| `SrcUpdateTime` | 全部實體 | TDX 平台同步時間戳 | ❌ Navigator 用自己的 `verified_at` 取代 |
| `Class2` / `Class3` | ScenicSpot | 政府三級分類 | ❌ Navigator 改用 `tags[]` 提供更靈活的多標籤分類 |

### 3-3. 僅 Navigator 有的欄位（TDX 完全缺失）

| Navigator 欄位 | 所在層 | 說明 |
|--------------|--------|------|
| `level` (0–3) | L0, L1, L2, L3 | **韌性分級系統**：L0 = 絕對錨點（禁止自動替換）→ L3 = 水位調節（最易被 swap）。TDX 是靜態資料登錄，無行程規劃語意。 |
| `weather_sensitivity` | L0, L1, L2 | 天氣敏感度（結構化 enum）。TDX 完全沒有天氣相關欄位。 |
| `is_indoor` / `space_type` | L0, L1, L2 | 室內外分類（布林 + 空間類型字串）。TDX 的 `Class1` 偶有「室內」語意但非結構化。 |
| `backup_logic` | L1 | Swap/Switch 決策樹所需的完整備援邏輯（候補標籤、距離閾值、策略類型）。TDX 無任何應變邏輯。 |
| `requires_reservation` | L1 | 布林值，是否需預約。TDX 的 `OpenTime` 偶有文字提及但非結構化。 |
| `decision_tags.vibe` | L1 | 情境風格標籤（"文藝", "親子", "攝影聖地"）。用於 Tinder swipe UI 的篩選與 Token 投票。 |
| `decision_tags.limitations` | L1 | 限制條件（"潮汐限制", "需體力", "季節限定"）。 |
| `embedding` (vector 768) | DB (L3) | 768 維語意向量，用於 RAG 檢索與 Hybrid Search。TDX 完全沒有向量化資料。 |
| `reliability_score` | L2 | 0–1 綜合可信度分數，由多來源驗證計算。 |
| `source_breakdown` | L2 | 四層來源可信度細項（official / semi_official / blog_travel / user_feedback）。TDX 為單一政府來源，無多源比對。 |
| `rating` / `user_ratings_total` | L2 (raw_sources) | Google Places 評分與評論數。**TDX 觀光 API 完全不提供評分資料。** |
| `business_status` | L2 (raw_sources) | Google Places 的營業狀態（OPERATIONAL / CLOSED_PERMANENTLY）。 |
| `latest_blog_post_date` | L2 | 最新部落格文章日期，用作「近期活躍度」代理指標。 |
| `level_reasoning` | L2 | AI 推論 L0–L3 分級的說明文字（可解釋性）。 |
| `tourist_friendly_description` | L2 | LLM 整合 Google Places + 部落格 + 官網後生成的旅客友善描述。 |
| `candidate_pool_tags` | L2 | 在備援搜尋時用來找同類景點的標籤條件，如 `["室內", "藝術", "北海岸"]`。 |
| `fact_check_status` | L1 | 驗證管線狀態旗標（"mock_demo_data" → "verified"）。 |

---

## 4. 設計哲學差異

| 維度 | TDX | Navigator |
|------|-----|-----------|
| **定位** | 政府觀光資料登錄系統（靜態事實） | 旅遊行程智慧規劃引擎（決策導向） |
| **資料品質** | 各縣市政府自行維護，更新頻率不一，欄位常為空 | 多來源交叉驗證（Google Places + OSM + 部落格 + PTT + 官網），附 reliability_score |
| **時間表達** | `OpenTime` 自由文字（如 "全年開放", "9:00~17:00 週一公休"）| `average_stay_minutes`（int）+ `requires_reservation`（bool）＋ `facts.hours`（文字保留） |
| **分類系統** | 三級政府詞彙（Class1/2/3），固定枚舉值 | 自訂 `category` + 多維 `tags[]` + `decision_tags.vibe[]`，支援語意搜尋 |
| **座標系統** | 巢狀物件（`Position.PositionLon/Lat`）+ GeoHash | 平坦欄位（`lat`, `lng`）+ 768 維向量（pgvector） |
| **評分資料** | ❌ 完全不提供評分 | ✅ 來自 Google Places（rating + user_ratings_total） |
| **天氣/韌性** | ❌ 無任何相關欄位 | ✅ weather_sensitivity + backup_logic + L0–L3 分級 |
| **語意化** | ❌ 純文字欄位，無向量 | ✅ 768 維 embedding，支援 Hybrid Search + RAG |
| **圖片** | 最多 3 組 URL + 說明 | 單一代表圖 URL（MVP 簡化） |
| **更新追蹤** | TDX 平台同步時間（非人工驗證時間） | 驗證時間 + 部落格最新日期 + time_decay_factor |

---

## 5. TDX 作為 Navigator 資料來源的整合策略

TDX 可作為 Navigator 的**初始資料填充來源**，但需要以下轉換：

```
TDX ScenicSpot
    ↓
    [Step 1] 欄位對映
      ScenicSpotName  → name
      Position.*      → lat, lng
      Class1          → category（需對映到 Navigator 詞彙）
      Keyword         → tags[]（split by "," + dedup）
      DescriptionDetail → user_description（傳入 POI 驗證 Agent）
      WebsiteUrl      → poi_input.website_url（加速官網驗證）
      OpenTime        → 傳入 LLM 解析為 requires_reservation + average_stay_minutes
    ↓
    [Step 2] 以下欄位由 Navigator 自行生成（TDX 無法提供）
      level             ← AI 分類（EnrichmentAgent）
      weather_sensitivity ← AI 推論
      is_indoor         ← AI + Google Places 交叉確認
      backup_logic      ← AI 生成
      embedding         ← Gemini text-embedding-004
      reliability_score ← 多源驗證計算
      rating            ← Google Places API
    ↓
    poi_catalog（Supabase）
```

> **注意**：TDX 的 `ScenicSpotID`（如 `C1_376420000A_000253`）可存入 `metadata.tdx_id` 作為來源追溯，但 Navigator 使用自訂 `source_id`（如 "NCA-001"）作為主要識別碼。

---

*本文件對應 Navigator 架構書第 7 章（POI 驗證 Pipeline）與第 11 章（資料來源整合）。*  
*TDX API 端點：`https://tdx.transportdata.tw`，使用前需申請 API Key。*
