-- ============================================================
-- 010_verification_provenance.sql
--
-- 讓「這筆資料是怎麼來的、可不可信」變成 schema 的一部分，而不是散在 JSON 檔裡。
--
-- 觸發事件（2026-08-02 全專案掃描）：線上 poi_catalog 45 筆中有 41 筆
-- metadata.is_indoor = false，其中至少 10 筆明顯錯誤（國立海洋科技博物館、
-- 福容大飯店、阿妹茶樓、草山行館…全是室內場所）。根因是 2026-05-06 那批
-- ingest 時 Gemini 免費配額（RPD 20）在第 15 筆左右耗盡，enrich() 走降級分支，
-- 而 agent.ts 用 `?? false` / `?? 'medium'` 把 null 補成看似合理的假值，
-- 一路寫進 metadata、tags 與 embedding 文字。
--
-- 後果：應變管線下雨路徑是 `filter_metadata @> {"is_indoor": true}` 的硬性篩選，
-- 而僅存的 4 筆室內景點全在北海岸 → 陽明山與東北角下雨時候選池為 0 筆。
--
-- 程式碼側已修（agent.ts / canonical-poi.ts / ingestion.ts 保留 null；
-- batch-verify.ts 連續 3 筆降級即中止且不入庫）。本 migration 補 schema 側：
-- 讓「未驗證」這件事在資料庫裡看得見、查得到、篩得掉。
--
-- 全部為附加式變更（ADD COLUMN IF NOT EXISTS），不動既有資料。
-- 唯一的破壞性操作是 RPC 的 DROP + CREATE——Postgres 不允許 CREATE OR REPLACE
-- 改變 RETURNS TABLE 形狀，且該函式是純讀取路徑，不碰資料。
-- ============================================================

-- ── 1. blog_snippets：補上 schema drift ────────────────────────────────────
--
-- 這個欄位**存在於線上資料庫**（ingestion.ts:330 一直在寫、
-- ingest-missing-insights.ts 一直在讀），但從未出現在任何一份 migration。
-- 009 的註解已標記「其存在於實際 schema 中未經確認」而刻意不放進 SELECT。
--
-- 後果是整條管線變成死路：extractInsights() 花 LLM 成本萃取出
-- constraints / visitor_tips / weather_notes / crowd_notes / recent_status
-- 五個維度（45 筆中 34 筆有真實內容），寫進這個欄位之後就再也沒被讀出來過——
-- RPC 不 SELECT 它、SearchResult 型別沒有它、前端自然也顯示不了。
--
-- IF NOT EXISTS 讓這行在「已有此欄位的線上庫」與「從 migration 重建的新環境」
-- 都能正確執行。這才是重點：讓環境可以從 migrations 重建。
ALTER TABLE poi_catalog
  ADD COLUMN IF NOT EXISTS blog_snippets jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN poi_catalog.blog_snippets IS
  'extractInsights() 從部落格萃取的非通用旅遊情報：constraints / visitor_tips / weather_notes / crowd_notes / recent_status。Google Maps 不會提供的體感資訊。';


-- ── 2. verification_tier：資料可信度分層 ───────────────────────────────────
--
-- 為什麼一定要有：TDX 批次匯入的景點只有政府單一來源、沒有經過任何交叉驗證。
-- 若匯入數百上千筆後與既有的交叉驗證資料混在同一張表、同一個 API 回應、
-- 同一個 UI，就無法回答「這 N 筆裡哪些是真的驗過的」——而「可信賴景點資料
-- 服務」正是本專案對外的核心主張。混在一起賣會直接毀掉這個主張。
--
-- 分層後反而能誠實表述：「N 筆景點，其中 M 筆通過完整交叉驗證」。
--
-- NULL ＝ 尚未判定（2026-08-02 之前入庫的資料都是 NULL，重跑 ingestion 後才會有值）。
-- 刻意不設 DEFAULT：預設值會讓舊資料看起來像被分過層，重蹈 is_indoor 的覆轍。
ALTER TABLE poi_catalog
  ADD COLUMN IF NOT EXISTS verification_tier text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'poi_catalog_verification_tier_check'
  ) THEN
    ALTER TABLE poi_catalog
      ADD CONSTRAINT poi_catalog_verification_tier_check
      CHECK (verification_tier IS NULL OR verification_tier IN (
        'unverified',  -- LLM 加值失敗：level 是預設值、is_indoor 為 null，非判斷結果
        'tier_0',      -- 單一來源匯入（TDX／政府開放資料），未經交叉驗證
        'tier_1',      -- 兩個以上獨立來源交叉驗證通過
        'tier_2'       -- 含官方網站或政府來源，且欄位衝突已裁決
      ));
  END IF;
END $$;

COMMENT ON COLUMN poi_catalog.verification_tier IS
  '資料可信度分層。NULL=未判定（2026-08-02 前入庫）。unverified=LLM 加值失敗，欄位為預設值不可信。tier_0=單一來源未交叉驗證。tier_1=多來源交叉驗證。tier_2=含官方來源且衝突已裁決。';

CREATE INDEX IF NOT EXISTS poi_catalog_verification_tier_idx
  ON poi_catalog (verification_tier);


-- ── 3. conflict_analysis / level_reasoning：把驗證證據持久化 ───────────────
--
-- 兩者目前都由 src/lib/verification-detail.ts 在 server 端從靜態的
-- src/data/poi-kb.ts join 出來（2026-07-28 的過渡方案），所以**只有既有 45 筆
-- 查得到**；TDX 新匯入的景點這兩塊 UI 會是空的。PLUGIN_API.md:65 已標註此限制。
--
-- conflict_analysis 是本專案最有說服力的資產之一——它記錄了哪個欄位有幾個來源
-- 說法不同、系統採用哪個、依什麼裁決（來源層級／時效／並存）。例如神秘海岸的
-- 地址：TDX 說石門區、Google 說金山區，標記為 coexist 攤開而非藏起來。
-- 這是單一來源永遠給不出的東西，不該只活在一份靜態 TS 檔裡。
ALTER TABLE poi_catalog
  ADD COLUMN IF NOT EXISTS conflict_analysis jsonb;

COMMENT ON COLUMN poi_catalog.conflict_analysis IS
  '多來源欄位衝突分析（official_name / address / hours / is_open）：各來源的值、層級、信心度、以及裁決方法（single_source / unanimous / clarified_by_tier / clarified_by_recency / coexist）。';

ALTER TABLE poi_catalog
  ADD COLUMN IF NOT EXISTS level_reasoning text;

COMMENT ON COLUMN poi_catalog.level_reasoning IS
  'L0–L3 韌性分級的判斷理由。若 verification_tier = unverified，此欄位可能是「無法呼叫 LLM，預設 L2」之類的降級訊息，不是真實判斷。';


-- ── 4. 更新 hybrid_search RPC，把新欄位一併回傳 ────────────────────────────
--
-- 009 因為無法確認 blog_snippets 是否存在而刻意省略；本 migration 已在上面
-- 用 ADD COLUMN IF NOT EXISTS 確保它存在，所以現在可以安全地 SELECT。
--
-- 檢索邏輯（vector/keyword 雙臂、RRF 融合、coalesce 防護）與 009 完全相同，
-- 只擴充最後的 join-back SELECT 與 RETURNS TABLE。
DROP FUNCTION IF EXISTS hybrid_search_poi_catalog(text, vector(768), float, int, int, float, jsonb);

CREATE FUNCTION hybrid_search_poi_catalog(
  query_text       text,
  query_embedding  vector(768),
  match_threshold  float   DEFAULT 0.3,
  rrf_k            int     DEFAULT 60,
  match_count      int     DEFAULT 10,
  alpha            float   DEFAULT 0.5,
  filter_metadata  jsonb   DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  id                 uuid,
  source_id          text,
  name               text,
  description        text,
  address            text,
  lat                double precision,
  lng                double precision,
  category           text,
  city               text,
  hours              text,
  website_url        text,
  tags               text[],
  images             text[],
  metadata           jsonb,
  blog_snippets      jsonb,
  verification_tier  text,
  conflict_analysis  jsonb,
  level_reasoning    text,
  vector_rank        int,
  keyword_rank       int,
  hybrid_score       float,
  vector_score       float,
  keyword_score      float
)
LANGUAGE sql STABLE AS $$

WITH

  -- ── Arm 1: Vector Search（與 007/009 相同）─────────────────────────────────
  vector_results AS (
    SELECT
      pc.id,
      ROW_NUMBER() OVER (ORDER BY pc.embedding <=> query_embedding)  AS rank,
      1 - (pc.embedding <=> query_embedding)                          AS score
    FROM poi_catalog pc
    WHERE pc.embedding IS NOT NULL
      AND pc.metadata @> coalesce(filter_metadata, '{}'::jsonb)
      AND 1 - (pc.embedding <=> query_embedding) >= match_threshold
    ORDER BY pc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),

  -- ── Arm 2: Keyword Search（與 007/009 相同）────────────────────────────────
  keyword_results AS (
    SELECT
      pc.id,
      ROW_NUMBER() OVER (
        ORDER BY (
          similarity(pc.name, query_text) * 2.0 +
          similarity(coalesce(pc.description, ''), query_text)
        ) DESC
      ) AS rank,
      (
        similarity(pc.name, query_text) * 2.0 +
        similarity(coalesce(pc.description, ''), query_text)
      ) / 3.0 AS score
    FROM poi_catalog pc
    WHERE pc.metadata @> coalesce(filter_metadata, '{}'::jsonb)
      AND (
        pc.name        % query_text  OR
        pc.description % query_text  OR
        pc.search_vector @@ plainto_tsquery('simple', query_text)
      )
    LIMIT match_count * 2
  ),

  all_candidates AS (
    SELECT id FROM vector_results
    UNION
    SELECT id FROM keyword_results
  ),

  -- ── RRF Fusion（與 007/009 相同）───────────────────────────────────────────
  rrf AS (
    SELECT
      ac.id,
      vr.rank                           AS v_rank,
      kr.rank                           AS k_rank,
      coalesce(vr.score, 0.0)           AS v_score,
      coalesce(kr.score, 0.0)           AS k_score,
      (
        alpha       * (1.0 / (rrf_k + coalesce(vr.rank, match_count * 2 + 1))) +
        (1.0 - alpha) * (1.0 / (rrf_k + coalesce(kr.rank, match_count * 2 + 1)))
      ) AS hybrid
    FROM all_candidates ac
    LEFT JOIN vector_results  vr ON vr.id = ac.id
    LEFT JOIN keyword_results kr ON kr.id = ac.id
  )

-- ── Final: join back 一次取顯示欄位（009 起）＋ 本次新增四欄 ────────────────
SELECT
  pc.id,
  pc.source_id,
  pc.name,
  pc.description,
  pc.address,
  pc.lat,
  pc.lng,
  pc.category,
  pc.city,
  pc.hours,
  pc.website_url,
  pc.tags,
  pc.images,
  pc.metadata,
  pc.blog_snippets,
  pc.verification_tier,
  pc.conflict_analysis,
  pc.level_reasoning,
  rrf.v_rank::int                  AS vector_rank,
  rrf.k_rank::int                  AS keyword_rank,
  round(rrf.hybrid::numeric, 6)    AS hybrid_score,
  round(rrf.v_score::numeric, 4)   AS vector_score,
  round(rrf.k_score::numeric, 4)   AS keyword_score
FROM rrf
JOIN poi_catalog pc ON pc.id = rrf.id
ORDER BY rrf.hybrid DESC
LIMIT match_count;

$$;
