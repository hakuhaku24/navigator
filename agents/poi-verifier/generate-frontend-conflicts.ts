/**
 * generate-frontend-conflicts.ts
 *
 * Runs analyzeConflicts() over all stored POIs in results/poi_verified.json
 * (same reconstruction logic as test-conflict-resolver.ts, zero external API
 * calls — everything is derived from already-fetched raw_sources) and writes
 * a poi_id → ConflictAnalysis map that src/data/gen-poi-kb.js merges into
 * poi-kb.ts for the frontend.
 *
 * Usage:
 *   npx ts-node generate-frontend-conflicts.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { analyzeConflicts } from './src/conflict-resolver'
import type { CrossValidationResult } from './src/validators/index'
import type { ConflictAnalysis, TdxConflictInput } from './src/types'

// Same mock TDX data used by test-conflict-resolver.ts (2026-07-02 report) —
// simulates what the TDX ingestion pipeline injects from Supabase for these POIs.
const MOCK_TDX: Record<string, TdxConflictInput> = {
  'NCA-007': {
    name: '神秘海岸',
    address: '新北市石門區',
    openTime: '全天開放',
    srcUpdateTime: new Date(Date.now() - 45 * 86_400_000).toISOString(),
  },
  'NCA-004': {
    name: '老梅綠石槽',
    address: '新北市石門區老梅里',
    openTime: '全年開放（每年3–5月苔藻期景觀最佳）',
    srcUpdateTime: new Date(Date.now() - 90 * 86_400_000).toISOString(),
  },
  'YMS-003': {
    name: '竹子湖',
    address: '台北市北投區竹子湖路',
    openTime: '周一至周日 08:00–17:00（花季期間延長至18:00）',
    srcUpdateTime: new Date(Date.now() - 200 * 86_400_000).toISOString(),
  },
}

const RESULTS_FILE = path.join(__dirname, 'results', 'poi_verified.json')
const PTT_FILE     = path.join(__dirname, 'results', 'poi_ptt_official_results.json')
const YOUTUBE_FILE = path.join(__dirname, 'results', 'poi_youtube_results.json')
const OUT_FILE     = path.join(__dirname, 'results', 'poi_conflicts.json')

const stored: any[] = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'))
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

function reconstruct(entry: any): CrossValidationResult {
  const raw = entry.result?.raw_sources ?? {}
  const vr  = entry.result?.verification_result ?? {}
  const ptt = pttMap[entry.poi_id]
  const yt  = ytMap[entry.poi_id]

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

const out: Record<string, ConflictAnalysis> = {}
let conflictedCount = 0

for (const entry of stored) {
  const cv = reconstruct(entry)
  const ca = analyzeConflicts(cv)
  out[entry.poi_id] = ca

  if ([ca.official_name, ca.address, ca.hours, ca.is_open].some(r => r?.is_conflicted)) {
    conflictedCount++
  }
}

fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf-8')
console.log(`Wrote conflict analysis for ${stored.length} POIs to ${OUT_FILE}`)
console.log(`${conflictedCount} POI(s) have at least one conflicted field`)
