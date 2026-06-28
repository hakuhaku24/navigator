# 資料庫整理計畫（定稿）：TDX 事實層 + Navigator 智能層

> 目的：把 `poi_catalog` 收斂成單一標準格式——**事實層對齊 TDX 涵蓋（乾淨命名），智能層是核心價值**。
> 本文件含：欄位定義（DDL）、來源處理路線、null 規則、TDX 索取規範、實作步驟。
> ⚠️ 改 schema 的 migration 須先與組員協調（TDX pipeline 是組員建的，避免 split-brain）。

---

## 1. 設計原則（5 條）

1. **事實層對齊 TDX 涵蓋**——用 TDX 當「該記哪些事實」的清單，擴台時零翻譯。
2. **乾淨命名、只留會用的**——不抄 TDX 長名（`ScenicSpotName`→`name`），不抄用不到的欄位。
3. **智能層是核心，不是輔**——level/天氣/應變/vibe 是專題差異化；TDX 是底料，智能層是加工。
4. **一個概念一個欄位**（去重）——營業時間只留 `hours`，圖片只留 `images`。
5. **每個來源寫 mapper 翻成同一格式**——TDX / 爬蟲 / 手寫都先變成 canonical 再入庫。

---

## 2. 目標資料表定義（poi_catalog）

### 2.1 事實層欄位（正式 columns）

| 欄位 | 型別 | 對應 TDX | Null 時 | 說明 |
|---|---|---|---|---|
| `id` | UUID PK | （系統）| — | 主鍵 |
| `source_id` | TEXT UNIQUE | `TDX-SS-{ID}` | — | 出處編號；手寫用 `NCA-001` |
| `name` | TEXT NOT NULL | ScenicSpotName | — | 名稱 |
| `description` | TEXT | DescriptionDetail → Description | null | 顯示用描述 |
| `address` | TEXT | Address | null | 地址 |
| `lat` | DOUBLE PRECISION | Position.PositionLat | null | 緯度 |
| `lng` | DOUBLE PRECISION | Position.PositionLon | null | 經度 |
| `category` | TEXT | Class1（經對照表）| null | 分類詞 |
| `city` | TEXT | City | null | **行政區**（新北市）|
| `curated_zone` | TEXT | （自訂）| null | **策展區**（陽明山）；TDX 進來為 null |
| `hours` | TEXT | OpenTime | null | 營業時間（去重）|
| `phone` | TEXT | Phone | null | 電話 |
| `images` | TEXT[] | Picture.PictureUrl1~3 | `'{}'` | 圖片（去重，陣列）|
| `website_url` | TEXT | WebsiteUrl | null | 官網 |
| `tags` | TEXT[] | Class2/3 + Keyword | `'{}'` | 標籤 |
| `source_update_time` | TIMESTAMPTZ | SrcUpdateTime | null | 來源更新時間（freshness）|
| `embedding` | VECTOR(768) | （計算）| null | 語意向量，由文字算出（見 §4）|
| `search_vector` | TSVECTOR | （生成）| — | 全文檢索（generated）|
| `metadata` | JSONB | （見 2.2）| `'{}'` | 智能層 + 出處 |
| `verified_at` | TIMESTAMPTZ | （系統）| — | 我方最後驗證時間 |
| `created_at` / `updated_at` | TIMESTAMPTZ | （系統）| — | 時間戳 |

### 2.2 智能層（存在 `metadata` JSONB + `embedding`）

> 為何不升成正式欄位？因 `match/hybrid` RPC 已用 `metadata @> filter` + GIN 索引，數萬筆夠快；升欄位要重寫 RPC，churn 大效益低 → 不做。

```jsonc
{
  // 🔵 智能層（enrich() 產出，每筆都有；找不到給「預設」不給 null）
  "level": 1, "level_name": "彈性錨點",
  "is_indoor": false, "weather_sensitivity": "high",
  "backup_strategy": "swap_same_level",
  "reliability_score": 0.6, "average_stay_minutes": 120,
  // 🟡 出處標記（來源專屬，optional，沒有就「省略 key」）
  "tdx_id": "C1_xxx", "tdx_entity_type": "ScenicSpot",
  "sources": ["tdx_api"]
}
```

### 2.3 索引（沿用現況）
- `embedding` → HNSW（vector_cosine_ops）
- `metadata` → GIN
- `name` / `description` → GIN trigram（中文模糊）
- `search_vector` → GIN（全文）
- `source_id` → UNIQUE

---

## 3. TDX 欄位逐欄判定

**判準：問 4 個問題，任一為「是」才留——① 使用者看得到？② 拿來找它？③ 拿來篩/排序？④ 餵智能層？4 個全否 = 丟。**

| TDX 欄位 | 判定 | 去處 |
|---|---|---|
| ScenicSpotID | ✅ 出處 | `source_id` |
| ScenicSpotName | ✅ 顯示+檢索 | `name` |
| DescriptionDetail / Description | ✅ 檢索+智能 | `description`（Detail 優先）|
| Phone | ✅ 顯示 | `phone` |
| Address | ✅ 顯示 | `address` |
| OpenTime | ✅ 顯示+應變 | `hours` |
| Class1 | ✅ 篩+智能 | `category` + 推 is_indoor/天氣 |
| Class2 / Class3 / Keyword | 🟡 檢索+篩 | 併進 `tags` |
| WebsiteUrl | ✅ 顯示 | `website_url` |
| Picture | ✅ 顯示 | `images` |
| Position | ✅ 地圖+距離+應變 | `lat`/`lng` |
| City | ✅ 顯示+篩 | `city` |
| SrcUpdateTime | ✅ freshness | `source_update_time` |
| TravelInfo | 🟡 應變 | metadata（取摘要）|
| **ZipCode** | ❌ 4 否 | 丟（有 city 即可）|
| **ParkingPosition** | ❌ MVP 不做停車 | 丟 |
| **UpdateTime** | ❌ 與 SrcUpdateTime 重複 | 丟 |
| **GeoHash** | ❌ 有經緯度即可 | 丟 |

→ 20 欄留約 13~15，砍掉「4 問全否或重複」者。

---

## 4. 三來源處理路線（要不要爬蟲 / enrich / embedding）

| 來源 | 爬蟲（外部驗證）| enrich（LLM 加值）| embedding | 說明 |
|---|:--:|:--:|:--:|---|
| **TDX**（官方）| ❌ skip | ✅ 必跑 | ✅ 必跑 | 官方已權威，爬了浪費額度；enrich 補智能層 + **把制式描述改寫成 vibe 版再 embed** |
| **爬蟲**（不確定來源）| ✅ 完整 | ✅ | ✅ | 來路不明，要驗存在+信度 |
| **手寫 45 筆** | ❌ | ✅（已有 semantic_description）| ✅ | 已是高品質 vibe 描述 |

**embedding 重點**：embedding 是「算出來的」不是抄欄位。**TDX 也要 embedding**，但別直接 embed 官方制式描述——先用 enrich 改寫成 `tourist_friendly_description` 再 embed，否則搜尋品質差。
`embed_text = name + curated_zone/city + tourist_friendly_description`

---

## 5. 去重決議

| 概念 | 亂象 | ✅ 標準 |
|---|---|---|
| 營業時間 | `open_time` + `hours` | `hours` |
| 圖片 | `image_url` + `image_urls` + metadata | `images`（TEXT[]）|
| 地區 | `region` 混「陽明山」「新北」兩粒度 | 拆 `city`（行政）+ `curated_zone`（策展）|
| 更新時間 | `tdx_src_update_time` | `source_update_time`（正式欄位）|

---

## 6. Null / 找不到處理規則

| 欄位種類 | 找不到時 | 理由 |
|---|---|---|
| 🟦 事實欄位（hours/phone/address…）| **null**（陣列用 `'{}'`）| 標準；可 `WHERE x IS NULL` 找缺漏。**禁用 `'未知'` 文字** |
| 🔵 智能 metadata（level/天氣）| **給預設**：level=2、weather=medium、stay=90、reliability=0 | 是應變判斷依據，null 會壞 |
| 🟡 出處 metadata（tdx_id）| **省略整個 key** | key 不存在即代表「非此來源」 |

---

## 7. 該從 TDX 索取什麼

- **Base**：`https://tdx.transportdata.tw/api/basic/v2/Tourism`（OAuth2，已串）
- **Endpoint**：✅ ScenicSpot（主）、✅ Restaurant（次）；⏸ Hotel/Activity 暫不
- **`$select` 只抓需要欄位**（省頻寬/額度）：
  `ScenicSpotID,ScenicSpotName,DescriptionDetail,Description,Position,Class1,Class2,Class3,Keyword,Address,Phone,OpenTime,Picture,City,WebsiteUrl,SrcUpdateTime`
- **分批**：`$filter=City eq '新北市'` + `$top=200`，別一次全台
- 範例：`GET /v2/Tourism/ScenicSpot?$select=...&$filter=City eq '新北市'&$top=200&$format=JSON`

---

## 8. 實作腳本（執行步驟，低風險先做）

| # | 步驟 | 動作 | 風險 |
|---|---|---|---|
| 1 | **建 canonical 型別** | 新增 `src/canonical-poi.ts`：定義事實層介面 + `CanonicalPoiMetadata`（含智能層預設值）| 無破壞（新檔）|
| 2 | **三 ingest 改用它** | `ingest-embeddings` / `ingest-from-tdx` / `src/ingestion` 都 import 同一型別組 metadata | 低 |
| 3 | **mapper 去重** | `tdx-mapper`：`OpenTime→hours`、`Picture→images`、`City→city`、`Class1→category`、`Class2/3+Keyword→tags` | 低 |
| 4 | **null 規則** | 把 `'未知'`/`'無法驗證'` 改成 null；智能層套預設；出處省略 key | 低 |
| 5 | **migration 008（DDL）** | `ALTER TABLE poi_catalog ADD COLUMN` 補：`category, city, curated_zone, hours, phone, images TEXT[], website_url, source_update_time`（依 §2.1 型別）| ⚠️ 中，**須協調組員** |
| 6 | **TDX 走 skip-verify** | `ingest-from-tdx --skip-verify`：跳爬蟲、保留 enrich + embedding | 低 |
| 7 | **重 ingest + 驗證** | 重灌一輪 → 抽樣量欄位、跑 `hybrid_search` 測試 | — |

### migration 008 DDL 草案（步驟 5）
```sql
ALTER TABLE poi_catalog
  ADD COLUMN IF NOT EXISTS category           TEXT,
  ADD COLUMN IF NOT EXISTS city               TEXT,
  ADD COLUMN IF NOT EXISTS curated_zone       TEXT,
  ADD COLUMN IF NOT EXISTS hours              TEXT,
  ADD COLUMN IF NOT EXISTS phone              TEXT,
  ADD COLUMN IF NOT EXISTS images             TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS website_url        TEXT,
  ADD COLUMN IF NOT EXISTS source_update_time TIMESTAMPTZ;
-- 註：智能層（level/天氣…）維持在 metadata，不升欄位、不改 RPC。
```

---

## 9. 本次不處理（另議）

- **智能層升正式欄位**：不做（`metadata @>` 夠用，避免重寫 RPC）。
- **`pois` 表（各團）**：本計畫只整理 `poi_catalog` 總表。
- **任何 schema migration**：先確認沒有人同時跑舊版 ingest（防 split-brain）。
