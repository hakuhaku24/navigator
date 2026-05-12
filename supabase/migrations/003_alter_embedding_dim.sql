-- 將 pois.embedding 從 vector(1536) 改為 vector(768)
-- 原因：embedding 模型改用 Google text-embedding-004（768 維），與 Gemini stack 統一
-- 注意：如果 pois 表已有資料，需要重新執行 batch-verify.ts --ingest 補向量

-- 先移除舊的 ivfflat index（不允許直接 ALTER TYPE 有 index 的欄位）
drop index if exists pois_embedding_idx;

-- 改變欄位維度（表內無既有資料時直接轉型；有資料需清空向量再重跑 ingest）
alter table pois
  alter column embedding type vector(768)
  using null::vector(768);

-- 重建 index
create index on pois using ivfflat (embedding vector_cosine_ops) with (lists = 100);
