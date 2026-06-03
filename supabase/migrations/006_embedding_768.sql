-- ============================================================
-- 006_embedding_768.sql
-- 將 poi_catalog.embedding 從 vector(3072) 改回 vector(768)
--
-- 背景：
--   005 為了 gemini-embedding-001 預設輸出把欄位升到 3072，但造成兩個問題：
--     1. ivfflat / hnsw 上限 2000 維，3072 無法建 index（只能 sequential scan）。
--     2. query 端（contingency-handler/poi-catalog-client.ts、各腳本）一律用
--        outputDimensionality:768，與 3072 欄位維度不符 → match_poi_catalog 會報
--        「different vector dimensions 768 and 3072」。
--   解法：全線統一 768（與主管線 src/ingestion.ts 一致），順便補回 index。
--
-- 影響：
--   - poi_catalog.embedding 全部清空（NULL），需重跑：
--       npm run rag:build   （basic-rag.ts，現在輸出 768 維）
--       npm run rag:ingest  （ingest-embeddings.ts）
--   - basic-rag.ts / supabase-rag.test.ts 的 embed 已加 outputDimensionality:768
--   - pois 表不動（user-added POI，已是 768）
-- ============================================================

-- Step 1：移除任何殘留 index（有 index 的欄位不能直接 ALTER TYPE）
DO $$
DECLARE
  idx_name text;
BEGIN
  FOR idx_name IN
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'poi_catalog'
      AND (indexdef ILIKE '%ivfflat%' OR indexdef ILIKE '%hnsw%')
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx_name);
  END LOOP;
END $$;

-- Step 2：欄位維度 3072 → 768，舊向量清空（不同維度向量不可混用）
ALTER TABLE poi_catalog
  ALTER COLUMN embedding TYPE vector(768)
  USING NULL::vector(768);

-- Step 3：重建 index（768 < 2000，HNSW 可用；cosine 距離對應 <=> 運算子）
CREATE INDEX poi_catalog_embedding_idx
  ON poi_catalog USING hnsw (embedding vector_cosine_ops);

-- Step 4：更新 match_poi_catalog RPC，query_embedding 改回 768 維
CREATE OR REPLACE FUNCTION match_poi_catalog (
  query_embedding  vector(768),
  match_threshold  float,
  match_count      int,
  filter_metadata  jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id          uuid,
  name        text,
  metadata    jsonb,
  similarity  float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    name,
    metadata,
    1 - (embedding <=> query_embedding) AS similarity
  FROM poi_catalog
  WHERE embedding IS NOT NULL
    AND metadata @> filter_metadata
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
