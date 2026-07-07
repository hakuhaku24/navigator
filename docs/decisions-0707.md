# 決策記錄 — 2026-07-07

> 依 `待討論事項_0705.md` 的待拍板項目做成決策。決策依據：教授 0701 回饋、`agents/poi-verifier/docs/data-layer-research.md`、`ARCHITECTURE.md` 現況盤點。
> 有異議請直接改本檔並在群組喊一聲，不必等會議。

---

## 決策 1：Demo 主軸 = 天氣應變 Swap（對應 0705 #3／建議三＋四）

**主打「應變排程能力」，POI 可信度作為支撐論述。**

- 8 步 Demo 流程定位為情境故事背景，深度展示鎖定 **Step 7（天氣應變 Swap）**。
- 理由：
  1. 教授 0701 已明確肯定 Alternative Route 方向，是最不需要再說服的路線。
  2. 可信度面（多來源衝突呈現 + 信度分數）已於 0705 完成前端，可直接當「應變建議為什麼可信」的支撐，不必單獨主打。
  3. Swap 路徑會走完整條「驗證 → poi_catalog → 應變 → UI」骨幹，一個 demo 同時回應「各模組各做各的」疑慮。
- 對外差異化說法（回應建議三的競品比較）：TripAdvisor / Google Places / MindTrip 等做的是「推薦與聚合」；**沒有一家做「行程進行中、以 L0–L3 錨點分級為約束的即時備案替換」**。我們的獨特性 = 驗證過的知識庫 × 錨點分級 × 事件觸發應變，三者缺一不可。競品細查表可後補，不阻塞開發。

## 決策 2：LLM×RAG 前端整合走 Route Handler + 本地向量檔（對應 0705 #4／建議二）

- 新增 `POST /api/poi/search`：query embedding（RETRIEVAL_QUERY）→ hybrid search（bigram + 向量 + RRF）→ reranker（規則加權 + Gemini 評分）。
- **檢索資料源第一版用本地向量檔**（`src/data/poi-embeddings.json`，自 `agents/poi-verifier/results/poi-embeddings.json` 複製）：Supabase 恢復前 demo 不被卡、現場斷網也能跑。以 `POI_SEARCH_BACKEND=local|supabase` 環境變數保留切換點，恢復後接 `hybrid_search_poi_catalog` RPC。
- 回應格式**必含** `sources`、`reliability_score`、`llm_reason`——教授問「使用者端 LLM 有沒有讀到驗證資料」時，答案直接顯示在畫面上。
- GEMINI_API_KEY 只存在 server 端（CLAUDE.md 慣例：前端不直呼 LLM API）。

## 決策 3：放棄 LLaMA 地端部署（對應 0705 #6）

- 原始動機是「讓 LLM 讀到我們的資料」——決策 2 的 RAG 注入已解決同一問題，成本低一個數量級。
- 地端部署需要 GPU 資源與維運，對畢業專題 demo 的邊際效益為負。
- 若期末後要研究，方向是「離線 demo 備援」而非主流程。

## 決策 4：KKday／Klook 抽成延後至期末後（對應 0705 #6）

- 商業模式驗證不在 MVP 範圍（CLAUDE.md §7 明列商家串接 out of scope）。
- 期末報告可寫進「未來營收模式」一節即可，不排開發時程。

## 決策 5：整合流程圖以 `ARCHITECTURE.md` 結案（對應 0705 #9）

- 「景點驗證 → 資料庫 → 應變系統 → 使用者畫面」Mermaid 圖已完成，含節點對應檔案表與誠實版實作狀態，隨本次一併 commit。

## 施力點說法（對應 0705 #5，供跟教授溝通用）

> 「我們的施力點是**可信景點資料庫 ＋ 應變系統**。其他功能（landing page、PWA、社交）是刻意暫停，不是沒做完。驗證 Agent 是知識庫的生產者、應變 Agent 是消費者，兩者靠同一個 `poi_catalog` 串起來；本次新增的 `/api/poi/search` 與 `/api/contingency` 把這條骨幹接到使用者畫面上。」

## 未決事項（真正需要組員的）

- **Supabase 專案重建**（0705 #1/#2/#8）：需有後台權限者建新專案。重建 schema 已備好於 `supabase/rebuild/`，恢復後照 README 一鍵套用，再跑 TDX 大量匯入取成功率數字。
