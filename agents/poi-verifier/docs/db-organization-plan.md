# 資料庫整理計畫（施工圖）

> 本文是 **`TDX_SCHEMA_COMPARISON.md`（參考手冊）的下游施工圖**：
> 採用手冊的設計，補上 **2026-06-30 撈真實 TDX 資料後的修正**，給出 canonical 程式、欄位 DDL 與實作步驟。
> **衝突時以本文「真實資料修正」為準**（手冊寫於撈資料前 06-25）。
> ⚠️ 改 schema 的 migration 須先與組員協調（TDX pipeline 是組員建的，避免 split-brain）。

---

## 0. 與 `TDX_SCHEMA_COMPARISON.md` 的關係

| | `TDX_SCHEMA_COMPARISON.md`（手冊）| 本文（施工圖）|
|---|---|---|
| 角色 | **字典/參考** | **行動/施工** |
| 內容 | TDX 4 實體完整 schema（§1）、Navigator 4 層模型（§2）、設計哲學（§4）、整合策略（§5）| 採用手冊設計 + 真實修正 + canonical code/DDL/步驟 |

**原則**：不重複抄手冊。需要完整 TDX 欄位（含 Restaurant/Hotel/Activity）或 4 層資料模型，請直接看手冊 §1、§2。本文聚焦「ScenicSpot 落地 + 真實修正 + 實作」。

---

## 1. 採用手冊設計 + 真實資料修正（彙整）

### 1-1. 採用手冊的（不重造輪子）
- **整合流程**：採用手冊 §5（TDX → 欄位對映 → `user_description` 傳驗證 Agent → enrich 生 level/weather/embedding）。見本文 §2。
- **4 層資料模型**：採用手冊 §2（`pois.ts` → `poi_enriched` → `poi_verified` → `poi_catalog`）作為前置脈絡。
- **僅 Navigator 有的欄位清單**：採用手冊 §3-3（level/weather/backup/vibe/embedding…即智能層）。

### 1-2. 修正手冊的（真實資料推翻的假設，本文為準）
| 議題 | 手冊原說 | 真實資料修正（§12）| 本文採用 |
|---|---|---|---|
| **City** | §3-1：`City`→`region`，當可靠 | 管轄單位≠位置（石牌標新北、實際宜蘭）| **City 不可直接用**，以 ZipCode/Address 推真實縣市 |
| **ZipCode** | §3-2：「丟，地址已足夠」| 3/3 全有且最準的位置訊號 | **留**，作推 city 主依據 |
| **SrcUpdateTime** | §3-2：「丟，用 verified_at」| freshness 訊號，與 verified_at 意義不同 | **留**為 `source_update_time` |
| **Keyword→tags** | §5：`Keyword`→`tags` | Keyword/Class2/3 實測幾乎全缺 | **tags 改靠 Class1 + enrich** |
| **圖片** | §3-1：單一 `image_url` | TDX 最多 3 張 | **演進為 `images TEXT[]`** |

---

## 2. 整合流程（採用手冊 §5 + 標注修正）

```
TDX ScenicSpot
   ↓ [對映 → PoiInput]（手冊 §5 Step1）
     ScenicSpotName    → name
     Position.*        → lat, lng
     DescriptionDetail → user_description（傳驗證 Agent，enrich 改寫成 vibe 再 embed）
     WebsiteUrl        → poi_input.website_url
     Class1            → category（對照表；🔧 缺則 fallback「景點」）
   ↓ [事實 signals]（走 ingest-from-tdx 的 signals，非 PoiInput）
     OpenTime → hours、Phone → 🔧cleanPhone、Picture → images、ZipCode → zip_code
     🔧 city = deriveCity(ZipCode → Address → City)   ← 不直接抄 City
   ↓ [enrich 生成]（手冊 §5 Step2，TDX 無法提供）
     level / weather_sensitivity / is_indoor / backup_logic / embedding / reliability_score
   ↓
   poi_catalog（Supabase）
```
🔧 = 本文相對手冊 §5 的真實資料修正點。

---

## 3. 目標 `poi_catalog` 事實層欄位（columns）

> 欄位涵蓋對齊手冊 §1 ScenicSpot，乾淨命名、只留會用的。「對應 TDX」欄見手冊 §1-1 取得完整型別。

| 欄位 | 型別 | 對應 TDX | Null 時 | 說明 |
|---|---|---|---|---|
| `id` | UUID PK | （系統）| — | 主鍵 |
| `source_id` | TEXT UNIQUE | `TDX-SS-{ScenicSpotID}` | — | 出處編號；手寫用 `NCA-001` |
| `name` | TEXT NOT NULL | ScenicSpotName | — | 名稱 |
| `description` | TEXT | DescriptionDetail → Description | null | 顯示用 |
| `address` | TEXT | Address | null | 地址 |
| `lat` / `lng` | DOUBLE PRECISION | Position.PositionLat/Lon | null | 座標 |
| `category` | TEXT | Class1（對照表，缺則 fallback）| null | 分類詞 |
| `city` | TEXT | **deriveCity(ZipCode→Address→City)** | null | **行政縣市**；非直抄 City（§1-2、§12 修正 1）|
| `zip_code` | TEXT | ZipCode | null | 推 city 主依據（§12 修正 3）|
| `curated_zone` | TEXT | （自訂）| null | 策展區（陽明山）；TDX 為 null |
| `hours` | TEXT | OpenTime | null | 營業時間（去重）|
| `phone` | TEXT | Phone（cleanPhone 清洗）| null | 電話 |
| `images` | TEXT[] | Picture.PictureUrl1~3 | `'{}'` | 圖片（多張，去重）|
| `website_url` | TEXT | WebsiteUrl | null | 官網 |
| `tags` | TEXT[] | **Class1 + enrich** | `'{}'` | 標籤（Keyword/Class2/3 全缺，§12 修正 2）|
| `source_update_time` | TIMESTAMPTZ | SrcUpdateTime | null | 來源更新（freshness）|
| `embedding` | VECTOR(768) | （計算）| null | 語意向量（手冊 §3-3）|
| `search_vector` | TSVECTOR | （生成）| — | 全文檢索 |
| `metadata` | JSONB | （見 §4）| `'{}'` | 智能層 + 出處 |
| `verified_at` / `created_at` / `updated_at` | TIMESTAMPTZ | （系統）| — | 時間戳 |

---

## 4. 智能層（`metadata` JSONB + `embedding`）

> 即手冊 §3-3「僅 Navigator 有的欄位」，TDX 給不了，由 enrich 生成。

```jsonc
{
  // 🔵 智能層（每筆都有；找不到給「預設」不給 null）
  "level": 1, "level_name": "彈性錨點", "is_indoor": false,
  "weather_sensitivity": "high", "backup_strategy": "swap_same_level",
  "reliability_score": 0.6, "average_stay_minutes": 120,
  // 🟡 出處（optional，沒有省略 key）
  "tdx_id": "C1_xxx", "tdx_entity_type": "ScenicSpot", "sources": ["tdx_api"],
  // ♻️ back-compat：舊消費者（contingency poi-catalog-client、region 過濾）讀 metadata.region
  "region": "北海岸"
}
```
> 智能層為何不升正式欄位？`match/hybrid` RPC 已用 `metadata @> filter` + GIN 索引、數萬筆夠快；升欄位要重寫 RPC、churn 大效益低 → 不做。(待討論，交由其餘組員決定)

---

## 5. 三來源處理路線（爬蟲 / enrich / embedding）

| 來源 | 爬蟲 | enrich | embedding | 說明 |
|---|:--:|:--:|:--:|---|
| **TDX**（官方）| ❌ skip | ✅ 必跑 | ✅ 必跑 | 官方已權威；enrich 補智能層 + 把制式描述改寫成 vibe 再 embed |
| **爬蟲**（不確定來源）| ✅ 完整 | ✅ | ✅ | 來路不明，要驗存在+信度 |
| **手寫 45 筆** | ❌ | ✅（已有 semantic_description）| ✅ | 已是高品質 vibe 描述 |

`embed_text = name + curated_zone/city + tourist_friendly_description`（**別直接 embed 官方制式描述**）

---

## 6. ScenicSpot 欄位留/丟判定

> 完整 4 實體 schema 見手冊 §1。Restaurant/Hotel/Activity 欄名不同（手冊 §1-2~1-4），另議。
> 判準：① 看得到？② 拿來找？③ 拿來篩/排序？④ 餵智能層？4 個全否 = 丟。

| TDX 欄位 | 判定 | 去處 |
|---|---|---|
| ScenicSpotID / Name / Position / Address / Phone / OpenTime / WebsiteUrl / Picture / DescriptionDetail | ✅ | 見 §3 |
| Class1 | ✅ 篩+智能（⚠️ 2/3，缺則 fallback）| `category` |
| **ZipCode** | ✅ **留**（修正：比 City 準）| `zip_code` → 推 `city` |
| **SrcUpdateTime** | ✅ **留**（修正：freshness）| `source_update_time` |
| City | ⚠️ **不直接用**（不可靠）| 經 deriveCity 推 `city` |
| TravelInfo | 🟡 應變 | metadata（摘要）|
| Class2/3 / Keyword | ⚠️ **實測全缺** | 不依賴；tags 靠 Class1+enrich |
| ZipCode 以外重複/低值：GeoHash、UpdateTime、ParkingPosition、Level（古蹟分級）、Fax/ServiceInfo/Organizer/StartTime（他實體）| ❌ | 丟 |

---

## 7. 去重決議

| 概念 | 亂象 | ✅ 標準 |
|---|---|---|
| 營業時間 | `open_time` + `hours` | `hours` |
| 圖片 | `image_url` + `image_urls` + metadata | `images`（TEXT[]）|
| 地區 | `region` 混「陽明山」「新北」兩粒度 | 拆 `city`（行政）+ `curated_zone`（策展）；`region` 留 metadata 作 back-compat |
| 更新時間 | `tdx_src_update_time` | `source_update_time` |

---

## 8. Null / 找不到處理規則

| 欄位種類 | 找不到時 | 理由 |
|---|---|---|
| 🟦 事實欄位 | **null**（陣列 `'{}'`）| 可 `WHERE x IS NULL` 找缺漏。禁 `'未知'` 文字 |
| 🔵 智能 metadata | **給預設**（level=2、weather=medium、stay=90、reliability=0）| 應變判斷依據，null 會壞 |
| 🟡 出處 metadata | **省略整個 key** | key 不存在即代表「非此來源」 |

---

## 9. 該從 TDX 索取什麼

- **Base**：`https://tdx.transportdata.tw/api/basic/v2/Tourism`（OAuth2）。⚠️ 手冊寫的 `ptx.transportdata.tw/MOTC` 為**舊網域**，請以此為準。
- **Endpoint**：✅ ScenicSpot（先只做這個）；Restaurant 欄名不同（手冊 §1-2）另議；Hotel/Activity 暫不。
- **`$select`**（移除實測全缺的 Class2/3/Keyword，補推 city 的 ZipCode）：
  `ScenicSpotID,ScenicSpotName,DescriptionDetail,Description,Position,Class1,Address,ZipCode,Phone,OpenTime,Picture,City,WebsiteUrl,SrcUpdateTime`
- **分批**：path 端點 `/ScenicSpot/{City}`（如 `/ScenicSpot/NewTaipei`）+ `$top=200`。
- ⚠️ 免費版**有限速**（連續打數次即 429），ingest 要加 backoff；城市名用 TDX 拼法（宜蘭=`YilanCounty`）。

---

## 10. canonical 實作（已完成）

`src/canonical-poi.ts` + `tests/canonical-poi.test.ts`（**58 測試全綠**，tsc strict 0 錯）已實作上述修正的純函式：
- `deriveCity(zip→address→city)`、`cityFromZip`（含連江夾在新北 zip 的判序）
- `cleanPhone`（`886-886-836-56534`→`0836-56534`）、`extractImages`、`categoryFromClass1`（缺→景點）
- `withMetadataDefaults`（智能層補滿不留 null）、`isUsablePoi`（守門）
- `metadataFromVerifierOutput`（**橋接**：PoiVerifierOutput → canonical metadata，統一映射避免漂移）
- `buildCatalogRecord`（組裝入庫列 + **回填 metadata.region** back-compat）
- 型別共用 `tdx-types.ts` / `types.ts`（不重複定義，避免 drift）

---

## 11. 實作步驟（低風險先做）

| # | 步驟 | 動作 | 風險 |
|---|---|---|---|
| 1 | 建 canonical 型別 | `src/canonical-poi.ts` | ✅ 已完成 |
| 2 | 三 ingest 改用它 | `ingest-embeddings`/`ingest-from-tdx`/`src/ingestion` import 同型別 + `buildCatalogRecord` | 低（須含 region back-compat）|
| 3 | mapper 接 canonical | `tdx-mapper`：依手冊 §5 流程，事實走 signals、`city` 用 deriveCity、清洗 phone | 低 |
| 4 | null 規則 | `'未知'`→null、智能層套預設、出處省略 | 低 |
| 5 | migration 008（DDL）| 補正式欄位 | ⚠️ 中，須協調組員（見 §13 問題 B）|
| 6 | TDX 走 skip-verify | 跳爬蟲、保留 enrich+embedding | 低 |
| 7 | 重 ingest + 驗證 | 重灌 → 跑 `hybrid_search` + canonical 測試 | — |

```sql
-- migration 008 DDL 草案（步驟 5）
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
-- 智能層維持 metadata；region 保留在 metadata 作 back-compat。
```

---

## 12. 真實資料驗證（2026-06-30，3 筆新北 ScenicSpot）

撈 石牌縣界公園 / 大棟山系登山步道 / 平溪天燈，並跨 5 縣市抽 40 筆跑 canonical：crash 0、city 推不出 0。

**欄位完整度（3 筆）**：一定有 = ID/Name/DescriptionDetail/Phone/Position/City/ZipCode/SrcUpdateTime；部分 = Description/Address/OpenTime/Class1/Picture 2/3、WebsiteUrl 1/3；**全缺 = Class2/Class3/Keyword（0/3）**。

| 修正 | 證據 |
|---|---|
| 1. City 不可靠 | 石牌 City=新北/實際宜蘭(zip261)；大棟山 City=新北/實際桃園(zip333)；梅庄花卉 City=臺中/實際彰化(zip502) |
| 2. Class2/3/Keyword 全缺 | 3 筆皆 0 |
| 3. ZipCode 改留 | 261→宜蘭、333→桃園、226→新北，比 City 準且 3/3 全有 |
| 4. Class1 不一定有 | 平溪天燈無 Class1（改有 `Level:非古蹟`）|
| 5. 髒電話 | `886-886-836-56534`（886 重複）需清洗 |

---

## 13. 整合風險分析（步驟 2~5 隱藏風險）

- **問題 A（已化解）**：搬 `region` 會弄壞應變 agent（`poi-catalog-client.ts` 讀 `md.region`）→ `buildCatalogRecord` 回填 `metadata.region`（§4、§10）。
- **問題 B**：步驟 5 把事實搬欄位 → RPC 回傳形狀 + 所有讀 metadata 事實的消費者要同步改。**步驟 5 前須先盤點讀取點**。
- **問題 C（已對齊）**：mapper 接點 → 採用手冊 §5（事實走 signals、語意走 user_description）。
- **問題 D（待組員確認）**：`backup_strategy` 只存 `backup_logic.strategy_type` 字串（沿用現有 `ingest-embeddings` 設計），**丟失 `candidate_pool_tags` / `proximity_threshold_meters`**——而這兩個正是應變 agent 找備案時需要的「找什麼、找多遠」。需確認應變 agent 是否需要完整 `backup_logic`；若需要，metadata 應存完整物件而非僅字串。canonical 目前沿用字串以維持一致，不擅改。

---

## 14. 待組員更新（手冊過時處，本文不改他的檔）

- 手冊端點 `ptx.transportdata.tw/MOTC` → 應為 `tdx.transportdata.tw`
- 手冊 L3 寫 `embedding text-embedding-004`、「metadata 承接所有欄位」→ 實際已是 **gemini 768**（migration 006）且本文主張去重
- 手冊 §3-1/§3-2/§5 的 City/ZipCode/SrcUpdateTime/Keyword 假設 → 以本文 §1-2 修正為準

---

## 15. 本次不處理（另議）

- 智能層升正式欄位（`metadata @>` 夠用，避免重寫 RPC）
- `pois`（各團表）— 只整理 `poi_catalog`
- Restaurant/Hotel/Activity 入庫 — 欄名不同（手冊 §1），先做 ScenicSpot
- 任何 schema migration 先確認無人同時跑舊版 ingest（防 split-brain）
