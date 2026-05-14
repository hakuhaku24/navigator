目前能用的腳本總覽

---

POI 驗證 Agent（agents/poi-verifier/）

cd agents/poi-verifier

# 驗證單一景點

npm run verify

# 批次驗證全部 45 筆景點

npm run batch

# 批次驗證 + 順便寫入 Supabase

npm run batch:ingest

# 把驗證結果 ingest 進 Supabase（單獨執行）

npm run ingest

# 跑 demo 情境

npm run demo

# 驗證單一景點

npm run verify

# 批次驗證全部 45 筆景點

npm run batch

# 批次驗證 + 順便寫入 Supabase

npm run batch:ingest

# 把驗證結果 ingest 進 Supabase（單獨執行）

npm run ingest

# 跑 demo 情境

npm run demo

---

應變系統 Agent（agents/contingency-handler/）

cd agents/contingency-handler

# 觸發應變處理（下雨、景點關閉等）

npm run handle

# 跑 demo 情境

npm run demo

# 跑 integration test

npm test

---

最常用的兩個應該是：

- cd agents/poi-verifier && npm run batch — 一次跑完 45
  筆景點驗證
- cd agents/contingency-handler && npm run demo — 跑應變邏輯
  demo

記得兩個資料夾都需要有 .env 設定好 API key 才能跑。

---

API Key 額度說明請見 API_KEY_PRICING.md
