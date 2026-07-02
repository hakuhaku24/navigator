/**
 * test-conflict-resolver.ts
 *
 * Runs analyzeConflicts() over all stored POIs in results/poi_verified.json
 * and prints every conflict it finds, grouped by resolution method.
 *
 * Usage:
 *   npx ts-node test-conflict-resolver.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { analyzeConflicts } from './src/conflict-resolver'
import type { CrossValidationResult } from './src/validators/index'
import type { ConflictRecord, TdxConflictInput } from './src/types'

// ── Mock TDX data for select POIs ─────────────────────────────────────────
// These simulate what the TDX ingestion pipeline would inject from Supabase.
// NCA-007 神秘海岸: TDX uses '神秘' (not '神祕'); srcUpdateTime recent → high conf.
// NCA-004 老梅綠石槽: TDX canonical name helps clarify vs OSM wrong-entity match.
// YMS-003 竹子湖: TDX has OpenTime demonstrating hours conflict handling.
const MOCK_TDX: Record<string, TdxConflictInput> = {
  'NCA-007': {
    name: '神秘海岸',
    address: '新北市石門區',
    openTime: '全天開放',
    srcUpdateTime: new Date(Date.now() - 45 * 86_400_000).toISOString(),  // 45 days ago
  },
  'NCA-004': {
    name: '老梅綠石槽',
    address: '新北市石門區老梅里',
    openTime: '全年開放（每年3–5月苔藻期景觀最佳）',
    srcUpdateTime: new Date(Date.now() - 90 * 86_400_000).toISOString(),  // 90 days ago
  },
  'YMS-003': {
    name: '竹子湖',
    address: '台北市北投區竹子湖路',
    openTime: '周一至周日 08:00–17:00（花季期間延長至18:00）',
    srcUpdateTime: new Date(Date.now() - 200 * 86_400_000).toISOString(), // 200 days ago → heavy decay
  },
}

// ── Load stored verification results ───────────────────────────────────────

const RESULTS_FILE = path.join(__dirname, 'results', 'poi_verified.json')
const PTT_FILE     = path.join(__dirname, 'results', 'poi_ptt_official_results.json')
const YOUTUBE_FILE = path.join(__dirname, 'results', 'poi_youtube_results.json')

const stored: any[]  = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'))
const pttMap: Record<string, any> = {}
const ytMap:  Record<string, any> = {}

if (fs.existsSync(PTT_FILE)) {
  const pttData: any[] = JSON.parse(fs.readFileSync(PTT_FILE, 'utf-8'))
  for (const entry of pttData) pttMap[entry.poi_id] = entry
}
if (fs.existsSync(YOUTUBE_FILE)) {
  const ytData: any[] = JSON.parse(fs.readFileSync(YOUTUBE_FILE, 'utf-8'))
  for (const entry of ytData) ytMap[entry.poi_id] = entry
}

// ── Reconstruct CrossValidationResult from stored raw_sources ──────────────

function reconstruct(entry: any): CrossValidationResult {
  const raw  = entry.result?.raw_sources ?? {}
  const vr   = entry.result?.verification_result ?? {}
  const ptt  = pttMap[entry.poi_id]
  const yt   = ytMap[entry.poi_id]

  return {
    exists:             vr.exists ?? true,
    sources:            vr.sources ?? [],
    reliability_score:  vr.reliability_score ?? 0,
    source_breakdown:   vr.source_breakdown,
    google:             raw.google_places ?? null,
    osm:                raw.osm ?? null,
    blogs:              raw.blog_posts ?? [],
    youtube_videos:     raw.youtube_videos
                          ?? yt?.p2_youtube?.sample?.map((v: any) => ({
                               video_id: v.url?.split('v=')[1] ?? '',
                               title: v.title,
                               channel_name: v.channel_name ?? '',
                               published_at: v.published_at ?? null,
                               description_snippet: '',
                               view_count: null,
                               is_sponsored: false,
                               url: v.url,
                             }))
                          ?? [],
    ptt_posts:          raw.ptt_posts
                          ?? ptt?.p1_ptt?.sample?.map((p: any) => ({
                               title: p.title,
                               url: p.url,
                               published_date: p.date ?? null,
                               board: p.board ?? '',
                               snippet: '',
                             }))
                          ?? [],
    official_website:   raw.official_website
                          ?? (ptt?.p0_official_website ?? null),
    tdx:                MOCK_TDX[entry.poi_id] ?? null,
  }
}

// ── Pretty-print a single ConflictRecord ──────────────────────────────────

function fmtRecord<T>(label: string, rec: ConflictRecord<T> | null) {
  if (!rec) return
  const icon = rec.is_conflicted ? '⚠' : '✓'
  const tag  = rec.resolution_method.padEnd(22)
  console.log(`    ${icon} ${label.padEnd(14)} [${tag}] resolved → ${JSON.stringify(rec.resolved)}`)
  if (rec.is_conflicted) {
    for (const v of rec.variants) {
      const mark = JSON.stringify(v.value) === JSON.stringify(rec.resolved) ? '▶' : ' '
      console.log(`       ${mark} ${v.source_name.padEnd(30)} (${v.source_tier}, conf ${v.confidence.toFixed(2)}) = ${JSON.stringify(v.value)}`)
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

interface Summary {
  poi_id: string
  name: string
  conflicted_fields: string[]
  methods: string[]
}

const conflicts: Summary[] = []
const clean:   string[] = []

console.log('='.repeat(72))
console.log('Conflict analysis — all 45 POIs')
console.log('='.repeat(72))

for (const entry of stored) {
  const cv = reconstruct(entry)
  const ca = analyzeConflicts(cv)

  const conflictedFields: string[] = []
  const methods: string[] = []

  const checkField = (name: string, rec: ConflictRecord<any> | null) => {
    if (rec?.is_conflicted) {
      conflictedFields.push(name)
      methods.push(rec.resolution_method)
    }
  }
  checkField('official_name', ca.official_name)
  checkField('address',       ca.address)
  checkField('hours',         ca.hours)
  checkField('is_open',       ca.is_open)

  if (conflictedFields.length > 0) {
    conflicts.push({ poi_id: entry.poi_id, name: entry.name, conflicted_fields: conflictedFields, methods })
    console.log(`\n${entry.poi_id}  ${entry.name}`)
    fmtRecord('official_name', ca.official_name)
    fmtRecord('address',       ca.address)
    fmtRecord('hours',         ca.hours)
    fmtRecord('is_open',       ca.is_open)
  } else {
    clean.push(`${entry.poi_id} ${entry.name}`)
  }
}

// ── Summary ───────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(72))
console.log(`SUMMARY  ${conflicts.length} POI(s) with conflicts, ${clean.length} clean`)
console.log('='.repeat(72))

// Group by resolution method
const byMethod: Record<string, string[]> = {}
for (const c of conflicts) {
  for (const m of c.methods) {
    if (!byMethod[m]) byMethod[m] = []
    byMethod[m].push(`${c.poi_id} ${c.name}`)
  }
}
for (const [method, pois] of Object.entries(byMethod)) {
  console.log(`\n${method} (${pois.length}):`)
  for (const p of pois) console.log(`  • ${p}`)
}

if (clean.length > 0) {
  console.log('\nClean (no conflicts):')
  for (const p of clean) console.log(`  ✓ ${p}`)
}
