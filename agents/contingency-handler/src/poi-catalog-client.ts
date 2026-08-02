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

export interface CatalogRow {
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

// export 供單元測試使用（tests/poi-catalog-mapping.test.ts）——這個函式是
// 「資料庫欄位 → 應變管線輸入」的唯一轉換點，null 處理錯了整條管線都會歪
export function rowToPOI(row: CatalogRow): POI | null {
  const md = row.metadata ?? {}
  const lat = row.lat ?? md.lat ?? md.latitude
  const lng = row.lng ?? md.lng ?? md.longitude
  if (typeof lat !== 'number' || typeof lng !== 'number') return null

  // ⚠️ 不可以寫 Boolean(md.is_indoor)——poi_catalog 的 is_indoor 可能是 null
  // （LLM 加值失敗、未判定），Boolean(null) 是 false，等於在這個邊界把
  // 「不知道」偷偷變成「已知是戶外」，正是 2026-05-06 那批壞掉的方式。
  //
  // 未判定時保守推定為戶外：這會讓期望值模型的 α 取 0.10、傾向「建議替換」，
  // 對使用者是安全的錯誤方向（最壞情況是多看到一個不需要的建議，
  // 而不是該避雨時沒收到提醒）。但用 is_indoor_verified 標記這是推定。
  const indoorKnown = typeof md.is_indoor === 'boolean'
  const isIndoor = indoorKnown ? (md.is_indoor as boolean) : false
  const sensitivityRaw = md.weather_sensitivity ?? 'medium'
  return {
    poi_id: row.source_id ?? md.source_id ?? row.id,
    name: row.name,
    region: md.region,
    category: md.category,
    level: (md.level ?? 2) as 0 | 1 | 2 | 3,
    is_indoor: isIndoor,
    is_indoor_verified: indoorKnown,
    space_type: inferSpaceType(row.name, isIndoor),
    weather_sensitivity: SENSITIVITY_NORMALIZE[sensitivityRaw] ?? 'medium',
    tags: row.tags ?? [],
    duration_min: md.average_stay_minutes ?? 60,
    latitude: lat,
    longitude: lng,
    rating: md.rating,
    reliability_score: typeof md.reliability_score === 'number' ? md.reliability_score : undefined,
    business_status: 'OPERATIONAL',
    last_info_update_age_days: md.reliability_score ? 0 : undefined,
    semantic_description: row.description,
    backup_strategy: md.backup_strategy ?? undefined,
    requires_reservation: md.level === 0,
  }
}

// poi_catalog 的顯示欄位（不含 embedding）。與 rowToPOI 需要的欄位對齊。
const CATALOG_COLS = 'id, source_id, name, description, lat, lng, tags, metadata'

/**
 * 依 `source_id`（"NCA-004" 這種）取單筆 POI。
 *
 * 為什麼需要：`/api/contingency` 原本是 `POIS.find(p => p.id === poi_id)`，
 * 只認 `src/data/pois.ts` 那 45 筆，查不到直接回 404——意思是 TDX 匯入的
 * 任何新景點都**不能使用天氣應變**，而應變是本專案兩大賣點之一。
 * 見 CLAUDE.md §9「下一步如果要選一個做」。
 *
 * 不使用向量檢索：這是精確定址，`source_id` 上有 UNIQUE 約束，直接查即可，
 * 也不必為了取一筆景點付 embedding 的成本。
 */
export async function getPoiBySourceId(sourceId: string): Promise<POI | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('poi_catalog')
    .select(CATALOG_COLS)
    .eq('source_id', sourceId)
    .maybeSingle()
  if (error) {
    console.warn('[poi-catalog-client] getPoiBySourceId error:', error.message)
    return null
  }
  if (!data) return null
  return rowToPOI(data as unknown as CatalogRow)
}

/**
 * 取同區域的 POI 作為備援池（RPC 語意檢索失敗或回空時的安全網）。
 *
 * 原本備援池是寫死的靜態 45 筆——對 TDX 匯入的新區域（例如宜蘭、台南）完全
 * 沒有覆蓋。改成依區域查 DB，新資料進來就自動有備援。
 */
export async function listPoisByRegion(region: string, limit = 100): Promise<POI[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('poi_catalog')
    .select(CATALOG_COLS)
    .contains('metadata', { region })
    .limit(limit)
  if (error) {
    console.warn('[poi-catalog-client] listPoisByRegion error:', error.message)
    return []
  }
  return (data ?? [])
    .map(r => rowToPOI(r as unknown as CatalogRow))
    .filter((p): p is POI => p !== null)
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
