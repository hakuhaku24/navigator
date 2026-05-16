/**
 * 抽樣重跑：只跡指定 POI_ID，驗證 extractInsights 修復後的品質
 * Usage: cd agents/poi-verifier && npx ts-node ingest-sample.ts NCA-001 YMS-001 NEI-001
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import * as fs from 'fs'
import * as path from 'path'
import { ingestToDB } from './src/ingestion'
import type { PoiVerifierOutput } from './src/types'

const RESULTS_PATH = path.join(__dirname, 'results', 'poi_verified.json')
const DELAY_MS = 5_000

;(async () => {
  const ids = process.argv.slice(2)
  if (ids.length === 0) {
    console.error('用法: npx ts-node ingest-sample.ts <POI_ID> [POI_ID...]')
    process.exit(1)
  }

  const entries = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8')) as Array<{
    poi_id: string
    name: string
    region: string
    result: PoiVerifierOutput | { error: string }
  }>

  const targets = ids
    .map((id) => entries.find((e) => e.poi_id === id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .filter((e) => !('error' in e.result))

  if (targets.length === 0) {
    console.error('指定的 POI_ID 都找不到或驗證失敗')
    process.exit(1)
  }

  console.log(`\n抽樣入庫 ${targets.length} 筆\n`)

  for (let i = 0; i < targets.length; i++) {
    const e = targets[i]
    const poi = e.result as PoiVerifierOutput
    process.stdout.write(`[${i + 1}/${targets.length}] ${e.poi_id} ${e.name}\n`)
    try {
      const ir = await ingestToDB(poi, { sourceId: e.poi_id, region: e.region })
      if (!ir.success) {
        console.log(`  ❌ ${ir.error}`)
      } else {
        console.log(`  ✅ dim=${ir.embeddingDim}`)
      }
    } catch (err: any) {
      console.log(`  ❌ 例外：${err?.message ?? err}`)
    }
    if (i < targets.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS))
  }
})()
