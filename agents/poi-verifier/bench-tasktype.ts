/**
 * Task-type 升級前後對比測試
 * Usage:
 *   npx ts-node bench-tasktype.ts before > before.json
 *   <重跑 ingest>
 *   npx ts-node bench-tasktype.ts after  > after.json
 *   npx ts-node bench-tasktype.ts diff   ← 印對照表
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

const QUERIES = [
  '下雨天 室內 親子可以去',
  '陽明山 步道 健行',
  '北海岸 美食 老街',
  '需要預約的景點 體驗',
  '看海 景觀 拍照',
]

const RESULT_DIR = path.join(__dirname, 'bench-results')
if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR)

async function embedQuery(text: string, taskType: 'RETRIEVAL_QUERY' | null): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY!
  const body: any = {
    content: { parts: [{ text }] },
    outputDimensionality: 768,
  }
  if (taskType) body.taskType = taskType
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.embedding.values
}

async function runQueries(label: 'before' | 'after') {
  // before: 走舊行為（不指定 taskType），after: 走新行為（RETRIEVAL_QUERY）
  const taskType = label === 'after' ? 'RETRIEVAL_QUERY' : null
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const results: any[] = []

  for (const q of QUERIES) {
    const emb = await embedQuery(q, taskType)
    const { data, error } = await sb.rpc('match_poi_catalog', {
      query_embedding: emb,
      match_threshold: 0.3,
      match_count: 5,
      filter_metadata: {},
    })
    if (error) throw error
    results.push({
      query: q,
      top5: data.map((r: any) => ({
        name: r.name,
        similarity: Math.round(r.similarity * 1000) / 1000,
        region: r.metadata?.region,
        level: r.metadata?.level,
      })),
    })
    await new Promise((r) => setTimeout(r, 1500))
  }

  const file = path.join(RESULT_DIR, `${label}.json`)
  fs.writeFileSync(file, JSON.stringify(results, null, 2))
  console.log(`wrote ${file}`)
  return results
}

function printDiff() {
  const before = JSON.parse(fs.readFileSync(path.join(RESULT_DIR, 'before.json'), 'utf-8'))
  const after = JSON.parse(fs.readFileSync(path.join(RESULT_DIR, 'after.json'), 'utf-8'))
  for (let i = 0; i < before.length; i++) {
    console.log(`\n━━━ Query: "${before[i].query}" ━━━`)
    console.log('rank │ before                              │ after')
    console.log('─────┼─────────────────────────────────────┼─────────────────────────────────────')
    for (let r = 0; r < 5; r++) {
      const b = before[i].top5[r]
      const a = after[i].top5[r]
      const same = b?.name === a?.name ? ' ' : '★'
      const fmt = (x: any) =>
        x ? `${x.name.padEnd(20)} ${(x.similarity * 100).toFixed(1)}%`.padEnd(34) : '—'.padEnd(34)
      console.log(`  ${r + 1}  │ ${fmt(b)} │ ${same} ${fmt(a)}`)
    }
  }
}

;(async () => {
  const mode = process.argv[2]
  if (mode === 'before' || mode === 'after') {
    await runQueries(mode)
  } else if (mode === 'diff') {
    printDiff()
  } else {
    console.error('用法: ts-node bench-tasktype.ts before|after|diff')
    process.exit(1)
  }
})()
