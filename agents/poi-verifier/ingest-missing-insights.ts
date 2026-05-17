/**
 * 只跑「Supabase 上 blog_snippets 是空殼/空陣列」的 POI，補洞察
 * Usage: cd agents/poi-verifier && npx ts-node ingest-missing-insights.ts
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { ingestToDB } from './src/ingestion'
import type { PoiVerifierOutput } from './src/types'

const RESULTS_PATH = path.join(__dirname, 'results', 'poi_verified.json')
// Tier 1 (paid) RPM = 1000，可極短；Free Tier 請改回 11_000
const DELAY_MS = 1_500

;(async () => {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 1. 從 Supabase 撈出哪些 source_id 的 blog_snippets 是空殼
  const { data: rows, error } = await sb
    .from('poi_catalog')
    .select('source_id,blog_snippets')
  if (error) { console.error(error); process.exit(1) }

  const missing = new Set<string>()
  for (const r of rows!) {
    const b = r.blog_snippets
    if (!b || Array.isArray(b)) { missing.add(r.source_id); continue }
    const hasContent =
      (b.constraints?.length > 0) ||
      (b.visitor_tips?.length > 0) ||
      (b.weather_notes?.length > 0) ||
      b.crowd_notes ||
      b.recent_status
    if (!hasContent) missing.add(r.source_id)
  }

  console.log(`Supabase 上有 ${missing.size} 筆缺洞察`)

  // 2. 從 verified.json 撿出對應筆
  const entries = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8')) as Array<{
    poi_id: string; name: string; region: string
    result: PoiVerifierOutput | { error: string }
  }>
  const targets = entries.filter(
    (e) => missing.has(e.poi_id) && !('error' in e.result),
  )
  console.log(`要重跑：${targets.length} 筆`)
  console.log(`預估耗時：~${Math.ceil(targets.length * DELAY_MS / 60_000)} 分鐘\n`)

  let success = 0
  let failed = 0
  let firstFailIdx = -1

  for (let i = 0; i < targets.length; i++) {
    const e = targets[i]
    const poi = e.result as PoiVerifierOutput
    process.stdout.write(`[${i + 1}/${targets.length}] ${e.poi_id} ${e.name}  `)
    try {
      const ir = await ingestToDB(poi, { sourceId: e.poi_id, region: e.region })
      if (!ir.success) {
        console.log(`❌ ${ir.error}`)
        failed++
        if (firstFailIdx < 0) firstFailIdx = i
      } else {
        console.log(`✅`)
        success++
      }
    } catch (err: any) {
      console.log(`❌ 例外：${err?.message ?? err}`)
      failed++
      if (firstFailIdx < 0) firstFailIdx = i
    }
    if (i < targets.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS))
  }

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`完成：成功 ${success}，失敗 ${failed}`)
  console.log(`${'═'.repeat(50)}`)
})()
