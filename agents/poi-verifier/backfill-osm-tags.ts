/**
 * backfill-osm-tags.ts — 只補 `metadata.osm_tags`，不重跑驗證（B-1）
 *
 * ## 為什麼需要這支腳本
 *
 * B-1 讓 `space_type` 改以 OSM 標籤判定，但既有 45 筆的 metadata 裡沒有 `osm_tags`，
 * 所以它們會全部退回「名稱關鍵字猜測」。要讓它們也受惠，唯一需要的是那些標籤。
 *
 * 而取得標籤**不需要 LLM、不需要 Google Places**——只要打一次 Nominatim。
 * 所以這支腳本可以在「不重跑驗證」的前提下執行：
 *
 *   ✅ 只寫 `metadata.osm_tags`
 *   ❌ 不動 `is_indoor` / `level` / `reliability_score` / `conflict_analysis` / embedding
 *   ❌ 不呼叫 Gemini、不呼叫 Google Places、不花錢
 *
 * ## 用法
 *
 *   npx ts-node backfill-osm-tags.ts              # 預設 dry-run：只報告，不寫入
 *   npx ts-node backfill-osm-tags.ts --apply      # 真的寫入
 *   npx ts-node backfill-osm-tags.ts --limit 10   # 只處理前 N 筆
 *
 * 預設 dry-run 是刻意的：這支會動線上資料，讓「不小心跑到」的後果是零。
 *
 * ## 成本
 *
 * Nominatim 硬性 1 req/s（`queryOsm` 內建 sleep(1100)）。45 筆約 1 分鐘。
 * 沒有任何計費 API。
 */

import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(__dirname, '../../.env.local') })
dotenv.config({ path: path.join(__dirname, '../../.env') })

import { queryOsm } from './src/validators/osm'
import { inferSpaceType } from '../contingency-handler/src/space-type'

const APPLY = process.argv.includes('--apply')
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit')
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity
})()

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

interface Row {
  id: string
  name: string
  metadata: Record<string, any>
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

  const { data, error } = await sb.from('poi_catalog').select('id, name, metadata').limit(1000)
  if (error) {
    console.error('讀取 poi_catalog 失敗：', error.message)
    process.exit(1)
  }

  const rows = (data ?? []) as Row[]
  const todo = rows.filter(r => r.metadata?.osm_class === undefined || r.metadata?.osm_class === null)
    .slice(0, LIMIT === Infinity ? undefined : LIMIT)

  console.log(`模式：${APPLY ? '⚠️  APPLY（會寫入線上資料）' : 'dry-run（唯讀）'}`)
  console.log(`poi_catalog 共 ${rows.length} 筆，其中 ${todo.length} 筆待補 osm_tags\n`)
  if (todo.length === 0) { console.log('沒有需要處理的資料。'); return }

  let found = 0
  let notFound = 0
  const changes: { name: string; before: string; after: string; evidence: string | null }[] = []

  for (const [i, row] of todo.entries()) {
    process.stdout.write(`[${i + 1}/${todo.length}] ${row.name} ... `)

    // queryOsm 內建 sleep(1100)，符合 Nominatim 的 1 req/s 硬性限制
    const osm = await queryOsm({
      poi_id: row.metadata?.source_id ?? row.id,
      name: row.name,
      location: { latitude: 0, longitude: 0, address: '' },
    } as any)

    const tags = osm?.tags ?? null
    const osmClass = osm?.osm_class ?? null
    const osmType = osm?.osm_type ?? null
    if (!tags && !osmClass) {
      notFound++
      console.log('OSM 查無此地點')
      continue
    }
    found++

    // 判定會不會因此改變——這是本次回填的實際效益，dry-run 就要看得到
    const isIndoor = typeof row.metadata?.is_indoor === 'boolean' ? row.metadata.is_indoor : null
    const before = inferSpaceType({ name: row.name, is_indoor: isIndoor })
    const after = inferSpaceType({
      name: row.name, is_indoor: isIndoor,
      osm_class: osmClass, osm_type: osmType, osm_tags: tags,
    })
    const changed = before.type !== after.type || before.source !== after.source
    if (changed) {
      changes.push({
        name: row.name,
        before: `${before.type}/${before.source}`,
        after: `${after.type}/${after.source}`,
        evidence: after.evidence,
      })
    }
    console.log(
      `${osmClass ?? '?'}/${osmType ?? '?'}、${tags ? Object.keys(tags).length : 0} 個 extratag` +
      (changed ? `  → ${before.type}/${before.source} 變 ${after.type}/${after.source}` : ''),
    )

    if (APPLY) {
      const { error: upErr } = await sb
        .from('poi_catalog')
        .update({
          metadata: { ...row.metadata, osm_tags: tags, osm_class: osmClass, osm_type: osmType },
        })
        .eq('id', row.id)
      if (upErr) console.error(`  ⚠️ 寫入失敗：${upErr.message}`)
    }
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`查到標籤 ${found} 筆、查無 ${notFound} 筆`)
  console.log(`space_type 判定改變 ${changes.length} 筆：`)
  for (const c of changes) {
    console.log(`  · ${c.name}：${c.before} → ${c.after}${c.evidence ? `（依據 ${c.evidence}）` : ''}`)
  }
  if (!APPLY) {
    console.log(`\n這是 dry-run，沒有寫入任何資料。確認以上結果後加 --apply 才會真的寫。`)
  }
  console.log('═'.repeat(60))
}

main().catch(e => { console.error(e); process.exit(1) })
