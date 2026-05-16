/**
 * 從已驗證的 poi_verified.json 一次性入庫（embedding + Supabase upsert）
 * Usage: npx ts-node ingest-from-results.ts
 *
 * 前提：
 *   1. batch-verify.ts 已跑完，results/poi_verified.json 存在
 *   2. .env.local 有 GEMINI_API_KEY, SUPABASE_URL,
 *      SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DEMO_GROUP_ID, SUPABASE_DEMO_USER_ID
 *   3. Supabase migration 003 已套用（pois.embedding 是 vector(768)）
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import * as fs from 'fs'
import * as path from 'path'
import { ingestToDB } from './src/ingestion'
import type { PoiVerifierOutput } from './src/types'

const RESULTS_PATH = path.join(__dirname, 'results', 'poi_verified.json')
// 每筆打 2 次 Gemini API（embedding + extractInsights），
// gemini-2.5-flash 免費版 10 RPM → 每分鐘最多 5 筆 → 每筆 ≥ 12 秒
const DELAY_MS = 11_000

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

;(async () => {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.error('找不到 poi_verified.json，請先執行 npm run batch')
    process.exit(1)
  }

  const entries: Array<{
    poi_id: string
    name: string
    region: string
    verified_at: string
    result: PoiVerifierOutput | { error: string }
  }> = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8'))

  const valid = entries.filter(
    (e) => !('error' in e.result) && (e.result as PoiVerifierOutput).verification_result.exists
  )
  const skippedCount = entries.length - valid.length

  console.log(`\n總計 ${entries.length} 筆，可入庫 ${valid.length} 筆，略過 ${skippedCount} 筆（不存在或驗證失敗）\n`)

  let success = 0
  let failed  = 0

  for (let i = 0; i < valid.length; i++) {
    const e = valid[i]
    const poi = e.result as PoiVerifierOutput
    process.stdout.write(`[${i + 1}/${valid.length}] ${e.poi_id} ${e.name}  `)

    try {
      const ir = await ingestToDB(poi, { sourceId: e.poi_id, region: e.region })

      if (ir.skipped) {
        console.log(`⏭  ${ir.error}`)
        failed++
      } else if (!ir.success) {
        console.log(`❌ ${ir.error}`)
        failed++
      } else {
        console.log(`✅ dim=${ir.embeddingDim}`)
        success++
      }
    } catch (err: any) {
      console.log(`❌ 例外：${err?.message ?? err}`)
      failed++
    }

    if (i < valid.length - 1) await sleep(DELAY_MS)
  }

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`入庫完成：成功 ${success} 筆，失敗 ${failed} 筆`)
  console.log(`${'═'.repeat(50)}\n`)
})()
