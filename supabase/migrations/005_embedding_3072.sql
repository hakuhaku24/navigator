-- ============================================================
-- 005_embedding_3072.sql
-- 將 poi_catalog.embedding 從 vector(768) 升級至 vector(3072)
--
-- 背景：
--   003_alter_embedding_dim.sql 為了配合 Google text-embedding-004（768 維）
--   將維度從 1536 改為 768，但 text-embedding-004 已下架。
--   現在改用 gemini-embedding-001（3072 維），需再次調整欄位與 index。
--
-- 影響：
--   - poi_catalog.embedding 欄位全部清空（設為 NULL），需重新執行 ingest
--   - match_poi_catalog RPC 的 query_embedding 參數型別一起更新
--   - pois 表不動（user-added POI，與 knowledge base 獨立）
-- ============================================================

-- Step 1：移除舊 ivfflat index（有 index 的欄位不能直接 ALTER TYPE）
DROP INDEX IF EXISTS poi_catalog_embedding_idx;

-- 以防命名慣例不同，補一個 generic drop
DO $$
DECLARE
  idx_name text;
BEGIN
  SELECT indexname INTO idx_name
  FROM pg_indexes
  WHERE tablename = 'poi_catalog'
    AND indexdef ILIKE '%ivfflat%';
  IF idx_name IS NOT NULL THEN
    EXECUTE format('DROP INDEX IF EXISTS %I', idx_name);
  END IF;
END $$;

-- Step 2：欄位維度 768 → 3072，舊向量清空（text-embedding-004 向量不可與 gemini-embedding-001 混用）
ALTER TABLE poi_catalog
  ALTER COLUMN embedding TYPE vector(3072)
  USING NULL::vector(3072);

-- Step 3：跳過建 index（ivfflat 上限 2000 維，3072 維不支援；45 筆用 sequential scan 即可）

-- Step 4：更新 match_poi_catalog RPC，接受新維度的 query_embedding
CREATE OR REPLACE FUNCTION match_poi_catalog (
  query_embedding  vector(3072),
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
