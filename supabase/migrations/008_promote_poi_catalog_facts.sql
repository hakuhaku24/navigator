-- ============================================================
-- poi_catalog：事實層欄位升級（metadata JSONB → 正式 column）
-- 對齊 agents/poi-verifier/src/canonical-poi.ts 的 CanonicalFacts
-- 詳見 agents/poi-verifier/docs/db-organization-plan.md §11
-- Additive only：全部 NULL-able、IF NOT EXISTS，不影響既有資料/RPC
-- ============================================================
ALTER TABLE poi_catalog
  ADD COLUMN IF NOT EXISTS category           TEXT,
  ADD COLUMN IF NOT EXISTS city               TEXT,
  ADD COLUMN IF NOT EXISTS zip_code           TEXT,
  ADD COLUMN IF NOT EXISTS curated_zone       TEXT,
  ADD COLUMN IF NOT EXISTS hours              TEXT,
  ADD COLUMN IF NOT EXISTS phone              TEXT,
  ADD COLUMN IF NOT EXISTS images             TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS website_url        TEXT,
  ADD COLUMN IF NOT EXISTS source_update_time TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS poi_catalog_city_idx     ON poi_catalog (city);
CREATE INDEX IF NOT EXISTS poi_catalog_category_idx ON poi_catalog (category);
