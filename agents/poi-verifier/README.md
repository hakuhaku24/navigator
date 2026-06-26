# POI Verifier — Navigator 景點驗證與 RAG 搜尋子系統

> 最後更新：2026-06-26

---

## 一句話說明

這個子系統做三件事：**驗證景點真實性**、**建立語意向量庫**、**在行程應變時重排備案景點**。

---

## 系統架構與資料流

```
輸入來源
  ├── 手動輸入（verify-poi.ts）
  ├── 45 筆測資 JSON（batch-verify.ts）
  └── TDX 觀光 API（ingest-from-tdx.ts）
         │
         ▼
  ── Stage 1：多來源交叉驗證（crossValidate）──────────────────
  │
  ├── [P0] 官網抓取       official     半衰期 60 天  +0.15
  ├── [S1] Google Places  semi_official 半衰期 30 天  +0.50 / +0.65
  ├── [S1] OSM Nominatim  semi_official 半衰期 30 天  +0.30 / +0.50
  ├── [P1] PTT 旅遊版      blog_travel  半衰期 180 天 +0.10
  ├── [P2] YouTube Data   blog_travel  半衰期 180 天 +0.10
  └── 旅遊部落格（DDG）    blog_travel  半衰期 180 天 +0.25
         │
         ▼ reliability_score = Σ(來源信度 × 時間衰減)，clamp 到 [0, 1]
         │ 若 Google Maps 回傳 CLOSED_PERMANENTLY → exists=false，終止
         │
  ── Stage 2：LLM 增補（enrich）────────────────────────────────
  │
  ├── 規則引擎預分類等級（preClassifyLevel）
  ├── Gemini 2.5 Flash（主力）→ 備援 Claude Haiku 4.5
  └── 輸出：官方名稱 / 開放時間 / 停留分鐘 / 室內外 / 天氣敏感度
            L0–L3 等級 / 等級理由 / 備案邏輯 / 旅客友善描述
         │
         ▼
  ── Stage 3：入庫（ingestToDB）───────────────────────────────
  │
  ├── Gemini 嵌入（gemini-embedding-001，768 維，RETRIEVAL_DOCUMENT）
  ├── LLM 萃取非通用洞察（限制 / 建議 / 天氣注意 / 近況）
  └── Upsert → Supabase poi_catalog
         │
         ▼
  ── 查詢層：RAG Reranker ─────────────────────────────────────
  │
  ├── Hybrid Search（RRF：關鍵字二元組 + pgvector 語意）
  └── Reranker（結構加權 → Gemini LLM 交叉評分）
```

---

## 所有可執行指令

### 驗證器

| 指令 | 腳本 | 說明 |
|------|------|------|
| `npm run verify` | `verify-poi.ts` | 單一景點驗證，傳入名稱與座標，輸出完整 JSON |
| `npm run batch` | `batch-verify.ts` | 批次驗證 45 筆測資，結果存 `results/poi_verified.json`，支援中斷恢復 |
| `npm run batch:ingest` | `batch-verify.ts --ingest` | 批次驗證 + 直接 embed + 寫入 Supabase |
| `npm run ingest` | `ingest-from-results.ts` | 從已有的 `poi_verified.json` 重跑 embed + upsert（不重驗證） |
| `npm run demo` | `demo-scenarios.ts` | 五個示範場景（見下方說明） |

**`npm run verify` 用法：**
```bash
npx ts-node verify-poi.ts "竹子湖海芋" 25.168 121.541
```

### RAG / 語意搜尋

| 指令 | 腳本 | 說明 |
|------|------|------|
| `npm run rag:build` | `basic-rag.ts --build` | 從 `poi_verified.json` 建本地向量索引（一次性，存成 JSON） |
| `npm run rag:search` | `basic-rag.ts --query` | 在本地向量索引做 cosine 語意搜尋 |
| `npm run rag:ingest` | `ingest-embeddings.ts` | 將本地向量索引上傳 Supabase poi_catalog |
| `npm run rag:ingest:dry` | `ingest-embeddings.ts --dry-run` | 印出 payload，不寫入 |
| `npm run hybrid:search` | `hybrid-search.ts --query` | 混合搜尋：關鍵字二元組 + Supabase pgvector，RRF 融合 |
| `npm run hybrid:info` | `hybrid-search.ts --info` | 印出向量庫目前景點數量與維度 |
| `npm run rerank` | `rag-reranker.ts --query` | 兩階段重排：結構加權 + Gemini LLM 交叉評分 |

**`hybrid:search` 與 `rerank` 用法：**
```bash
npx ts-node hybrid-search.ts --query "下雨天室內景點"
npx ts-node hybrid-search.ts --query "陽明山古道" --filter region:陽明山
npx ts-node hybrid-search.ts --query "親子遊" --filter indoor --alpha 0.7

npx ts-node rag-reranker.ts --query "下雨天不想淋濕" --scenario heavy_rain
npx ts-node rag-reranker.ts --query "北海岸備案" --scenario closure
npx ts-node rag-reranker.ts --query "帶爸媽輕鬆行" --scenario fatigue --vibe 親子,輕鬆
npx ts-node rag-reranker.ts --query "文青景點" --no-llm  # 只做結構排序，不呼叫 Gemini
```

**hybrid:search 篩選語法：**
```
--filter indoor          只搜室內景點
--filter outdoor         只搜戶外景點
--filter region:陽明山   只搜特定區域
--filter level:2,3       只搜 L2 或 L3 景點
--alpha 0.0–1.0          語意向量比重（預設 0.5 = 關鍵字與向量各半）
```

### TDX 觀光 API 匯入

| 指令 | 腳本 | 說明 |
|------|------|------|
| `npm run tdx:ingest:dry` | `ingest-from-tdx.ts --dry-run` | 印出欄位對映結果，不呼叫任何外部 API |
| `npm run tdx:ingest:skip-verify` | `ingest-from-tdx.ts --skip-verify` | 輕量 LLM 增補（不跑 Google Places / OSM），直接 embed + 寫入 |
| `npm run tdx:ingest` | `ingest-from-tdx.ts` | 完整驗證模式：TDX 資料跑過全部驗證流程再入庫 |

**`tdx:ingest` 完整選項：**
```bash
npx ts-node ingest-from-tdx.ts --type ScenicSpot --city 宜蘭縣 --top 30 --dry-run
npx ts-node ingest-from-tdx.ts --type Restaurant  --city 臺北市 --top 20 --skip-verify
# --type  ScenicSpot | Restaurant | Hotel | Activity（預設 ScenicSpot）
# --city  TDX 城市名稱（省略 = 全台）
# --top   最多拉幾筆（預設 20）
# --delay 每筆間隔毫秒（預設 11000）
```

### 測試

| 指令 | 腳本 | 說明 |
|------|------|------|
| `npm run test:validators` | `tests/validators.test.ts` | 驗證器單元測試 |
| `npm run test:enrichers` | `tests/enrichers.test.ts` | 增補器單元測試 |
| `npm run test:integration` | `tests/integration.test.ts` | 端對端：單筆 POI 完整流程（需 API key） |
| `npm run test:rag` | `tests/rag.test.ts` | RAG 本地向量搜尋測試 |
| `npm run test:rag:supabase` | `tests/supabase-rag.test.ts` | RAG Supabase pgvector 測試 |
| `npm run test:tdx` | `tests/tdx-pipeline.test.ts` | TDX 欄位對映測試（88 項，零 API 呼叫） |

---

## Demo 場景（`npm run demo`）

執行五個預設示範場景，展示系統的三個核心能力。輸出 fixture 存至 `tests/fixtures/`。

```bash
npm run demo              # 跑全部 5 個場景
npx ts-node demo-scenarios.ts --only-rag  # 只跑 RAG 兩個場景（快速展示用）
```

### 區塊 A — POI 驗證器（3 個）

| # | 場景 | 驗證的能力 |
|---|------|------------|
| 1 | 竹子湖海芋（晴天正常） | 多來源交叉驗證、L 等級分類、備案邏輯生成 |
| 2 | 竹子湖海芋（大雨 80%） | 應變脈絡傳入，heavy_rain 場景下的等級與備案調整 |
| 3 | 台北星球大戰主題樂園 | 不存在景點的偵測：`exists=false`，不進入增補流程 |

### 區塊 B — RAG Reranker 應變示範（2 個）

| # | 場景 | 觸發邏輯 | 展示的重排效果 |
|---|------|----------|---------------|
| 4 | 下雨天備案 | `scenario: heavy_rain` | `is_indoor=true` → `structural_boost +1.0`；高天氣敏感戶外 → `−1.0` |
| 5 | 景點臨時關閉 | `scenario: closure` | `suggested_level 2/3` → `structural_boost +0.5`；L0/L1 不被選為備案 |

兩個 RAG 場景的最終排名 = **結構加權（40%）+ Gemini LLM 交叉評分（60%）**。

---

## 環境變數（`.env.local`）

| 變數名稱 | 必要性 | 用途 |
|----------|--------|------|
| `GEMINI_API_KEY` | 核心驗證、RAG 必須 | LLM 增補（Gemini 2.5 Flash）+ 向量嵌入（gemini-embedding-001） |
| `ANTHROPIC_API_KEY` | 選用 | LLM 備援（Claude Haiku 4.5），Gemini 失敗時自動切換 |
| `GOOGLE_PLACES_API_KEY` | 核心驗證必須 | Google Places API（Nearby Search + Place Details） |
| `YOUTUBE_API_KEY` | 選用 P2 | YouTube Data API v3（免費 10,000 units/日） |
| `SUPABASE_URL` | 入庫必須 | Supabase 專案 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 入庫必須 | 允許 upsert（bypass RLS） |
| `TDX_CLIENT_ID` | TDX 入庫必須 | TDX 觀光 API OAuth2 Client ID |
| `TDX_CLIENT_SECRET` | TDX 入庫必須 | TDX 觀光 API OAuth2 Client Secret |

> TDX 金鑰申請：https://tdx.transportdata.tw（免費帳號即可）

---

## 可信度評分公式

```
reliability_score = Σ(來源貢獻)，clamp 到 [0, 1]

各來源最大貢獻：
  P0  官網              +0.15   時間衰減半衰期 60 天
  S1  Google Places     +0.50   評分 ≥4.5 最多再加 +0.05，評論數加成最多 +0.05
  S1  OSM               +0.30   與 Google 同時存在時
  部落格（DDG）         +0.25   篇數 ≥3 再加 +0.10
  P1  PTT               +0.10   時間衰減半衰期 180 天
  P2  YouTube           +0.10   已過濾業配影片
  
  合計理論上限：1.40（實際 clamp 到 1.0）

時間衰減：time_decay = e^(-days / halfLife)
  official:      halfLife = 60 天
  semi_official: halfLife = 30 天
  blog_travel:   halfLife = 180 天
```

---

## L0–L3 等級定義

| 等級 | 名稱 | 觸發條件 | 系統行為 |
|------|------|----------|----------|
| L0 | 絕對錨點 | 必須事先預約或購票才能入場 | 禁止自動替換；RAG 重排中 `structural_boost −0.5` |
| L1 | 彈性錨點 | 本次行程主要目的地，有時段安排 | 可平移時段，不輕易換景點 |
| L2 | 條件變動 | 天氣敏感的戶外景點，或「想去非必去」 | 天氣應變時優先被 Swap；`closure` 場景 `+0.5` |
| L3 | 水位調節 | 順遊附加景點，時間到才去 | 最易被跳過；`closure` 場景 `+0.5` |

> 等級由 LLM（Gemini 2.5 Flash）根據景點事實決定，規則引擎提供初步提示。  
> 等級分佈參考：L0 5–15%、L1 15–25%、L2 35–45%、L3 20–35%

---

## TDX 欄位對映摘要

TDX 觀光 API 四種實體（ScenicSpot / Restaurant / Hotel / Activity）的關鍵欄位對映：

| TDX 欄位 | Navigator 欄位 | 處理方式 |
|----------|----------------|---------|
| `ScenicSpotName` | `name` | 直接對映 |
| `Position.{Lon,Lat}` | `lat`, `lng` | 攤平為平坦欄位 |
| `DescriptionDetail` / `Description` | `user_description` | 合併，加入 OpenTime / TravelInfo |
| `WebsiteUrl` | `website_url` | 直接對映（加速官網驗證，跳過 DDG 搜尋） |
| `Class1` | `category` | 對映到 Navigator 詞彙（11 種規則） |
| `Keyword` | `preliminaryTags[]` | 以逗號分割後去重 |
| `City` | `region` | 對映到策展分區（22 縣市對映表） |
| `ScenicSpotID` | `metadata.tdx_id` | 保留原始 ID 供來源追溯 |
| — | `level` / `weather_sensitivity` / `embedding` | Navigator 自行生成（TDX 完全不提供） |

完整差異表：[docs/TDX_SCHEMA_COMPARISON.md](docs/TDX_SCHEMA_COMPARISON.md)

---

## 檔案結構

```
agents/poi-verifier/
│
├── src/                          # 核心邏輯（可被其他腳本 import）
│   ├── agent.ts                  # 主入口：crossValidate + enrich
│   ├── ingestion.ts              # DB upsert、embedding、洞察萃取
│   ├── types.ts                  # 全域型別定義
│   ├── tdx-types.ts              # TDX API 回應型別
│   ├── tdx-mapper.ts             # TDX → Navigator 欄位對映
│   ├── validators/               # Stage 1：外部 API 查詢
│   │   ├── google-places.ts      # Google Places Nearby Search + Details
│   │   ├── osm.ts                # OSM Nominatim（sequential，1 req/s）
│   │   ├── blog-search.ts        # DuckDuckGo 部落格搜尋
│   │   ├── youtube-search.ts     # [P2] YouTube Data API v3
│   │   ├── ptt-search.ts         # [P1] PTT HTML 爬取（travel / Hiking / Taipei 版）
│   │   ├── official-website.ts   # [P0] 官網 fetch + DDG URL 發現
│   │   └── index.ts              # crossValidate：並行呼叫 + 可信度計分
│   └── enrichers/                # Stage 2：LLM 增補
│       ├── level-classifier.ts   # 規則引擎預分類（不依賴 LLM）
│       ├── multi-criteria-ranker.ts  # 多準則排序（備援候選池）
│       ├── resilience-generator.ts  # backup_logic 生成
│       └── index.ts              # enrich：Gemini → Claude Haiku 備援
│
├── verify-poi.ts                 # CLI：單筆驗證
├── batch-verify.ts               # 批次驗證 45 筆（可中斷恢復）
├── ingest-from-results.ts        # 從 poi_verified.json 入庫
├── ingest-with-p012.ts           # 合併 P0/P1/P2 批次結果後入庫
├── ingest-embeddings.ts          # 本地向量索引上傳 Supabase
├── ingest-from-tdx.ts            # TDX API → poi_catalog pipeline
├── basic-rag.ts                  # 本地向量索引建立 + cosine 搜尋
├── hybrid-search.ts              # 混合搜尋（關鍵字二元組 + pgvector + RRF）
├── rag-reranker.ts               # 兩階段重排（結構加權 + LLM 交叉編碼）
├── demo-scenarios.ts             # 5 個示範場景（3 驗證 + 2 RAG 應變）
│
├── tests/
│   ├── validators.test.ts        # 驗證器單元測試
│   ├── enrichers.test.ts         # 增補器單元測試
│   ├── integration.test.ts       # 端對端測試
│   ├── rag.test.ts               # 本地向量搜尋測試
│   ├── supabase-rag.test.ts      # Supabase pgvector 測試
│   ├── batch-new-validators.test.ts   # P0/P1 批次測試
│   ├── batch-youtube-validators.test.ts  # P2 批次測試
│   ├── tdx-pipeline.test.ts      # TDX 對映測試（88 項，零 API 呼叫）
│   └── fixtures/                 # 各測試的輸出 JSON
│
├── results/                      # 批次執行輸出（gitignore）
│   ├── poi_verified.json         # batch-verify 輸出
│   ├── poi-embeddings.json       # basic-rag 本地向量索引
│   ├── poi_ptt_official_results.json   # P0/P1 批次輸出
│   ├── poi_youtube_results.json        # P2 批次輸出
│   └── tdx_ingest_*.json               # TDX 入庫執行紀錄
│
└── docs/
    └── TDX_SCHEMA_COMPARISON.md  # TDX API vs Navigator schema 完整對照
```

---

## 典型工作流程

### 初次建庫（從 45 筆測資開始）
```bash
npm run batch          # 驗證 45 筆，產生 poi_verified.json
npm run ingest         # embed + upsert 至 Supabase poi_catalog
```

### 從 TDX 匯入新景點（輕量版）
```bash
npm run tdx:ingest:dry -- --type ScenicSpot --city 宜蘭縣 --top 20  # 先確認欄位對映
npm run tdx:ingest:skip-verify -- --type ScenicSpot --city 宜蘭縣 --top 20  # 輕量 LLM + 入庫
```

### 搜尋 + 應變示範
```bash
npm run hybrid:search -- "北海岸海景"
npm run rerank -- --query "下雨天室內景點" --scenario heavy_rain
npm run demo -- --only-rag   # 快速展示下雨 + 閉館兩個 RAG 應變場景
```
