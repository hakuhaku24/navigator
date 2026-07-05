#!/usr/bin/env node
// Generate poi-kb.ts by merging pois.ts + poi_verified.json
// Run: node src/data/gen-poi-kb.js

const fs   = require('fs')
const path = require('path')

// ── 1. Parse pois.ts by stripping TypeScript annotations and evaluating ──────
const poisTsPath = path.join(__dirname, 'pois.ts')
let src = fs.readFileSync(poisTsPath, 'utf-8')

// Remove interface block (pois.ts may use CRLF line endings)
src = src.replace(/export interface POI \{[\s\S]*?\}\r?\n/g, '')
// Remove export keyword and type annotation
src = src.replace('export const POIS: POI[] = ', 'const POIS = ')
// Remove trailing helper exports
src = src.replace(/\/\/ ── Helpers[\s\S]*$/, '')
// Evaluate
let POIS
try {
  POIS = new Function(src + '\nreturn POIS;')()
} catch (e) {
  console.error('Failed to eval pois.ts:', e.message)
  process.exit(1)
}
console.log(`Loaded ${POIS.length} POIs from pois.ts`)

// ── 2. Load poi_verified.json ─────────────────────────────────────────────────
const verifiedPath = path.join(__dirname, '../../agents/poi-verifier/results/poi_verified.json')
const verified = JSON.parse(fs.readFileSync(verifiedPath, 'utf-8'))
console.log(`Loaded ${verified.length} verified entries`)

// Build lookup map (poi_id → entry)
const vMap = new Map(verified.map(e => [e.poi_id, e]))

// Also try matching by name (fallback) since some IDs may not match
const nameMap = new Map(verified.map(e => [e.name, e]))

// ── 2b. Load poi_conflicts.json (multi-source conflict analysis) ──────────────
// Generate/refresh with: npx ts-node agents/poi-verifier/generate-frontend-conflicts.ts
const conflictsPath = path.join(__dirname, '../../agents/poi-verifier/results/poi_conflicts.json')
const conflictsMap = fs.existsSync(conflictsPath)
  ? JSON.parse(fs.readFileSync(conflictsPath, 'utf-8'))
  : {}
console.log(`Loaded conflict analysis for ${Object.keys(conflictsMap).length} POIs`)

// ── 3. Merge ──────────────────────────────────────────────────────────────────
const lines = []
lines.push(`// AUTO-GENERATED — do not edit directly`)
lines.push(`// Source: poi_verified.json + pois.ts`)
lines.push(`// Regenerate: node src/data/gen-poi-kb.js`)
lines.push(``)
lines.push(`export interface POIKnowledge {`)
lines.push(`  id: string`)
lines.push(`  name: string`)
lines.push(`  region: '北海岸' | '陽明山' | '東北角'`)
lines.push(`  category: string`)
lines.push(`  level: 0 | 1 | 2 | 3`)
lines.push(`  weatherSensitivity: '低' | '中' | '高' | '極高'`)
lines.push(`  tags: string[]`)
lines.push(`  isIndoor: boolean`)
lines.push(`  indoorType: string`)
lines.push(`  durationMin: number`)
lines.push(`  lat: number`)
lines.push(`  lng: number`)
lines.push(`  rating: number`)
lines.push(`  imageUrl: string`)
lines.push(`  reliabilityScore: number`)
lines.push(`  sources: string[]`)
lines.push(`  address: string`)
lines.push(`  hours: string`)
lines.push(`  latestBlogDate: string | null`)
lines.push(`  touristDescription: string`)
lines.push(`  levelReasoning: string`)
lines.push(`  blogPosts: Array<{ title: string; url: string; date: string | null; snippet: string; source: string }>`)
lines.push(`  conflicts: ConflictAnalysis | null`)
lines.push(`}`)
lines.push(``)
lines.push(`export interface SourceVariant<T> {`)
lines.push(`  value: T`)
lines.push(`  source_name: string`)
lines.push(`  source_tier: 'official' | 'semi_official' | 'blog_travel' | 'user_feedback'`)
lines.push(`  confidence: number`)
lines.push(`  last_updated_at: string`)
lines.push(`}`)
lines.push(``)
lines.push(`export interface ConflictRecord<T> {`)
lines.push(`  resolved: T`)
lines.push(`  resolution_method: 'single_source' | 'unanimous' | 'clarified_by_tier' | 'clarified_by_recency' | 'coexist'`)
lines.push(`  is_conflicted: boolean`)
lines.push(`  variants: SourceVariant<T>[]`)
lines.push(`}`)
lines.push(``)
lines.push(`export interface ConflictAnalysis {`)
lines.push(`  official_name: ConflictRecord<string> | null`)
lines.push(`  address:       ConflictRecord<string> | null`)
lines.push(`  hours:         ConflictRecord<string> | null`)
lines.push(`  is_open:       ConflictRecord<boolean> | null`)
lines.push(`}`)
lines.push(``)
lines.push(`export const POI_KB: POIKnowledge[] = [`)

let matched = 0
let unmatched = 0

for (const poi of POIS) {
  const ve = vMap.get(poi.id) || nameMap.get(poi.name)

  let reliabilityScore = 0
  let sources = []
  let address = ''
  let hours = ''
  let latestBlogDate = null
  let touristDescription = poi.semantic_description
  let levelReasoning = ''
  let blogPosts = []

  if (ve && ve.result && !ve.result.error) {
    const vr = ve.result.verification_result
    const er = ve.result.enrichment_result
    sources = vr.sources || []
    address = vr.facts?.address || ''
    hours   = vr.facts?.hours   || ''
    latestBlogDate = vr.facts?.latest_blog_post_date || null
    touristDescription = ve.result.tourist_friendly_description || poi.semantic_description
    levelReasoning = er?.level_reasoning || ''

    // Reliability score with fallback
    reliabilityScore = vr.reliability_score ?? (
      sources.length === 3 ? 0.6 :
      sources.length === 2 ? 0.5 :
      sources.length === 1 ? 0.35 : 0
    )
    reliabilityScore = Math.round(reliabilityScore * 1000) / 1000

    // Blog posts (top 2 with snippets)
    const rawBlogs = ve.result.raw_sources?.blog_posts || []
    blogPosts = rawBlogs
      .filter(b => b.snippet?.trim())
      .slice(0, 2)
      .map(b => ({
        title: b.title || '',
        url:   b.url   || '',
        date:  b.published_date ? b.published_date.replace(/年(\d+)月(\d+)日$/, '-$1-$2').replace(/年(\d+)月$/, '-$1') : null,
        snippet: b.snippet.trim().slice(0, 200),
        source: b.source || 'unknown',
      }))
    matched++
  } else {
    unmatched++
    console.warn(`  [warn] no verified data for ${poi.id} ${poi.name}`)
  }

  const esc = s => JSON.stringify(s || '')
  const conflicts = conflictsMap[poi.id] ?? null

  lines.push(`  {`)
  lines.push(`    id: ${esc(poi.id)},`)
  lines.push(`    name: ${esc(poi.name)},`)
  lines.push(`    region: ${esc(poi.region)},`)
  lines.push(`    category: ${esc(poi.category)},`)
  lines.push(`    level: ${poi.level},`)
  lines.push(`    weatherSensitivity: ${esc(poi.weather_sensitivity)},`)
  lines.push(`    tags: ${JSON.stringify(poi.tags)},`)
  lines.push(`    isIndoor: ${poi.is_indoor},`)
  lines.push(`    indoorType: ${esc(poi.indoor_type)},`)
  lines.push(`    durationMin: ${poi.duration_min},`)
  lines.push(`    lat: ${poi.lat},`)
  lines.push(`    lng: ${poi.lng},`)
  lines.push(`    rating: ${poi.rating},`)
  lines.push(`    imageUrl: ${esc(poi.image_url)},`)
  lines.push(`    reliabilityScore: ${reliabilityScore},`)
  lines.push(`    sources: ${JSON.stringify(sources)},`)
  lines.push(`    address: ${esc(address)},`)
  lines.push(`    hours: ${esc(hours)},`)
  lines.push(`    latestBlogDate: ${latestBlogDate ? esc(latestBlogDate) : 'null'},`)
  lines.push(`    touristDescription: ${esc(touristDescription)},`)
  lines.push(`    levelReasoning: ${esc(levelReasoning)},`)
  lines.push(`    blogPosts: ${JSON.stringify(blogPosts)},`)
  lines.push(`    conflicts: ${JSON.stringify(conflicts)},`)
  lines.push(`  },`)
}

lines.push(`]`)
lines.push(``)
lines.push(`export const getPOIKBByRegion = (region: POIKnowledge['region']) =>`)
lines.push(`  POI_KB.filter(p => p.region === region)`)
lines.push(``)
lines.push(`export const getPOIKBById = (id: string) =>`)
lines.push(`  POI_KB.find(p => p.id === id) ?? null`)
lines.push(``)

const output = lines.join('\n')
const outPath = path.join(__dirname, 'poi-kb.ts')
fs.writeFileSync(outPath, output, 'utf-8')

console.log(`\nWrote ${POIS.length} entries to poi-kb.ts (matched: ${matched}, unmatched: ${unmatched})`)
