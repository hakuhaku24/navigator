# poi-verifier 已知問題

> 記錄當前未解或部分解決的問題。解決後直接從本檔移除。
> 最新在最上面。

---

## 2026-05-16｜30 筆 POI 缺真實 blog_snippets（Gemini RPD 耗盡）

### 現況

- Supabase `poi_catalog` 共 45 筆，**15 筆有真實 LLM 萃取的洞察**（constraints/visitor_tips/weather_notes/crowd_notes/recent_status），剩 **30 筆是空殼物件**。
- `tags`、`reliability_score` 兩欄全 45 筆都已修好。

### 根因

- Gemini 2.5 Flash Free Tier RPD = 250 次/天。本日已耗盡。
- 重跑 `ingest-missing-insights.ts` 雖然 RPM 控制在 5 筆/分鐘（< 10 RPM），但 RPD 已先撞牆，全部 429。
- `extractInsights()` catch 後寫入空物件 `{constraints:[], visitor_tips:[], ...}`。embedding 雖然成功（embedding API 是另一個 quota），但洞察沒進來。

### 補救選項

| 方案 | 成本 | 時間 |
|---|---|---|
| 等明天 8:00（太平洋午夜）quota 重置 | 0 | 等 ~16h |
| 升 Gemini Tier 1 綁信用卡 | < NT$1 跑完 | 即時 |
| 寫 Claude Haiku fallback | ~NT$1.5 跑完 | 即時，但要寫 code |

### 如何續跑

```bash
cd agents/poi-verifier
npx ts-node ingest-missing-insights.ts
```

該腳本會自己從 Supabase 撈出缺洞察的 source_id，只跑那幾筆。可重複執行直到全部補完。

---

## 2026-05-16｜Verifier 階段 16 筆 reliability_score 為 null（已 fallback，未根治）

### 現況

`results/poi_verified.json` 內有 16 筆 `verification_result.reliability_score == null`。Ingest 已在 [`src/ingestion.ts`](src/ingestion.ts) 加 fallback（依 sources 數給 0.35 / 0.5 / 0.6），所以 Supabase 上不再有 null，但這只是 ingestion 補丁，不是根治。

### 根因（推測）

舊版 `crossValidate()` 在 sources 全空時可能 return null（或舊版邏輯有 bug，後來改了沒重跑）。

### 根治做法

重跑 Stage 1 驗證 → 重產 `poi_verified.json`。成本：45 筆 × ~1500 tokens = ~67k tokens（Gemini Free 一天份足以）。但要先確認新版 `crossValidate()` 不會再產 null。

---

## 2026-05-16｜Verifier 沒實作候選池查詢，`candidate_pool_tags` 永遠空

### 現況

`enrichers/index.ts:203` 呼叫 `generateBackupLogic(level, [], context ?? {})` —— **第二個參數 candidatePool 寫死傳 `[]`**。所以 `enrichers/resilience-generator.ts` 內的 `topTags` 永遠空陣列，verifier 階段產不出任何 tag。

目前 ingestion 已用「結構化資料衍生」補上（地區/等級/室內外/天氣/時長/需預約），所以 Supabase 上 tags 是有值的。但這是繞過去，不是修源頭。

### 根治做法

讓 Verifier 真的查 Supabase 拿同區同層級的候選 POI 池，傳進 `generateBackupLogic()`。但這有 chicken-and-egg：第一筆景點驗證時 DB 還沒資料。可能要等基礎庫填到一定量後才實作。
