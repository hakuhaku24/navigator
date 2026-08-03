# Navigator 開發日誌

> 記錄每次重要對話、決策與變更。最新在最上面。

---

## 2026-08-02～03｜資料層從「程式修好了」推進到「線上真的對了」，旗艦功能實質修復

### 背景

7/28 把三條線接通之後，複查驗證資料本身，挖出一個比「沒接上」更隱蔽的問題：**接上了、跑得動、回傳成功，但資料是編的**。追下去發現 2026-05-06 那批 ingest 時 Gemini 免費層配額在第 ~15 筆耗盡，`agent.ts` 用 `?? false` 把「未判定」補成「戶外」，導致 45 筆有 41 筆 `is_indoor=false`。而應變管線下雨路徑是 `is_indoor=true` 的硬性篩選——**僅存的 4 筆室內景點全在北海岸，陽明山與東北角下雨時候選池為 0**。旗艦功能在 2/3 的區域是壞的。

### 做了什麼

**8/02 — 程式碼側**
- 修掉三處把 `null` 補成假值的地方（`agent.ts`、`canonical-poi.ts` 的 `SMART_DEFAULTS`、`poi-search.ts` API 層），型別改為可 null
- `batch-verify.ts` 加「連續 3 筆降級即中止 + 降級不入庫 + 非零結束碼」
- migration 010 新增 `verification_tier`／`conflict_analysis`／`level_reasoning`
- 32 項單元測試（經變異測試驗證能抓到原 bug）
- 應變管線改讀 `poi_catalog` by `source_id`，解除對靜態 45 筆的依賴（原 #23）
- 接入 CWA 潮汐預報，並讓 `reliability_score` 真的參與排序（此前 explore 首頁秀「平均可信度」，但一輸入查詢，三源核驗與單源的排序完全一樣）

**8/03 — 線上資料側與產品面**
- **套用 migration 010 至線上、全量重跑 45 筆、重建 embedding**
- 潮汐可行性提示接進產品路徑（`TideBanner`），風險三態 high／low／unknown——查不到回 `unknown` 不回 `low`
- 分層徽章 `TierBadge`／`TierPanel` 上前端與對外 API，並修好 `deriveSourcesDetected()` 數不到 OSM 與部落格的問題（metadata 缺代理欄位，來源天花板結構上卡在 4 類）
- TDX 觀光 API 全面改版重接（舊端點全數 404），並接上官方 `ServiceStatus`
- 系統需求書 v0.5 → v0.6

### 結果（service role 直接查證線上資料）

| 指標 | 重跑前 | 重跑後 |
|---|---|---|
| `llm_source` | 30/45 `fallback` | **45/45 `gemini`** |
| `verification_tier` | 全 `null` | **`tier_1` 27、`tier_2` 18** |
| `is_indoor` | true 4／false 41 | **true 14／false 31** |
| 室內景點分區 | 4 筆全在北海岸 | **北海岸 4、東北角 6、陽明山 4** |
| 每筆來源類別數 | 幾乎全是 1 類 | **2類×12、3類×10、4類×14、5類×9** |

**天氣應變三個區域都有候選了，demo 不再需要避開陽明山與東北角。**

### 三件必須誠實記錄的事

1. **`reliability_score` 新舊不可比**——重跑同時新增了 OSM／官網／PTT 三類來源的權重，「平均可信度 68% → 78%」不是同一把尺上的進步。
2. **A/B benchmark 的 45%→95% 已過時**——那是重跑前跑的，B 組真值已改變，引用前必須重跑。
3. **不得宣稱「7 類交叉驗證」**——YouTube 未設金鑰、線上 0/45，實測上限 5 類。

### 教訓（第五次「以為做好了其實沒有」）

前四次是「沒接上」或「接了也不會動」。這次是下半場：**程式碼 8/02 就全修好了，但線上行為到 8/03 重跑完才真的改變**。中間那段時間 diff 看起來完全正常、測試全過、CLAUDE.md 也寫著「已修復」。**判斷一項修復是否生效，要看資料庫裡的值，不是看 commit。**

---

## 2026-07-28｜三條「做完但沒接上」的線全部接通，並挖出一個會讓天氣應變完全失效的定址 bug

### 背景

依教授 07/22 講評（Benchmark／A-B 對照、Harness、成本、解耦）盤點「今天就能動、不需要再拍板」的程式碼工作，執行四項：天氣應變接真實行程、資料層 A/B benchmark、explore 語意搜尋接前端、#11 signals 缺口查證。收尾時再補做兩項：衝突 UI 接回資料、LLM 截斷防護。

### 主要變更

- **天氣應變頁接上使用者實際建立的行程**（`trip/[id]/weather/page.tsx`、`lib/draft-itinerary.ts`）：寫死的 `DAY2_TIMELINE` 改為 `loadDraft(tripId)`；受影響景點由時間軸動態判定（不再寫死 `PRIMARY_AFFECTED_ID`）；Day tabs 依草稿天數產生並可切換；時間軸依停留時間＋站間交通從 09:00 推算。新增 `applySwapsToDraft()`——接受替換後寫回真實草稿並重算該天交通時間。查不到草稿才退回固定示範站點，並在畫面標示「示範行程」。
- **資料層 A/B benchmark**（新增 `agents/poi-verifier/bench-datalayer.ts`）：同一個 LLM、同一題、同一輸出格式，唯一變因是有沒有餵驗證過的景點資料。三個自動指標（可查證率／室內外事實一致率／附來源率），`run` 與 `report` 兩種模式。首輪實測結果見下方。
- **explore 語意搜尋接前端**：搜尋框從 `p.name.includes()` 前端字串比對改為 400ms debounce 送 `query` 到 `/api/poi/search`（走 hybrid_search RPC）；空查詢維持 list 模式（零 LLM 成本）。
- **衝突／分級理由／部落格佐證 UI 接回資料**（新增 `lib/verification-detail.ts`）：這三項 UI 自從 explore 改讀 API 後一直是空白——資料在 `poi-kb.ts`、頁面在讀 `poi_catalog`，兩邊沒接。改在 **server 端** join（前端 import `POI_KB` 會把 45 筆打進 client bundle），POST／GET 皆接，`/api/plugin/poi/search` 一併受惠。
- **LLM 截斷防護**（`contingency-handler/src/generators/llm-client.ts`）：加 `thinkingConfig.thinkingBudget = 0`、`maxOutputTokens` 800 → 1024。

### 🔴 修掉一個會讓「天氣應變 × 自建行程」永遠失效的定址 bug

`explore/page.tsx` 的 `mapResultToPoi` 用 `r.poi_id`，而 `poi-search.ts` 的 `poi_id: row.id` 是 **poi_catalog 的 UUID 主鍵**，不是 `NCA-001`。這個 id 一路帶進購物車 → `/trip/build` → 行程草稿 → 天氣應變頁，而 `/api/contingency` 與 `data/pois.ts` 都用 `NCA-xxx` 定址——也就是說**在此修復前，用自建行程跑天氣應變一定查無景點**。已改用 `r.source_id`，並把購物車 persist key 升為 `navigator-itinerary-cart-v2`（舊購物車自然失效）。

⚠️ **修復前建立的行程草稿仍存著 UUID，需重建**。天氣應變頁對查不到的站點會顯示「天氣資料待補」，不會靜默略過。

### Benchmark 首輪結果（北海岸 15 筆真值，6 題 × 2 組）

| 組別 | 可查證率 | 室內外事實正確 | 附來源率 |
|---|---|---|---|
| A 裸提示（無 context） | 69%（20/29） | **45%（9/20）** | 100% |
| B 有資料層 | 100%（20/20） | **95%（19/20）** | 100% |

A 組推薦了 8 個資料庫查無的景點（金山財神廟、和平島公園、金瓜石黃金博物館…，後兩者甚至不在北海岸）。

**對外引用時要誠實說明**：B 組 100% 可查證有一部分是 prompt 限定「只能從清單挑」的結果；真正未被 prompt 綁定的硬指標是**室內外事實正確率 45% → 95%**。

題目全部鎖北海岸，因為 45 筆裡只有 15 筆（NCA-*）是真的跑完 LLM 驗證（見 `KNOWN_ISSUES.md` 2026-07-24）。等那 30 筆重跑完，把 `REGION_SCOPE` 打開即可涵蓋三區。

### 過程中發現、尚未處理的問題

1. **`data/pois.ts` 有 27/45 筆名稱與 `poi_catalog` 不同**（ids 45/45 完全對齊）。例：`富貴角燈塔` vs `台灣最北點`、`白沙灣探索館` vs `北海岸遊憩探索館`。原因是驗證流程正規化過名稱、`pois.ts`（手寫來源，非自動產生）沒同步。應變頁已改為一律顯示資料庫的正式名稱繞過，**根因未解，待決定以哪邊為權威來源**。
2. **降級狀態現在直接顯示在 UI 上**：衝突 UI 接通後，30/45 筆的「韌性分級理由」欄位顯示「無法呼叫 LLM，預設 L2」（陽明山 15 ＋ 東北角 15），同 30 筆也沒有 AI 驗證描述。誠實，但 demo 點到北海岸以外就會露出。待決定呈現方式。
3. **部落格佐證混入不相關內容**：90 則佐證有 11 則來自 YouTube，其中出現與景點完全無關的影片（擎天崗的佐證裡有一支勞斯萊斯開箱影片）。youtube-search 驗證器濾過業配，但沒有相關性過濾。
4. **圖片與內容對不上**（擎天崗的主圖是一杯檸檬薑茶）。
5. **`#11 images` 缺口不是接線 bug**：查證後確認 `GooglePlacesRaw`／`OsmRaw`／`BlogPostRaw` 都沒有任何圖片欄位，google-places 驗證器也沒把 Text Search 回傳的 `photos` 映射出來——在呼叫端補 `signals` 傳進去的一樣是 undefined。詳見 `待討論事項_0709.md` #11。

### 驗證方式

- `tsc --noEmit` 乾淨；`next build` 通過（17 條路由）；`eslint src` 6 errors／9 warnings（**比修改前的 7 errors 少一個**，全部是既有的 `react-hooks/set-state-in-effect`）。
- **真實瀏覽器全流程**（Chrome + playwright-core，420×900 手機視窗）：`/explore` 選 4 點 → 購物車 id 確認為 `NCA-xxx` → `/trip/build` 產出兩天行程 → `/trip/{id}/weather` 顯示自己的行程名與站點、無「示範行程」標記 → 開啟建議（EV 分析 75 → 17.6、落差 57.4 > 門檻 20、gemini 敘述反思審查第 1 次通過）→ 全部接受 → 草稿確實被改寫（`NCA-002,005,004` → `NCA-001,003,015`）。
- 衝突 UI 實測：45 筆全部帶回三項細節，32 筆有真實衝突欄位；擎天崗畫面顯示名稱／地址「並存（無法澄清）」、是否營業中「依來源層級澄清」（官網說已停業 vs Google Places 說營業中）。

> 本機備註（非專案性質）：此 repo 若放在 Google Drive 鏡像資料夾下，`next dev` 的 Turbopack 編譯會被同步拖到近乎卡死（Next.js 會印 `Slow filesystem detected`），改用 `next build` + `next start` 可正常驗證。放在一般本機路徑的組員不受影響。

---

## 2026-07-21｜migration 009 已套用確認、Supabase 已恢復

### 確認事項

- **migration 009（`hybrid_search_return_facts`）已套用、Supabase 線上正常**。驗證方式：直接呼叫線上 `hybrid_search_poi_catalog` RPC，回傳欄位含 009 才新增的 `source_id / description / address / lat / lng / category / city / hours / website_url / tags / images`（007 舊版只回 `id / name / metadata / *_rank / *_score`），HTTP 200。
- 先前 CLAUDE.md §9 與本日誌記載的「009 未套用、Supabase 專案暫停中」為過時狀態，已同步更正。

### 仍待處理

- `poi_catalog` 目前仍只有 45 筆，009 新增欄位多為 NULL——schema 與 RPC 就緒，但尚未真的匯入/回填資料（綁 TDX 匯入規模拍板）。
- `/api/contingency` 候選池目前仍為靜態 45 筆 caller_provided，009 已可支援切換到真實 RPC 檢索，待切換。

---

## 2026-07-15～20｜範圍收斂 × 應變層接前端 × 反思迴路補完

### 主要變更（scope-cut-0716 分支起）

- **範圍收斂決策（0716）**：多人規劃（房間／投票／共識收斂／Realtime）整條移出期末範圍，程式碼保留不刪；定位收斂為「可信景點資料庫 ＋ 即時韌性應變」的單人情境。CLAUDE.md 新增 §7.5 凍結模組清單（路徑級標註）。補上依台大 SRS 範本的 NIICC 系統需求書。
- **應變層接通前端**：新增 `src/app/api/contingency/route.ts`，把 contingency-handler 整條管線（偵測 → EV 推理 → RAG 檢索 → 嚴格篩選 → LLM 產出建議）包成 Route Handler；weather 頁去 mock，改打真實 CWA API（未觸發自動 fallback 模擬情境並標記）。
- **應變候選池走 Supabase RPC 真檢索**：候選不再吃靜態資料，list 模式加確定性排序與分頁；修正空 filter 時語意搜尋回 0 筆（`filter_metadata` 不再傳 null）。
- **反思迴路補完**：`narrative-checker.ts` 對 LLM 敘述做封閉集合檢查（幻覺景點／已淘汰景點／格式），不合格理由回填 prompt 重生成（預設 2 次），不收斂退規則保底；`tests/narrative-checker.test.ts`＋`tests/reflection-loop.test.ts` 共 19 assertions 全通過。
- **行程選點主線（FFR13）**：explore 驗證庫加「加入行程」選點，`src/lib/draft-itinerary.ts` 純規則排序（區域分群＋最近鄰＋依時間切天，零 LLM），正式取代舊的投票收斂行程來源。
- **explore 頁接真實資料**：停用「Architect Agent」舊稱，修正 hybrid search RPC 回傳與 ingestion 漏傳欄位。
- 重出競賽版架構圖 PDF（0720，反思迴路已實作版）。

### 規模

- 約 2,400 行變更、跨 31 檔。

---

## 2026-06-26｜TDX 入庫 Pipeline、RAG Reranker 與混合搜尋完成

### 今日變更

**新增功能**

- **TDX 觀光 API 批次入庫**（`ingest-from-tdx.ts`）
  - 支援四種實體：ScenicSpot / Restaurant / Hotel / Activity
  - CLI 旗標：`--type`、`--city`、`--top`、`--dry-run`、`--skip-verify`
  - 三種執行模式：DRY_RUN（零 API）/ SKIP_VERIFY（僅 Gemini enrich）/ 完整驗證
  - TDX → Navigator Schema 映射（Class1→category 11 條規則，22 縣市→region）
  - 新增 `src/tdx-types.ts`（TDX API TypeScript 型別）與 `src/tdx-mapper.ts`（映射函式）

- **RAG Reranker** (`rag-reranker.ts`) 新增 `export` 讓 `demo-scenarios.ts` 可引用
- **TDX 單元測試** (`tests/tdx-pipeline.test.ts`)：88 個 assertions，零 API 呼叫，全通過

**Demo 擴充**

- `demo-scenarios.ts` 新增 Block B（RAG Reranker 應變示範）：
  - **場景 4**：下雨天 Strategy Agent Swap — 室內景點重排（`heavy_rain` + structural_boost）
  - **場景 5**：景點臨時關閉 Strategy Agent Switch — L2/L3 候補池重排（`closure`）
  - 新增 `--only-rag` 旗標，跳過需要外部 API 的 Block A

**文件全面更新**

- `agents/poi-verifier/README.md` 完整重寫（移除「設計中」內容，改為實際可跑功能文件）
- `RUN_CODE_GUIDE.md` 更新至 22 個腳本（原本只有 5 個）
- `agents/ENV_SETUP.md` 補上 `YOUTUBE_API_KEY`、`TDX_CLIENT_ID`、`TDX_CLIENT_SECRET`
- `PROJECT_BRIEF.md`、`README.md` 更新 repo 結構與 demo 場景數

### 現在可以直接跑的完整 Demo 流程

```bash
cd agents/poi-verifier
npm run tdx:ingest:dry                           # 確認 TDX 映射
npm run tdx:ingest:skip-verify -- --type ScenicSpot --top 20
npm run rag:ingest                               # 向量化
npx ts-node demo-scenarios.ts --only-rag         # 快速 RAG demo
npm run demo                                     # 全部五個場景
```

---

## 2026-05-16｜修復 Supabase `poi_catalog` 的「假資料」三個欄位

### 背景

`poi_catalog` 45 筆裡，`tags`、`blog_snippets`、`metadata.reliability_score` 三欄基本都是空或 null。`description` 是真實 LLM 文案沒問題，但代表「AI 旅行社」差異化價值的非通用洞察（限制/旅客建議/天氣注意/人潮/近況）完全沒寫進去。

### 根因追蹤

1. **Gemini 2.5 Flash 預設開 thinking mode**：`extractInsights()` 的 `maxOutputTokens: 512` 被 thinking 吃光（`thoughtsTokenCount: 489`），JSON 輸出截斷在前幾字 → catch 靜默吞錯 → 寫入空陣列或空殼物件。
2. **Verifier 沒實作候選池查詢**：`generateBackupLogic(level, [], ...)` 第二個參數寫死空陣列 → `candidate_pool_tags` 永遠 `[]` → ingestion 直接拿來當 `tags` 也永遠 `[]`。
3. **舊批次 verifier 留下 16 筆 `reliability_score: null`**：cross-validate 邏輯換版後沒重跑。

### 變更

- **`agents/poi-verifier/src/ingestion.ts`**：
  - `extractInsights()` 加 `thinkingConfig: { thinkingBudget: 0 }` 關 Gemini thinking、`maxOutputTokens` 升 1024、catch block 不再靜默，HTTP / parse / finishReason 異常都印到 stderr
  - `tags` 改為從現有資料**規則衍生**（地區/等級名/室內外/天氣敏感度/停留時長/是否需預約），零 LLM 成本
  - `reliability_score` 加 fallback：null → 依 sources 數給 0.35 / 0.5 / 0.6
- **`agents/poi-verifier/ingest-from-results.ts`**：`DELAY_MS` 從 5s 改 11s（控制在 Free Tier 10 RPM 內）
- 新增 `debug-insights.ts`、`ingest-sample.ts`、`ingest-missing-insights.ts` 三個輔助腳本
- 新增 `agents/poi-verifier/KNOWN_ISSUES.md` 追蹤未解問題

### 結果

| 欄位 | 修前 | 修後 |
|---|---|---|
| tags 空陣列 | 44 / 45 | **0 / 45** ✅ |
| reliability_score null | 16 / 45 | **0 / 45** ✅ |
| blog_snippets 真實內容 | 0 / 45 | **15 / 45** ⚠️（Gemini RPD 用完，剩 30 筆待明早重跑） |

### 下一步

1. 明早 8 點 Gemini quota 重置後跑 `npx ts-node ingest-missing-insights.ts` 補剩 30 筆洞察
2. 評估是否升 Gemini Tier 1（< NT$1/輪重跑全量），長期 demo 比較穩
3. 詳見 [agents/poi-verifier/KNOWN_ISSUES.md](agents/poi-verifier/KNOWN_ISSUES.md)

---

## 2026-05-03｜poi-verifier 設計對齊與 README 重寫

### 今日變更

- 確認 `poi-verifier` 設計已經納入：部落格取證、最新部落格日期、來源分級、時間衰減、多準則排序、嚴格過濾。 
- 檢視並比對 `agents/contingency-handler` 設計，確保應變 Agent 已對齊教授建議中的 EV 公式、嚴格備案篩選與 Backup Plan 產出。 
- 重寫 `agents/poi-verifier/README.md`，讓 POI Agent 文件更清楚地呈現目前目標、架構與 API。 
- 更新 `DEVLOG.md` 與相關文檔，作為設計驗證與下一步開發的紀錄。

### 下一步

1. 優先實作 `agents/poi-verifier/src/` 核心模組：types、validators、enrichers、agent 邏輯。 
2. 進行 `agents/contingency-handler/` 應變 Agent 端到端設計，針對雨天與景點臨時關閉進行情境演練。 
3. 整理 `references/` 中的教授回饋與 slides，將「來源分級 + 時效標記 + 嚴格檢查」轉為實作規則。 
4. 準備可展示的 Demo case：大雨改室內備案、景點關閉即時替換。

---

## 2026-04-30｜項目結構調整 & POI 驗證 Agent 開發啟動

### 背景

- UI 設計原型已完成驗證 → 轉向開發 POI 驗證 Agent 專題
- 需要清晰的項目結構以支持平行開發：主應用、原型、Agent

### 重大決策

| 決策項目 | 決定                                                                        | 理由                                     |
| -------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| 項目結構 | `src/` (主應用) + `agents/poi-verifier/` (Agent) + `prototypes/` (設計參考) | 支持獨立開發、測試、部署                 |
| 開發焦點 | POI 驗證 Agent 優先                                                         | 解決「資訊不可信」痛點，為主應用奠定基礎 |
| 文件更新 | CLAUDE.md section 4 + README.md + DEVLOG                                    | 團隊統一認識                             |

### 新增/修改檔案

#### 文件

- `CLAUDE.md` — 更新 section 4（檔案地圖）& section 9（當前進度）
- `README.md` — 替換為 Navigator 專案概述（TW 繁體、emoji icon、結構圖）
- `DEVLOG.md` — 添加本條目

#### 結構

```
prototypes/
├── README.md                 # 原型集合說明
└── ui-demo/
    └── README.md            # UI 設計參考說明

agents/
├── poi-verifier/
│   ├── README.md            # POI Agent 詳細文件
│   ├── src/                 # Agent 實作（待開發）
│   └── tests/               # 測試（待開發）
```

### 下一步（待做）

1. **POI 驗證 Agent 實作**（優先級：高）
   - [ ] `agents/poi-verifier/src/types.ts` — 類型定義
   - [ ] `agents/poi-verifier/src/validators/` — Google Places + OSM 交叉驗證
   - [ ] `agents/poi-verifier/src/enrichers/` — L0-L3 自動分級、備案邏輯
   - [ ] `agents/poi-verifier/src/agent.ts` — Agent 主邏輯
   - [ ] Route Handlers — `/api/poi/verify` 等

2. **主應用集成**（優先級：中）
   - [ ] POI 驗證 API 集成
   - [ ] 45 筆 demo POI 數據導入 Supabase

3. **成本優化**（優先級：中）
   - [ ] Token 預算控制（目標：< NT$5/次）
   - [ ] Funnel retrieval 實作

---

### 背景與設計參考

- 參考 **MindTrip**（chat-first、地圖情緒感、極簡奢華）與 **WanderNest 風格截圖**（深綠主題、Sidebar 佈局、時間軸/地圖/列表三 Tab）
- 使用 Claude Design 產出 `Navigator-standalone.html`（7.4MB，深綠主題），作為設計稿參考（已加入 `.gitignore`）

### 重大決策

| 決策項目 | 決定                                     | 理由                                |
| -------- | ---------------------------------------- | ----------------------------------- |
| 主色系   | 深森林綠 `#1B4332` / `#52B788`           | 與設計稿一致，旅遊感強              |
| 導覽方式 | 桌面左側 Sidebar + 手機底部 Tab          | 手機與網站並重（非純 mobile-first） |
| Redis    | 不安裝                                   | Supabase Realtime 已能處理即時同步  |
| PWA      | `@ducanh2912/next-pwa`（dev 停用）       | 相容 Next.js 16 App Router          |
| 拖拉排序 | `dnd-kit`（core + sortable + utilities） | 支援觸控 TouchSensor，行程拖拉需要  |

### 新增套件

```
@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
@ducanh2912/next-pwa
```

### 新增 / 修改檔案

#### 設計系統

- `src/app/globals.css` — 色彩 token 全換為森林綠系：
  - `--primary`: `oklch(0.27 0.075 155)` → `#1B4332`
  - `--accent`: `oklch(0.68 0.115 152)` → `#52B788`
  - `--background`: `oklch(0.985 0.004 90)` → `#faf9f5` 暖白
  - Sidebar token 改為深綠背景 + 白色文字

#### PWA 設定

- `next.config.ts` — 加入 `withPWA`、`turbopack: {}`（解決 Next.js 16 Turbopack 衝突）、`images.remotePatterns`（picsum.photos 白名單）
- `public/manifest.json` — PWA 安裝設定（主題色 `#1B4332`）
- `src/app/layout.tsx` — 加入 `manifest`、`appleWebApp` metadata

#### 版面元件

- `src/components/layout/AppSidebar.tsx` — 桌面左側深綠 Sidebar，含 Logo、5 個導覽項、使用者資訊
- `src/components/layout/BottomNav.tsx` — 手機底部 Tab Bar（5 項）

#### 認證後 App 路由群組 `(app)`

- `src/app/(app)/layout.tsx` — Sidebar + BottomNav 包裝 layout
- `src/app/(app)/dashboard/page.tsx` — 儀表板：4 個統計卡 + 行程卡片格 + 空狀態插圖
- `src/app/(app)/trip/[id]/page.tsx` — 行程詳細：時間軸 / 地圖 / 景點列表 三 Tab，含 dnd-kit 拖拉手把、站間交通時間
- `src/app/(app)/ai-plan/page.tsx` — AI 規劃三步驟表單：目的地 → 興趣標籤 → 預算/風格
- `src/app/(app)/explore/page.tsx` — 佔位頁
- `src/app/(app)/collection/page.tsx` — 佔位頁
- `src/app/(app)/settings/page.tsx` — 佔位頁

### Bug 修復

| 錯誤                         | 原因                           | 修復                                 |
| ---------------------------- | ------------------------------ | ------------------------------------ |
| `next/image` hostname error  | `picsum.photos` 未白名單       | `next.config.ts` 加 `remotePatterns` |
| Turbopack webpack conflict   | `next-pwa` 注入 webpack config | `next.config.ts` 加 `turbopack: {}`  |
| TypeScript `React.ReactNode` | 未 import React namespace      | 改用 `import { type ReactNode }`     |

### 目前路由結構

```
/                    → Landing page（藍橙主題，待統一）
/dashboard           → 我的行程（主頁）
/trip/[id]           → 行程詳細頁
/ai-plan             → AI 規劃
/explore             → 探索景點（佔位）
/collection          → 收藏清單（佔位）
/settings            → 設定（佔位）
/group/new           → 建立行程（舊流程，待整合）
/group/[id]/join     → 加入群組（舊流程，待整合）
```

---

## 2026-04-30｜教授回饋整理與方向調整 (第一版)

### 核心回饋重點

教授將系統定位為**「AI 時代的旅行社」**，核心價值在於資訊**可信度**與**應變能力**，而非技術複雜度。主要強調：

1. **從架構轉向實作**：停止堆砌新功能，改為驗證 POI 驗證 Agent 與應變邏輯的實際可行性
2. **深入 2-3 個模組**：教授明確建議專注於「景點驗證」與「下雨應變」，避免包山包海
3. **AI 邏輯必須準確**：旅遊系統失誤一次（如帶用戶去倒閉餐廳）就會喪失信任，精確性優於複雜度
4. **簡化 OR 模型**：避免過度複雜的成本計算；重點應放在「時間串接」與「多準則決策」

### 下週實作優先順序（Prof. 建議）

#### 第一階段：POI 驗證實作 (必做)
- 針對一個示範區（如大溪）實際驗證 50 個景點
- 執行 Agent 交叉驗證邏輯（Google Places + OSM + 部落格抓取）
- 產出 JSON 驗證報告，標註「官方確認」vs「部落客推薦」
- 確認 Token 成本 < NT$5/次查詢（Funnel retrieval 優化）

#### 第二階段：應變情境演練 (核心差異化)
- 實作 2 個極端應變案例：
  1. **下大雨場景**：自動推薦「路線上」的室內替代景點（需地理相近性檢查）
  2. **景點臨時關閉**：從備案池篩選，避免導向更糞的結果
- 實現「嚴格檢查機制」：人潮暴增、開店時間不多、無最新資訊 → 直接刪除
- 測試 Context Engineering：給 AI 充分的背景資訊（位置、人數、天氣、原景點）再生成建議

#### 第三階段：Demo 原型展示
- 不講技術細節，直接展示案例：
  > 「原本規劃去 A 景點，突然下大雨，系統自動推播 B 咖啡廳（室內、距離 500m），用戶一鍵確認更換。」
- 修正 OR 模型公式，確保權重與準則有明確商業邏輯支持

### 信度架構確認（已滿足）

✅ 五層可信度架構已在架構書中定義：
- 來源分級（官方 > 半官方 > 部落格）
- 時間衰減自動標記
- 交叉比對提升信度
- 群眾回報驗證
- 透明呈現（✅官方確認 / ⚡近期更新 / ⚠建議確認）

### 本週調整方向

**不做**：
- 新增功能頁面（Explore、Collection 先留佔位）
- Landing page 色系統一（不是核心)
- PWA icon 製作（Dev 階段可暫停）

**改做**：
- POI 驗證 Agent 端到端實作（包含真實 API 呼叫測試）
- 應變 SOP 邏輯驗證（嚴格檢查機制 + 排序演算法）
- Prompt 範本設計（Context Engineering）

---

## 已完成的核心模組（截至 2026-06-26）

| 模組 | 狀態 |
|------|------|
| `src/validators/` — Google Places + OSM + Blog 三源驗證 | ✅ |
| `src/enrichers/` — L0-L3 自動分級 + 備案邏輯 | ✅ |
| `src/agent.ts` — 端到端驗證 Pipeline | ✅ |
| `src/ingestion.ts` — 驗證結果寫入 Supabase | ✅ |
| RAG 向量化入庫（pgvector） | ✅ |
| Hybrid Search（bigram + pgvector RRF） | ✅ |
| RAG Reranker（structural boost + Gemini 交叉評分） | ✅ |
| TDX 觀光 API 批次入庫 Pipeline | ✅ |
| Demo 五個場景（POI 驗證 ×3 + RAG 應變 ×2） | ✅ |
| 批次驗證 45 筆 POI（真實 API） | ✅ |

---

## 2026-04-19｜專案初始化（前一個 commit）

- Next.js 16.2.4 + React 19 + TypeScript scaffold
- Supabase schema 設計
- TailwindCSS v4 + shadcn 設計系統（藍橙主題）
- Landing page 完成
- `/group/new`、`/group/[id]/join` 頁面完成

---

## 技術選型快查

| 層           | 技術                                         | 版本      | 備註                             |
| ------------ | -------------------------------------------- | --------- | -------------------------------- |
| Framework    | Next.js App Router                           | 16.2.4    | Turbopack 預設啟用               |
| UI Runtime   | React                                        | 19.2.4    |                                  |
| Styling      | TailwindCSS                                  | v4        | `@theme inline` 語法             |
| Components   | shadcn (base-nova)                           | 4.3.0     |                                  |
| State        | Zustand                                      | v5        | client UI state                  |
| Server State | TanStack Query                               | v5        |                                  |
| DB / Auth    | Supabase                                     | —         | PostgreSQL + pgvector + Realtime |
| Map          | Mapbox GL JS + react-map-gl                  | 3.x / 8.x | 需 `NEXT_PUBLIC_MAPBOX_TOKEN`    |
| Animation    | Framer Motion                                | v12       |                                  |
| Drag & Drop  | dnd-kit                                      | latest    | core + sortable + utilities      |
| PWA          | @ducanh2912/next-pwa                         | latest    | dev 停用，prod 啟用              |
| AI           | Gemini 1.5 Flash（主）/ Claude Haiku（備援） | —         | 走 Route Handler，不直接打前端   |
