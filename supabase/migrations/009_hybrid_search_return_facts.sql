-- ============================================================
-- 009_hybrid_search_return_facts.sql
--
-- Fixes a return-type mismatch between hybrid_search_poi_catalog() (007) and
-- src/lib/poi-search.ts: the RPC only ever returned
--   id, name, metadata, vector_rank, keyword_rank, hybrid_score, vector_score, keyword_score
-- but poi-search.ts has been reading row.source_id / row.description / row.address /
-- row.lat / row.lng / row.category / row.city / row.hours / row.website_url from the
-- result as if they existed — they were always `undefined` at runtime. Migration 008's
-- comment ("不影響既有資料/RPC") was accurate about the table, but the RPC was never
-- updated to expose the columns it added.
--
-- Fix: after RRF ranks the candidate ids, join back to poi_catalog once for every
-- display column the frontend needs (facts + tags + images), instead of threading
-- them through every CTE. Retrieval logic (vector/keyword arms, RRF fusion) is
-- unchanged except one defensive fix: `metadata @> filter_metadata` is now
-- `metadata @> coalesce(filter_metadata, '{}'::jsonb)` — 007 would return 0 rows
-- from BOTH arms whenever the caller passed filter_metadata as SQL NULL
-- (`x @> NULL` is NULL, not true), which is exactly what poi-search.ts did when
-- no filter was set. The JS side now also sends {} instead of null; this coalesce
-- protects any other caller.
--
-- Deliberately NOT included: blog_snippets — not defined in any migration file, so
-- its existence in the live schema is unconfirmed. Adding an unknown column to the
-- SELECT would fail the whole function creation, not just that one field.
--
-- Postgres cannot CREATE OR REPLACE a function with a different RETURNS TABLE shape,
-- so this must DROP + CREATE (function only — no table/data touched, pure read path).
-- ============================================================

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
  id            uuid,
  source_id     text,
  name          text,
  description   text,
  address       text,
  lat           double precision,
  lng           double precision,
  category      text,
  city          text,
  hours         text,
  website_url   text,
  tags          text[],
  images        text[],
  metadata      jsonb,
  vector_rank   int,
  keyword_rank  int,
  hybrid_score  float,
  vector_score  float,
  keyword_score float
)
LANGUAGE sql STABLE AS $$

WITH

  -- ── Arm 1: Vector Search (unchanged from 007) ──────────────────────────────
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

  -- ── Arm 2: Keyword Search (unchanged from 007) ─────────────────────────────
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

  -- ── RRF Fusion (unchanged from 007) ────────────────────────────────────────
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

-- ── Final: join back once for display columns (new in 009) ──────────────────
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
