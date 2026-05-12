/**
 * 測試語意搜尋是否正確
 * Usage: npx ts-node test-search.ts
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getEmbedding(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY!
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    },
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Embedding API ${res.status}: ${err?.error?.message ?? JSON.stringify(err)}`)
  }
  const data = await res.json()
  return data.embedding.values
}

async function search(query: string, filter: Record<string, unknown> = {}) {
  console.log(`\n🔍 查詢：「${query}」`)
  if (Object.keys(filter).length) console.log(`   過濾條件：`, filter)

  const embedding = await getEmbedding(query)

  const { data, error } = await supabase.rpc('match_poi_catalog', {
    query_embedding: embedding,
    match_threshold: 0.3,
    match_count: 5,
    filter_metadata: filter,
  })

  if (error) { console.error('RPC 錯誤：', error.message); return }

  console.log(`   結果（${data.length} 筆）：`)
  for (const row of data) {
    const level  = row.metadata?.level ?? '?'
    const region = row.metadata?.region ?? '?'
    console.log(`   L${level} [${region}] ${row.name}  相似度=${row.similarity.toFixed(3)}`)
  }
}

;(async () => {
  // 測試 1：雨天室內
  await search('下雨天適合的室內景點', { is_indoor: true })

  // 測試 2：自然景觀
  await search('自然風景 海岸 地質奇觀')

  // 測試 3：美食
  await search('在地小吃 海鮮 特色料理')

  // 測試 4：完全不相關（期望相似度低）
  await search('東京購物中心 百貨公司')
})()
