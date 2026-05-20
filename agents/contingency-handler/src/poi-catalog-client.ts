import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { POI } from './types'

// Adapter for jerry's poi_catalog table (Supabase + pgvector).
// Wraps match_poi_catalog RPC so the contingency handler can pull
// candidates by semantic similarity instead of reading the static 45-item file.

let _client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (_client) return _client
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  _client = createClient(url, key)
  return _client
}

export function isPoiCatalogAvailable(): boolean {
  return getSupabaseClient() !== null && !!process.env.GEMINI_API_KEY
}

async function embedQuery(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: 768,
        // Gemini task-aware embedding: query 端用 RETRIEVAL_QUERY
        // 必須跟 ingestion 端 RETRIEVAL_DOCUMENT 配對才有效果
        taskType: 'RETRIEVAL_QUERY',
      }),
    },
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini embedding ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.embedding.values as number[]
}

const SENSITIVITY_NORMALIZE: Record<string, POI['weather_sensitivity']> = {
  低: 'low', 中: 'medium', 高: 'high', 極高: 'extreme',
  low: 'low', medium: 'medium', high: 'high', extreme: 'extreme',
}

function inferSpaceType(name: string, isIndoor: boolean): POI['space_type'] {
  if (isIndoor) return 'indoor'
  const semiHints = ['寺', '宮', '亭', '車站', '碼頭', '驛', '商店街', '老街']
  if (semiHints.some(k => name.includes(k))) return 'semi_outdoor'
  return 'outdoor'
}

interface CatalogRow {
  id: string
  name: string
  metadata: Record<string, any>
  similarity: number
  lat?: number
  lng?: number
  tags?: string[]
  description?: string
  source_id?: string
}

function rowToPOI(row: CatalogRow): POI | null {
  const md = row.metadata ?? {}
  const lat = row.lat ?? md.lat ?? md.latitude
  const lng = row.lng ?? md.lng ?? md.longitude
  if (typeof lat !== 'number' || typeof lng !== 'number') return null

  const isIndoor = Boolean(md.is_indoor)
  const sensitivityRaw = md.weather_sensitivity ?? 'medium'
  return {
    poi_id: row.source_id ?? md.source_id ?? row.id,
    name: row.name,
    region: md.region,
    category: md.category,
    level: (md.level ?? 2) as 0 | 1 | 2 | 3,
    is_indoor: isIndoor,
    space_type: inferSpaceType(row.name, isIndoor),
    weather_sensitivity: SENSITIVITY_NORMALIZE[sensitivityRaw] ?? 'medium',
    tags: row.tags ?? [],
    duration_min: md.average_stay_minutes ?? 60,
    latitude: lat,
    longitude: lng,
    rating: md.rating,
    business_status: 'OPERATIONAL',
    last_info_update_age_days: md.reliability_score ? 0 : undefined,
    semantic_description: row.description,
    backup_strategy: md.backup_strategy ?? undefined,
    requires_reservation: md.level === 0,
  }
}

export interface CatalogSearchOptions {
  query: string                            // 自然語 query e.g. "下雨天 室內 北海岸"
  matchThreshold?: number                  // default 0.3
  matchCount?: number                      // default 20
  filterMetadata?: Record<string, unknown> // e.g. { region: '北海岸', is_indoor: true }
}

export async function searchPoiCatalog(opts: CatalogSearchOptions): Promise<POI[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const embedding = await embedQuery(opts.query)
  const { data, error } = await supabase.rpc('match_poi_catalog', {
    query_embedding: embedding,
    match_threshold: opts.matchThreshold ?? 0.3,
    match_count: opts.matchCount ?? 20,
    filter_metadata: opts.filterMetadata ?? {},
  })
  if (error) {
    console.warn('[poi-catalog-client] RPC error:', error.message)
    return []
  }

  // RPC only returns id/name/metadata/similarity — fetch lat/lng/tags/description in batch
  const ids = (data ?? []).map((r: any) => r.id)
  if (ids.length === 0) return []
  const { data: rich, error: richErr } = await supabase
    .from('poi_catalog')
    .select('id, lat, lng, tags, description, source_id')
    .in('id', ids)
  if (richErr) {
    console.warn('[poi-catalog-client] catalog fetch error:', richErr.message)
    return []
  }
  const richMap = new Map<string, any>((rich ?? []).map((r: any) => [r.id, r]))

  const merged: CatalogRow[] = (data ?? []).map((r: any) => ({
    ...r,
    ...(richMap.get(r.id) ?? {}),
  }))

  return merged.map(rowToPOI).filter((p): p is POI => p !== null)
}
