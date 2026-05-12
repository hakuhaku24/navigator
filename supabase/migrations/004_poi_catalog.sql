-- ============================================================
-- poi_catalog：全域景點知識庫
-- 由 POI 驗證 Agent 維護，所有 travel_group 共用
-- 不屬於任何特定群組（沒有 group_id）
-- ============================================================
CREATE TABLE poi_catalog (
  id           UUID PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  address      TEXT,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  tags         TEXT[]    DEFAULT '{}',
  embedding    VECTOR(768),
  metadata     JSONB     DEFAULT '{}',
  source_id    TEXT      UNIQUE,   -- 原始 ID，如 "YM-001"
  verified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON poi_catalog USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON poi_catalog USING gin (metadata);

CREATE TRIGGER trg_poi_catalog_updated_at
  BEFORE UPDATE ON poi_catalog
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 所有人可讀（公共知識庫）
ALTER TABLE poi_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poi_catalog_select_all" ON poi_catalog FOR SELECT USING (true);

-- ============================================================
-- 把 pois 表裡的 45 筆驗證資料搬到 poi_catalog
-- ============================================================
INSERT INTO poi_catalog (
  id, name, description, address,
  lat, lng, tags, embedding, metadata,
  source_id, verified_at, created_at, updated_at
)
SELECT
  id, name, description, address,
  lat, lng, tags, embedding, metadata,
  metadata->>'source_id',
  created_at, created_at, updated_at
FROM pois
WHERE metadata->>'source_id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- match_poi_catalog：全域語意搜尋 RPC（不需要 group_id）
-- 取代舊的 match_pois（group_id 隔離版）
-- ============================================================
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
  WHERE metadata @> filter_metadata
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
