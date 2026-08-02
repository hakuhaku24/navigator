# poi-verifier 已知問題

> 記錄當前未解或部分解決的問題。解決後直接從本檔移除。
> 最新在最上面。

---

## 2026-08-03｜TDX 觀光 API 已改版，舊端點全數 404（程式已改接新版，尚未實跑匯入）

### 怎麼發現的

要驗證一批新加的 TDX 欄位有沒有真的拿到值，`--dry-run` 用的是假資料看不出來，
所以直接打 live API——結果整個觀光類端點回 404。

```
/api/basic/v2/Tourism/ScenicSpot   → 404   ← 專案原本打的
/api/basic/v2/Rail/TRA/Station     → 200   ← 同一把 token
```

**同一組憑證一個通一個不通，所以不是金鑰過期或權限問題，是端點下架。**
（過程中也撞到 429；但 429 退避後重試仍是 404，兩者分得開。）

### 現行端點與 schema

```
https://tdx.transportdata.tw/api/tourism/service/odata/V2/Tourism/Attraction
```

實體改名 `ScenicSpot → Attraction`、`Activity → Event`，欄位全套不同。
對照表見 `docs/TDX_SCHEMA_COMPARISON.md` 檔頭的過時警告，型別見 `src/tdx-types.ts`。

### 實測 500 筆的填充率（決定哪些欄位值得接）

| 欄位 | 填充率 | 判斷 |
|---|---|---|
| `AttractionName` / `Description` / `PostalAddress` / `Telephones` / `Images` | 100% | 核心，全接 |
| **`ServiceStatus`** | **100%** | **最有價值的新欄位**，見下 |
| `IsAccessibleForFree` | 100% | 接 |
| `WebsiteUrl` | 9% | 接（有就好） |
| `TrafficInfo` | 9% | 接 |
| `ParkingInfo` | 4% | 接（文字，非座標） |
| `LocatedCities` | **2%** | ⚠️ **不可拿來篩縣市**，要用 `PostalAddress/City` |
| `ServiceTimeInfo` / `FeeInfo` / `VisitDuration` / `Facilities` / `PaymentMethods` | **0%** | 欄位在、資料端沒填。已接住但現在拿不到值 |

⚠️ **抽樣限制**：這 500 筆只涵蓋 4 個資料提供機關（金門縣 222、宜蘭縣 123、
桃園市 120、林業署 44），是按 ID 排序取前 500 的結果，**填充率不可外推全國**。
但「欄位存不存在」與抽樣無關。

### `ServiceStatus` 解掉一個寫死值

`0=永久停止 1=正常營運 2=非營運時段 3=暫時停止 9=待確認`，500 筆中 491 筆正常、
9 筆暫時停止（藤枝、向陽國家森林遊樂區等，確實封閉中）。

在此之前 `contingency-handler/src/poi-catalog-client.ts` 是寫死
`business_status: 'OPERATIONAL'`。這個欄位讓「官網說已停業 vs Google 說營業中」
這類衝突有了官方第三方依據。**目前只寫進 metadata，尚未接上 business_status。**

### 圖片說明救不了「圖文不符」

原本期待用官方圖說查核圖文是否相符（本檔 2026-07-28 記載擎天崗主圖是檸檬薑茶）。
實測 1,156 張圖中有說明的 695 張，**100% 是出處標註**（「照片提供｜宜蘭分署」），
沒有任何一則描述圖片內容。**這條路目前走不通**，欄位先存著。

### 官方 `PostalAddress` 自身會矛盾

滿月圓國家森林遊樂區：`Town`/`ZipCode` 寫「八里區 / 249」，
`StreetAddress` 寫「三峽區有木里…」，`LocatedCities[0].Town` 寫「三峽區」。
**實際在三峽區，所以是 Town/ZipCode 錯。**

縣市級剛好不受影響（兩邊都是新北市），所以 `region` 推導仍然正確；
但**任何要用到鄉鎮層級的功能都不能直接信 `Town`/`ZipCode`**。

### 尚未做的

- **實際匯入一次都還沒跑過**。已驗證的是：對映層對 500 筆真實資料 500/500 成功、
  單元測試 141 項全過、`$filter=PostalAddress/City eq '新北市'` 實打回 200。
  **未驗證**：完整 `--skip-verify` 匯入寫進 Supabase 的端到端路徑。

### 2026-08-03 補做（SRS v0.5 BFR17）

- `ServiceStatus` 已接上應變管線的 `business_status`（`poi-catalog-client.ts` 的
  `businessStatusFrom`）。在此之前該欄位是寫死的 `'OPERATIONAL'`，意即即使資料
  來源明說「暫時停止營運」，應變管線照樣把它當正常營業推薦。
  代碼 9（待確認）與欄位缺漏一律回 `undefined` 而非 `'OPERATIONAL'`——
  沒有資料不等於正在營業。既有 45 筆無此欄位，回 `undefined` 不會被
  strict-checker 淘汰（該檢查只擋明確的 `CLOSED_*`），無回歸風險。
- `ServiceStatus=0`（永久停止）已加入庫前過濾，批次結束會另計「因永久停業未入庫」筆數。
  只擋 0；3（暫時停止）不擋——它會恢復，而且「暫時停業」本身是有用的資訊。

---

## 2026-08-02｜靜默降級污染 `is_indoor`，天氣應變在 2/3 區域已失效（程式已修，線上資料待重跑）

### 現況

線上 `poi_catalog` 45 筆中 **41 筆 `metadata.is_indoor = false`**，其中至少 10 筆可證明為錯——與 `src/data/pois.ts` 的 `indoor_type` 直接矛盾：

| source_id | 名稱 | pois.ts 的 indoor_type | 線上 is_indoor |
|---|---|---|---|
| NEI-003 | 國立海洋科技博物館 | 博物館 | `false` |
| NEI-001 | 福容大飯店 福隆 | 飯店 | `false` |
| NEI-002 | 阿妹茶樓 | 茶樓 | `false` |
| YMS-001 | 草山行館 | 餐廳 | `false` |
| YMS-002 | 陽明山中山樓 | 展覽館 | `false` |
| YMS-003 | 陽明書屋 | 展覽館 | `false` |
| YMS-013 | 豆留森林 | 咖啡廳 | `false` |
| NEI-005 | 舊草嶺隧道 | 隧道 | `false` |
| NEI-014 | 卯澳小吃 | 餐廳 | `false` |
| NEI-015 | 萊萊祕境咖啡 | 咖啡廳 | `false` |

**錯誤方向完全一致：室內場所被標成戶外。** 降級的 30 筆其 `is_indoor/weather_sensitivity` 組合 **100% 是 `false/medium`**——這不是判斷，是同一組預設值。

### 根因（三個補預設值的地方疊加）

1. `enrichers/index.ts` LLM 失敗時回 `facts: null`（正確）
2. **`agent.ts` 用 `?? false` / `?? 'medium'` 把 null 補成看似合理的假值**（根因）
3. `canonical-poi.ts` 的 `SMART_DEFAULTS` 也是 `is_indoor: false`，註解甚至寫「不留 null」
4. `poi-search.ts` 的 API 層第三次補 `?? false`

觸發事件是 Gemini 免費層 RPD 20 在第 15 筆左右耗盡（2026-05-06），但**真正的缺陷是失敗被吞掉並存成資料**。

### 影響（最嚴重的一項）

應變管線下雨路徑是 `filter_metadata @> {"is_indoor": true}` 的**硬性 JSONB 篩選**。線上僅存的 4 筆室內景點——NCA-013 北海岸遊憩探索館、NCA-003 朱銘美術館、NCA-001 野柳海洋世界、NCA-015 劉家肉粽富基店——**全部在北海岸**。

> **陽明山 0 筆室內、東北角 0 筆室內 → 使用者行程在這兩區時，下雨候選池回 0 筆，降級成 `delay_timeslot`。天氣應變（旗艦功能）在 2/3 的區域必然無候選。**

次要影響：前端 `weather/page.tsx:86` 的 `!meta.is_indoor && weather_sensitivity !== "低"` 讓 41/45 永遠被標成受天氣影響（含博物館與飯店）。

**且錯誤值已烘進 embedding**：`ingestion.ts` 把「空間類型: 戶外」寫入 embedding 文字並據此產 tags，所以修正必須連帶重建 embedding，不能只 UPDATE 欄位。

### 已修（2026-08-02，程式碼側）

- ✅ `types.ts` / `canonical-poi.ts`：`is_indoor` 與 `weather_sensitivity` 型別改為可 null
- ✅ `agent.ts`：`?? false` → `?? null`；`emptyFacts` 同步
- ✅ `canonical-poi.ts`：`SMART_DEFAULTS` 這兩個欄位改為 `null`
- ✅ `ingestion.ts`：null 時不寫入 embedding 文字、不產 tags；新增 `metadata.llm_source`
- ✅ `poi-search.ts`：API 層不補預設值，null 一路帶到前端
- ✅ `batch-verify.ts`：連續 3 筆降級即中止、降級筆數**不入庫**、非零 exit code
- ✅ `bench-datalayer.ts`：真值排除 `llm_source='fallback'` 的筆數
- ✅ migration `010`：新增 `verification_tier` 讓「未驗證」在 DB 裡看得見
- ✅ 單元測試 `tests/verification-provenance.test.ts`（32 項，經變異測試驗證能抓到原 bug）

### 未修（需要動線上資料）

- ⬜ **套用 migration 010**（`verification_tier` / `conflict_analysis` / `level_reasoning` 尚未存在於線上 DB）
- ⬜ **重跑既有 45 筆**——前置條件是 Gemini 升 Tier 1（免費層 RPD 20 不可能跑完，需 ≥90 次呼叫）
- ⬜ **重建 embedding**（必須排在重跑之後）

在重跑之前，線上資料仍是壞的；`poi-search.ts` 的降級查詢確保 explore 頁不會因缺欄位而掛掉。

---

## 2026-07-28｜部落格佐證混入與景點完全無關的內容（YouTube 來源沒有相關性過濾）

### 現況

前端把佐證來源接上畫面後（`src/lib/verification-detail.ts`）才看見：全庫 **90 則佐證裡有 11 則來自 YouTube**，其中出現與景點毫無關係的影片。實例——**擎天崗（YMS-004）的「旅客真實評論」第二則是一支勞斯萊斯開箱影片**：

```
#2025 - YouTube
2025 Rolls Royce Cullinan Series ll #2025 #viralvideo #cullinan
#rollsroyce #ghost RollsRoyce Is Brand 1.5M views 1 year ago
```

### 根因

`validators/youtube-search.ts` 有濾業配，但**沒有濾「這支影片到底講不講這個景點」**。YouTube Data API 的關鍵字搜尋在景點名稱冷門時會回傳大量不相關結果（此例可能是標題含 `#2025` 之類的通用 hashtag 被匹配到），而管線把回傳的前幾筆直接當成佐證收下。

### 影響

比「少一筆佐證」嚴重：這是**對外展示的可信度證據**。教授或評審點開任何一個景點看到不相關的來源，會直接動搖「多來源交叉驗證」這條主敘事——反而比沒有佐證更糟。

### 建議做法（尚未實作）

1. 最低成本：標題／描述必須包含景點名稱或其 canonical 別名才收，否則丟棄
2. 較穩：用既有的 embedding 算影片標題與景點描述的相似度，設門檻
3. 或：demo 前先把 YouTube 來源整個關掉——複查顯示 P0/P1/P2 三個驗證器對現行 45 筆的 `sources` 貢獻本來就是 0（見 `待討論事項_0709.md` #14），關掉不影響現有可信度分數

---

## 2026-07-28｜部分景點主圖與內容不符

### 現況

`explore` 詳情頁的主圖來自 `poi_catalog.images[0]`。實例：**擎天崗（大草原）的主圖是一杯檸檬薑茶的照片**。

### 與 #11（images 缺口）的關係

兩者方向相反、不要搞混：#11 講的是「非 TDX 路徑**沒有**圖片來源可寫入」；本項講的是「**寫進去的那些圖**有部分跟景點無關」。修 #11（補圖片來源）之前，得先確認現有圖片是哪裡來的、為什麼會對不上——否則補更多圖只會放大這個問題。

---

## 2026-07-24｜現行 `poi_verified.json` 有 30/45 筆是「靜默降級」的 fallback（非真實驗證）

### 現況（直接複查 `results/poi_verified.json` 得出）

45 筆全部標記 `verified_at = 2026-05-06`（03:06–03:21 一輪批次），但 `tokens_used` 呈現 `111111111111111000000000000000000000000000000`——**前 15 筆 LLM 成功、後 30 筆全部 `tokens_used == 0`**。這 30 筆走的是 [`src/enrichers/index.ts:219-231`](src/enrichers/index.ts) 的 fallback 分支：

- `facts: null`（`official_name`/`address`/`hours`/`is_indoor`/`weather_sensitivity` 全部沒有 LLM 值，只靠 agent.ts 的 `??` 鏈退回 Google/OSM/input）
- `suggested_level: 2`（**不是分類結果，是預設值**）
- `level_reasoning: '無法呼叫 LLM，預設 L2'`
- `backup_logic.description: '自動備案（LLM 不可用）'`
- `tourist_friendly_description` 缺漏（30 筆全無）

**這直接解釋了 L2=39/45 的偏態**：其中 30 筆的 L2 是降級預設、不是判斷。目前 explore 前端與 `ingestToDB()` 無法區分「真 L2」與「失敗預設 L2」——過去 [`src/agent.ts`](src/agent.ts) 從未把 `enrich()` 回傳的 `llm_source`（`'gemini' | 'claude' | 'fallback'`）寫進 `PoiVerifierOutput`，唯一線索是 `backup_logic.description` 裡那句中文字串。

> **2026-07-26 更新**：`llm_source` 已持久化進 `PoiVerifierOutput`（見下方「根治做法」第 1 點），未來新產出的每筆都會標明來源。但**既有的 `results/poi_verified.json` 45 筆是在此修復前產生的、尚未重跑，仍不含 `llm_source` 欄位**——要靠既有檔案分辨那 30 筆，目前仍只能看 `tokens_used == 0` 或 `backup_logic.description` 的中文字串。

### 根因

不是新 bug，是**既有的 Gemini Free Tier RPD-20 配額問題（見本檔最下方「Gemini Free Tier 配額參考」）在批次中途耗盡**：跑到第 ~15 筆配額用完，`callGemini` 開始回 HTTP 429 → `callClaude` 若無 key 也回 null → 進 fallback。真正的 harness 缺陷不是「LLM 會失敗」，而是**失敗被靜默吞掉並當成資料入庫**：批次沒有在偵測到連續 fallback 時中止，輸出也沒有把降級狀態標記出來讓下游拒收。

### 根治做法（進度：2026-07-26 部分完成）

1. **先讓失敗可見**：
   - ✅ **已完成（2026-07-26）**：`llm_source` 已一路傳進 `PoiVerifierOutput` 並持久化——`src/agent.ts` 成功分支帶 `enrichOutput.llm_source`、景點不存在分支標 `'fallback'`；`src/types.ts` 補上該欄位。下游（`ingestToDB()`／explore）從此能區分真 L2 與降級 L2。keyless 整合測試已驗證輸出含 `"llm_source": "fallback"`。
   - ⬜ **未完成**：`batch-verify.ts` 尚未加「偵測連續 N 筆 fallback 即中止」的邏輯——配額一旦耗盡仍會一路跑到底、繼續產生降級資料。這是純程式改動，可單人補上。
2. **重跑那 30 筆**（未完成）：Tier 1 綁卡後全量重跑 < NT$1（見配額備註）。這是「驗證庫」與「驗證庫但 2/3 沒真的驗到」的差別，且直接影響 #1 資料範圍拍板後要不要信任既有 45 筆。⚠️ 此步牽涉花費與 #1 範圍決議，需團隊確認後執行，非單人可逕行。
3. 第 2 步要早於 #2／#10 任何一次重新匯入完成，否則會把降級資料一起 embed 進 Supabase。

---

## 2026-07-26｜已修復：L0 backup_logic 掛回、enrich prompt 丟棄欄位（原兩筆 2026-07-24 條目）

以下兩個 2026-07-24 條目已於 2026-07-26 修復，依本檔慣例（解決後移除）合併為此紀錄，並附上一項對原始建議的重要修正：

1. **L0 景點被 `??` 重新掛回 backup_logic** → 已修：[`src/enrichers/index.ts`](src/enrichers/index.ts) 的 `backup_logic` 改為直接採用規則層 `generateBackupLogic()` 的回傳（L0 恆 null、L1–L3 恆非 null），移除了 `?? llmOutput.backup_logic` 這個把 swap 計畫掛回 L0 的 fallback。enrichers 測試 Test 1（L0 backup_logic 應為 null）通過。
2. **enrich prompt 產出會被丟棄的 `backup_logic`** → 已修：已將 `backup_logic` 從 enrich prompt 的 JSON schema 移除，`LlmOutput.backup_logic` 一併改為 optional，純省 output token、不動架構。

> ⚠️ **對 2026-07-24 原始建議的修正（動工前若看到舊建議，以本段為準）**：原條目建議「連 `suggested_level` 一起從 prompt 移除，兩者都由規則層決定」——**這是錯的，本次只移除 `backup_logic`，`suggested_level` 必須保留**。理由：`preClassifyLevel` 只在名稱／描述含預約關鍵字時回傳 L0（現行 45 筆僅命中 2 筆），其餘約 96% 的等級判斷倚賴 `enrich()` 內 `ruleLevel ?? llmOutput.suggested_level` 的 LLM 值。若一併移除 `suggested_level`，這 ~96% 的景點會失去等級（拿到 `undefined`）。「suggested_level 由規則層決定」只在那 2 筆命中規則的情況下成立。

---

## 2026-05-26｜enrich-external-links 預處理尚未收集的欄位

### 現況

`enrich-external-links.ts` 目前收集：KKday URL、Klook URL、Facebook 官方頁面、票價 hint。
以下欄位對「防白跑」有價值，但尚未實作：

### 未實作項目

**1. 單位電話（高優先）**
- 目前 `google-places.ts` 和 `enrich-external-links.ts` 都沒有抓電話
- 建議來源：Google Places API `formatted_phone_number` 欄位（最準）+ 觀光署 V2.1 dataset（46% 覆蓋率，見 BOOKING_ENRICHMENT.md Sprint 2）
- 不建議從 Serper snippet 抽取，格式不穩定、可靠度低
- 實作位置：在 `src/validators/google-places.ts` 補 `phone` 欄位，或在 `ingestion.ts` Sprint 1 統一處理

**2. Tripadvisor 連結（中優先）**
- 搜尋 `"景點名" site:tripadvisor.com`，URL pattern：`/Attraction_Review-`
- 價值：有評分、最近評論日期、使用者標記的臨時關閉通知
- 邏輯與現有 KKday/Klook 幾乎一樣，可直接複製 `pickBest` 邏輯

**3. 近期新聞 / 關閉公告（中優先）**
- 用 Serper `type: "news"` 搜 `"景點名" 停業 OR 整修 OR 暫停 OR 關閉`
- 過濾最近 3 個月內的結果（Serper 支援 `tbs: "qdr:3m"` 參數）
- 是「施工整修白跑」最直接的預防手段，但 noise 較多，需要時間過濾 + 信心分類

**4. Google Maps 即時營業狀態（高優先，但需 Places API）**
- Google Places `business_status` 直接回傳 `OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY`
- 這是防白跑最強的信號，應在 `google-places.ts` 補上，不適合從 Serper 抓

**5. 票價資料（需謹慎設計，暫不實作）**
- 票價分層複雜：全票/半票/兒童/敬老/假日/套票 各自不同，Serper snippet 只能抓到片段
- 危險：下游 LLM 看到單一價格可能錯誤判斷景點「貴」或「便宜」，影響推薦決策
- 正確做法：從 KKday/Klook 商品頁完整抓所有票種（需 scraping）或串接官方票務 API
- 票價是「補充資訊」，不是核心資料，不應讓 AI 用票價來排序或過濾景點
- 目前 `enrich-external-links.ts` 刻意不抓票價，等有完整方案再處理

---

## 2026-05-17｜11 筆 POI 的部落格內容太薄，LLM 萃不出真實洞察

### 現況

Supabase `poi_catalog` 45 筆中，**34 筆有真實洞察**，11 筆 `blog_snippets` 是空殼物件（HTTP 200 但 `constraints/visitor_tips/...` 全空陣列或 null）。

空殼景點：
`NCA-012, NCA-013, YMS-003, YMS-006, YMS-008, YMS-009, YMS-010, YMS-015, NEI-010, NEI-013, NEI-015`

### 根因

不是 code bug 也不是 quota 問題 —— 是這些景點的部落格 snippet 本身太通用/太薄，沒「非通用旅遊洞察」可萃。例如 YMS-008 夢幻湖只搜到通用一日遊文，沒人寫實用注意事項。

### 改善方向

1. **Verifier 階段 Serper query 加長尾關鍵字**：目前只搜「景點名」，可加「景點名 心得」「景點名 注意」「景點名 評價」分散搜
2. **改用 Tavily**：docs/search-providers-evaluation.md 評估過，網域白名單能拉到更深度的部落格
3. **接受現況**：76% 命中率對 demo 夠用，剩 11 筆是小眾景點，UI 顯示「資料較少」即可

---

## 2026-05-16｜Verifier 階段 16 筆 reliability_score 為 null（已 fallback，未根治）

### 現況

`results/poi_verified.json` 內有 16 筆 `verification_result.reliability_score == null`。Ingest 已在 [`src/ingestion.ts`](src/ingestion.ts) 加 fallback（依 sources 數給 0.35 / 0.5 / 0.6），所以 Supabase 上不再有 null，但這只是 ingestion 補丁，不是根治。

### 根因（推測）

舊版 `crossValidate()` 在 sources 全空時可能 return null（或舊版邏輯有 bug，後來改了沒重跑）。

### 根治做法

重跑 Stage 1 驗證 → 重產 `poi_verified.json`。成本：45 筆 × ~1500 tokens。但要先確認新版 `crossValidate()` 不會再產 null。

---

## 2026-05-16｜Verifier 沒實作候選池查詢，`candidate_pool_tags` 永遠空

### 現況

`enrichers/index.ts:203` 呼叫 `generateBackupLogic(level, [], context ?? {})` —— **第二個參數 candidatePool 寫死傳 `[]`**。所以 `enrichers/resilience-generator.ts` 內的 `topTags` 永遠空陣列，verifier 階段產不出任何 tag。

目前 ingestion 已用「結構化資料衍生」補上（地區/等級/室內外/天氣/時長/需預約），所以 Supabase 上 tags 是有值的。但這是繞過去，不是修源頭。

### 根治做法

讓 Verifier 真的查 Supabase 拿同區同層級的候選 POI 池，傳進 `generateBackupLogic()`。但這有 chicken-and-egg：第一筆景點驗證時 DB 還沒資料。可能要等基礎庫填到一定量後才實作。

---

## Gemini Free Tier 配額參考（踩坑記錄）

- `gemini-2.5-flash` Free Tier：**RPD 20 次/天**（不是 250！官方文件常更新，以實測為準）、RPM 10
- `gemini-embedding-001` Free Tier：RPD 100、RPM 15
- 跑全量 45 筆 ingest = 至少 90 次呼叫，**Free 撐不住**，必須 Tier 1 綁卡
- Tier 1 完整跑 45 筆 < NT$1
- 同 Google 帳號的多把 key 共用配額；不同帳號的 key 各自獨立
