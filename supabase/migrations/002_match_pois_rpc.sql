-- RPC: match_pois
-- 用途：給 Architect Agent / 前端語意搜尋呼叫的向量搜尋函數
-- Embedding 模型：Google text-embedding-004（768 維）
-- 流程：先用 group_id + metadata 做硬性過濾，再做向量相似度排序（漏斗式）
create or replace function match_pois (
  query_embedding  vector(768),    -- 對齊 pois.embedding 維度（Google text-embedding-004）
  match_threshold  float,
  match_count      int,
  p_group_id       uuid,           -- 必填：只搜尋同一旅遊群組的 POI
  filter_metadata  jsonb default '{}'::jsonb
)
returns table (
  id          uuid,
  name        text,
  metadata    jsonb,
  similarity  float
)
language sql stable
as $$
  select
    id,
    name,
    metadata,
    1 - (embedding <=> query_embedding) as similarity
  from pois
  where group_id = p_group_id
    and metadata @> filter_metadata
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
