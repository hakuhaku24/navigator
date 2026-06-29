# 資料庫整理計畫：TDX 事實層 + Navigator 智能層

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
| `category` | TEXT | Class1（經對照表）| null | 分類詞；Class1 可能缺，需 fallback（見 §10）|
| `city` | TEXT | **Address/ZipCode 推導**（非 City 欄位！）| null | **行政區**；TDX `City` 是管轄單位、會錯，須從 Address/ZipCode 推（見 §10 修正 1）|
| `zip_code` | TEXT | ZipCode | null | 郵遞區號；比 `City` 更準的位置訊號，用來推 `city`（見 §10 修正 3）|
| `curated_zone` | TEXT | （自訂）| null | **策展區**（陽明山）；TDX 進來為 null |
| `hours` | TEXT | OpenTime | null | 營業時間（去重）|
| `phone` | TEXT | Phone | null | 電話 |
| `images` | TEXT[] | Picture.PictureUrl1~3 | `'{}'` | 圖片（去重，陣列）|
| `website_url` | TEXT | WebsiteUrl | null | 官網 |
| `tags` | TEXT[] | **Class1 + enrich 生成** | `'{}'` | 標籤（Class2/3/Keyword 實測全缺，見 §10 修正 2）|
| `source_update_time` | TIMESTAMPTZ | SrcUpdateTime | null | 來源更新時間（freshness）|
| `embedding` | VECTOR(768) | （計算）| null | 語意向量，由文字算出（見 §4）|
| `search_vector` | TSVECTOR | （生成）| — | 全文檢索（generated）|
| `metadata` | JSONB | （見 2.2）| `'{}'` | 智能層 + 出處 |
| `verified_at` | TIMESTAMPTZ | （系統）| — | 我方最後驗證時間 |
| `created_at` / `updated_at` | TIMESTAMPTZ | （系統）| — | 時間戳 |

### 2.2 智能層（存在 `metadata` JSONB + `embedding`）

> 為何不升成正式欄位？因 `match/hybrid` RPC 已用 `metadata @> filter` + GIN 索引，數萬筆夠快；升欄位要重寫 RPC，churn 大效益低 → 不做。(待討論，交由其餘組員決定)

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
| Class1 | ✅ 篩+智能 | `category` + 推 is_indoor/天氣（⚠️ 常缺，2/3，需 fallback）|
| Class2 / Class3 / Keyword | ⚠️ **實測幾乎全缺**（0/3）| 不可靠；tags 改靠 Class1 + enrich（見 §10 修正 2）|
| WebsiteUrl | ✅ 顯示 | `website_url` |
| Picture | ✅ 顯示 | `images`（常為空 `{}`）|
| Position | ✅ 地圖+距離+應變 | `lat`/`lng` |
| ~~City~~ | ⚠️ **不可靠**（管轄單位≠位置）| **不直接用**；改推 `city`（見 §10 修正 1）|
| SrcUpdateTime | ✅ freshness | `source_update_time` |
| TravelInfo | 🟡 應變 | metadata（取摘要）|
| **ZipCode** | ✅ **留**（比 City 準的位置訊號）| `zip_code` + 推 `city`（見 §10 修正 3）|
| **ParkingPosition** | ❌ MVP 不做停車 | 丟 |
| **UpdateTime** | ❌ 與 SrcUpdateTime 重複 | 丟 |
| **GeoHash** | ❌ 有經緯度即可 | 丟 |
| **Level**（古蹟分級）| ❌ 低價值 | 丟（部分景點才有，如「非古蹟」）|

→ 砍掉「4 問全否或重複」者；⚠️ 標記者為真實資料驗證後的修正（見 §10）。

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
- **Endpoint**：✅ ScenicSpot（先只做這個）；⏸ Restaurant 欄名不同（RestaurantName/Class，無 Class1）→ 另列對應再做；Hotel/Activity 暫不
- **`$select` 只抓需要欄位**（省頻寬/額度；已移除實測全缺的 Class2/3/Keyword，補上推 city 要用的 ZipCode）：
  `ScenicSpotID,ScenicSpotName,DescriptionDetail,Description,Position,Class1,Address,ZipCode,Phone,OpenTime,Picture,City,WebsiteUrl,SrcUpdateTime`
- **分批**：用 path 端點 `/ScenicSpot/{City}`（如 `/ScenicSpot/NewTaipei`）+ `$top=200`，別一次全台
- 範例：`GET /v2/Tourism/ScenicSpot/NewTaipei?$select=...&$top=200&$format=JSON`
- ⚠️ **注意**：用城市端點/`City` 篩出的結果，`City` 欄位仍可能標錯（管轄單位≠位置），入庫時要用 Address/ZipCode 重新推真實縣市（見 §10 修正 1）

---

## 8. 實作腳本（執行步驟，低風險先做）

| # | 步驟 | 動作 | 風險 |
|---|---|---|---|
| 1 | **建 canonical 型別** | 新增 `src/canonical-poi.ts`：定義事實層介面 + `CanonicalPoiMetadata`（含智能層預設值）| 無破壞（新檔）|
| 2 | **三 ingest 改用它** | `ingest-embeddings` / `ingest-from-tdx` / `src/ingestion` 都 import 同一型別組 metadata | 低 |
| 3 | **mapper 去重+推導** | `tdx-mapper`：`OpenTime→hours`、`Picture→images`、`Class1→category`、**`city` 從 ZipCode/Address 推（非 `City→city`）**、**`tags` 從 Class1+enrich**、清洗 `phone` | 低 |
| 4 | **null 規則** | 把 `'未知'`/`'無法驗證'` 改成 null；智能層套預設；出處省略 key | 低 |
| 5 | **migration 008（DDL）** | `ALTER TABLE poi_catalog ADD COLUMN` 補：`category, city, curated_zone, hours, phone, images TEXT[], website_url, source_update_time`（依 §2.1 型別）| ⚠️ 中，**須協調組員** |
| 6 | **TDX 走 skip-verify** | `ingest-from-tdx --skip-verify`：跳爬蟲、保留 enrich + embedding | 低 |
| 7 | **重 ingest + 驗證** | 重灌一輪 → 抽樣量欄位、跑 `hybrid_search` 測試 | — |

### migration 008 DDL 草案（步驟 5）
```sql
ALTER TABLE poi_catalog
  ADD COLUMN IF NOT EXISTS category           TEXT,
  ADD COLUMN IF NOT EXISTS city               TEXT,
  ADD COLUMN IF NOT EXISTS zip_code           TEXT,
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

---

## 10. 真實資料驗證與修正（2026-06-30）

實際撈 3 筆新北市 ScenicSpot（石牌縣界公園、大棟山系登山步道、平溪天燈）後，發現真實資料打臉幾個原設計假設，修正如下。

**欄位完整度（3 筆）**：一定有 = ID/Name/DescriptionDetail/Phone/Position/City/ZipCode/SrcUpdateTime；部分有 = Description 2/3、Address 2/3、OpenTime 2/3、Class1 2/3、Picture 2/3、WebsiteUrl 1/3；**全缺 = Class2、Class3、Keyword（0/3）**。

### 修正 1（最嚴重）：`City` 欄位不可靠 — 是「管轄單位」非「實際位置」
| 景點 | TDX City | 實際 Address | 真實位置 |
|---|---|---|---|
| 石牌縣界公園 | 新北市 | **宜蘭縣**頭城鎮 | 宜蘭 |
| 大棟山系登山步道 | 新北市 | **桃園市**龜山區 | 桃園 |
| 平溪天燈 | 新北市 | （無）| 平溪 ✓ |

→ TDX `City` = 哪個政府單位發布，不是物理位置。**入庫推 `city` 的優先序：① ZipCode 前 3 碼查對照表（3/3 最可靠）→ ② Address 解析縣市 → ③ 最後才退回 `City` 欄位**（如平溪天燈 City 正確又無 Address 時）。實作需備一張「ZipCode 前 3 碼 → 縣市」對照表（範圍式，22 縣市）。

### 修正 2：`Class2/Class3/Keyword` 實測幾乎全缺（0/3）
原設計「併進 tags」不可行。**tags 改靠 `Class1` + enrich 生成**，別依賴這三欄。

### 修正 3：`ZipCode` 改「留」（原本判丟）
既然 `City` 不可靠，ZipCode 反而是更準的位置訊號：`261`=宜蘭頭城、`333`=桃園龜山、`226`=平溪。**保留 `zip_code` 欄位，並用它推導真實 `city`。**

### 修正 4：`Class1` 不一定有（2/3）；部分景點改用 `Level`
平溪天燈無 `Class1`，反有 `Level: "非古蹟"`（古蹟分級）。**category 推斷要有 fallback；`Level` 低價值 → 丟。**

### 修正 5：髒資料確認，入庫前要清洗
`Phone` 格式亂：`886-3-9312152`、`886-886-836-56534`（886 重複）。**電話/時間等欄位入庫前需正規化清洗。**
