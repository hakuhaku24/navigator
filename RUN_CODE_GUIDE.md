# 可用腳本總覽

---

## POI 驗證 Agent（`agents/poi-verifier/`）

```bash
cd agents/poi-verifier
```

### 景點驗證

| 指令 | 說明 |
|------|------|
| `npm run verify` | 驗證單一景點（需 GOOGLE_PLACES_API_KEY） |
| `npm run batch` | 批次驗證 45 筆景點 |
| `npm run batch:ingest` | 批次驗證 + 寫入 Supabase |
| `npm run ingest` | 把驗證結果單獨寫入 Supabase |

### Demo 場景

| 指令 | 說明 |
|------|------|
| `npm run demo` | 跑全部五個 demo 場景（Block A POI 驗證 × 3 + Block B RAG × 2） |
| `npx ts-node demo-scenarios.ts --only-rag` | 只跑 Block B：RAG Reranker 兩個應變場景（不呼外部 API，速度快） |

### RAG 向量庫

| 指令 | 說明 |
|------|------|
| `npm run rag:ingest` | 把 poi_catalog 的資料向量化並寫入 Supabase pgvector |
| `npm run rag:ingest:dry` | Dry-run：只印要寫入的資料，不真正呼叫 API |
| `npm run rag:build` | 本地 RAG 索引建置（不走 Supabase） |
| `npm run rag:info` | 印出目前 RAG 索引狀態 |
| `npm run rag:search -- "查詢字串"` | 執行向量搜尋 |

### Hybrid Search + Reranker

| 指令 | 說明 |
|------|------|
| `npm run hybrid:search -- "查詢字串"` | 執行混合搜尋（bigram 關鍵字 + pgvector 語意，RRF 融合） |
| `npm run hybrid:info` | 印出 hybrid search 模組的設定 |
| `npm run rerank -- "查詢字串"` | 執行 RAG Reranker（Stage-1 hybrid → Stage-2 Gemini 交叉評分） |

### TDX 觀光 API 批次入庫

| 指令 | 說明 |
|------|------|
| `npm run tdx:ingest` | 從 TDX API 抓資料並完整驗證後寫入 poi_catalog |
| `npm run tdx:ingest:dry` | Dry-run：不呼 TDX API，只印模擬資料 |
| `npm run tdx:ingest:skip-verify` | 跳過 Google Places/OSM 驗證，只用 Gemini 快速 enrich |

TDX 進階選項（直接用 ts-node 傳 flag）：

```bash
npx ts-node ingest-from-tdx.ts --type ScenicSpot --city 臺北市 --top 50
npx ts-node ingest-from-tdx.ts --type Restaurant --top 20 --delay 500
```

### 單元測試

| 指令 | 說明 |
|------|------|
| `npm run test:validators` | 驗證器（Google Places + OSM）單元測試 |
| `npm run test:enrichers` | 分級器（L0-L3 + 備案邏輯）單元測試 |
| `npm run test:integration` | End-to-end 整合測試（需 API key） |
| `npm run test:rag` | RAG 管道單元測試 |
| `npm run test:rag:supabase` | Supabase pgvector 整合測試 |
| `npm run test:tdx` | TDX 映射邏輯測試（88 個 assertions，零 API 呼叫） |

---

## 應變系統 Agent（`agents/contingency-handler/`）

```bash
cd agents/contingency-handler
```

| 指令 | 說明 |
|------|------|
| `npm run handle` | 觸發應變偵測 |
| `npm run demo` | 跑應變邏輯 demo（下雨、景點關閉） |
| `npm test` | Integration test |

應變 CLI 直接傳事件：

```bash
npx ts-node handle-contingency.ts heavy_rain 25.168,121.541 NCA-002
npx ts-node handle-contingency.ts venue_closure 25.033,121.565
npx ts-node handle-contingency.ts auto 25.168,121.541   # 呼真實 CWA 天氣 API
```

---

## 最常用的工作流程

**快速 demo（不需任何外部 API）：**

```bash
cd agents/poi-verifier
npm run tdx:ingest:dry          # 確認 TDX 映射邏輯
npx ts-node demo-scenarios.ts --only-rag  # 跑 RAG 兩個應變場景
```

**完整驗證管道：**

```bash
cd agents/poi-verifier
npm run batch:ingest            # 45 筆景點驗證 + 寫入 Supabase
npm run rag:ingest              # 向量化入庫
npm run demo                    # 跑全部五個 demo 場景
```

**TDX 批次入庫：**

```bash
cd agents/poi-verifier
npm run tdx:ingest:dry          # 先確認輸出
npm run tdx:ingest:skip-verify  # 快速版（只用 Gemini enrich，無三源驗證）
npm run tdx:ingest              # 完整驗證後入庫（慢，需 Google Places key）
```

---

環境變數設定請見 [agents/ENV_SETUP.md](agents/ENV_SETUP.md)
