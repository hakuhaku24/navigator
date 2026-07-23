# poi-verifier 已知問題

> 記錄當前未解或部分解決的問題。解決後直接從本檔移除。
> 最新在最上面。

---

## 2026-07-24｜現行 `poi_verified.json` 有 30/45 筆是「靜默降級」的 fallback（非真實驗證）

### 現況（直接複查 `results/poi_verified.json` 得出）

45 筆全部標記 `verified_at = 2026-05-06`（03:06–03:21 一輪批次），但 `tokens_used` 呈現 `111111111111111000000000000000000000000000000`——**前 15 筆 LLM 成功、後 30 筆全部 `tokens_used == 0`**。這 30 筆走的是 [`src/enrichers/index.ts:219-231`](src/enrichers/index.ts) 的 fallback 分支：

- `facts: null`（`official_name`/`address`/`hours`/`is_indoor`/`weather_sensitivity` 全部沒有 LLM 值，只靠 agent.ts 的 `??` 鏈退回 Google/OSM/input）
- `suggested_level: 2`（**不是分類結果，是預設值**）
- `level_reasoning: '無法呼叫 LLM，預設 L2'`
- `backup_logic.description: '自動備案（LLM 不可用）'`
- `tourist_friendly_description` 缺漏（30 筆全無）

**這直接解釋了 L2=39/45 的偏態**：其中 30 筆的 L2 是降級預設、不是判斷。目前 explore 前端與 `ingestToDB()` 無法區分「真 L2」與「失敗預設 L2」——[`src/agent.ts:118`](src/agent.ts) 從未把 `enrich()` 回傳的 `llm_source`（`'gemini' | 'claude' | 'fallback'`）寫進 `PoiVerifierOutput`，唯一線索是 `backup_logic.description` 裡那句中文字串。

### 根因

不是新 bug，是**既有的 Gemini Free Tier RPD-20 配額問題（見本檔最下方「Gemini Free Tier 配額參考」）在批次中途耗盡**：跑到第 ~15 筆配額用完，`callGemini` 開始回 HTTP 429 → `callClaude` 若無 key 也回 null → 進 fallback。真正的 harness 缺陷不是「LLM 會失敗」，而是**失敗被靜默吞掉並當成資料入庫**：批次沒有在偵測到連續 fallback 時中止，輸出也沒有把降級狀態標記出來讓下游拒收。

### 根治做法

1. **先讓失敗可見**：把 `llm_source` 一路傳進 `PoiVerifierOutput` 並持久化；`batch-verify.ts` 偵測連續 N 筆 fallback 就中止（配額耗盡時繼續跑只會產生更多壞資料）。
2. **重跑那 30 筆**：Tier 1 綁卡後全量重跑 < NT$1（見配額備註）。這是「驗證庫」與「驗證庫但 2/3 沒真的驗到」的差別，且直接影響 #1 資料範圍拍板後要不要信任既有 45 筆。
3. 這條要早於 #2／#10 任何一次重新匯入完成，否則會把降級資料一起 embed 進 Supabase。

---

## 2026-07-24｜L0 景點被 `??` 重新掛回 backup_logic（違反自身 L0 定義）

### 現況

[`src/enrichers/index.ts:251`](src/enrichers/index.ts) 為 `backupLogic ?? llmOutput.backup_logic`。`generateBackupLogic()` 對 L0 正確回傳 `null`（絕對錨點不該有備案），但 `??` 隨即用 LLM 產出的 `backup_logic` 補上，等於把 swap 計畫重新掛回 L0。複查 `poi_verified.json` 兩筆 L0（NCA-001、NCA-003，皆有 LLM tokens）確認 `backup_logic` **NOT NULL**，與 SYSTEM_PROMPT 自己寫的「L0 系統禁止自動替換」矛盾。

### 根治做法

L0 分支不要走 `??` fallback；`level === 0` 時 `backup_logic` 強制為 `null`。

---

## 2026-07-24｜enrich 的 `suggested_level` / `backup_logic` 是「付費產出但被丟棄」

### 現況

[`src/enrichers/index.ts:246`](src/enrichers/index.ts) 呼叫 `generateBackupLogic(level, [], context)`（候選池寫死 `[]`，與 2026-05-16 那條已知問題同源），對 L1–L3 恆回非 null，因此 LLM 產的 `backup_logic` 永遠被覆蓋、用不到。同理 `preClassifyLevel` 觸發時 `suggested_level` 也被規則覆蓋。但 [`enrichers/index.ts:94-113`](src/enrichers/index.ts) 的 prompt **仍然要求 LLM 輸出這兩個欄位**——等於每筆都花 output token 產一份會被丟掉的結果（45 筆成功者均值 3,231 token／筆）。

### 根治做法

從 enrich prompt 的 JSON schema 移除 `suggested_level` 與 `backup_logic`（兩者都由規則層決定），只留 `facts` + `tourist_friendly_description`。純省 token、不動架構，是 #14 skill 拆分前就能先做的最低風險改動。

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
