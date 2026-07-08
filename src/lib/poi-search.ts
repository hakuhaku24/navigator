/**
 * poi-search.ts — POI 混合搜尋 + 結構化重排業務邏輯
 *
 * 供 /api/poi/search Route Handler 呼叫。
 * 流程：Gemini Embedding → Supabase hybrid_search RPC → Structural Boost
 *
 * 不直接 import agents/ 下的 CLI 工具（那些有 dotenv.config() 副作用）。
 * 重排邏輯與 agents/poi-verifier/rag-reranker.ts 保持對齊，有改請同步修改。
 */

// ── 型別定義 ──────────────────────────────────────────────────────────────────

export type Scenario = 'heavy_rain' | 'closure' | 'fatigue'

export interface SearchFilter {
  is_indoor?: boolean
  region?: string        // '北海岸' | '陽明山' | '東北角'
  level?: number[]       // e.g. [2, 3]
}

export interface SearchOptions {
  query: string
  scenario?: Scenario
  vibe_tags?: string[]
  filter?: SearchFilter
  top?: number           // 最終回傳筆數，預設 5
  pool?: number          // 混合搜尋撈的候選池大小，預設 20
  alpha?: number         // 語意向量比重 0.0–1.0，預設 0.5
  include_debug?: boolean
}

/** Supabase hybrid_search_poi_catalog RPC 的單筆回傳 */
interface RpcRow {
  id: string
  source_id: string
  name: string
  description: string | null
  address: string | null
  lat: number | null
  lng: number | null
  category: string | null
  city: string | null
  hours: string | null
  website_url: string | null
  metadata: {
    region?: string
    is_indoor?: boolean
    weather_sensitivity?: string
    level?: number
    level_name?: string
    reliability_score?: number
    average_stay_minutes?: number
    [key: string]: unknown
  }
  hybrid_score: number
}

export interface SearchResult {
  poi_id: string
  source_id: string
  name: string
  region: string | null
  level: number
  level_name: string
  is_indoor: boolean
  weather_sensitivity: string
  reliability_score: number
  address: string | null
  hours: string | null
  website_url: string | null
  lat: number | null
  lng: number | null
  hybrid_score: number
  structural_boost: number
  boost_reasons: string[]
  final_score: number
}

export interface SearchResponse {
  results: SearchResult[]
  query: string
  total: number
  debug?: {
    embedding_ms: number
    rpc_ms: number
    rerank_ms: number
  }
}

// ── Gemini Embedding ───────────────────────────────────────────────────────────

async function embedQuery(query: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 未設定')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text: query }] },
      outputDimensionality: 768,
      taskType: 'RETRIEVAL_QUERY',
    }),
  })
  if (!res.ok) throw new Error(`Gemini Embedding API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.embedding.values as number[]
}

// ── Structural Boost（與 rag-reranker.ts 邏輯對齊）────────────────────────────

function applyStructuralBoost(
  row: RpcRow,
  scenario?: Scenario,
  vibe_tags?: string[],
): { boost: number; reasons: string[] } {
  const meta = row.metadata
  const is_indoor = meta.is_indoor ?? false
  const weather_sensitivity = meta.weather_sensitivity ?? 'medium'
  const level = meta.level ?? 2

  let boost = 0
  const reasons: string[] = []

  // L0 不能自動替換，在備援搜尋中往後推
  if (level === 0) {
    boost -= 0.5
    reasons.push('L0 絕對錨點：不應自動替換')
  }

  if (scenario === 'heavy_rain') {
    if (is_indoor) {
      boost += 1.0
      reasons.push('下雨場景：室內景點強力優先')
    } else if (weather_sensitivity === 'high') {
      boost -= 1.0
      reasons.push('下雨場景：高天氣敏感戶外景點降權')
    } else if (weather_sensitivity === 'medium') {
      boost -= 0.3
      reasons.push('下雨場景：中天氣敏感景點輕微降權')
    }
  }

  if (scenario === 'closure') {
    if (level === 2 || level === 3) {
      boost += 0.5
      reasons.push('景點關閉場景：L2/L3 候補池優先')
    }
  }

  if (scenario === 'fatigue') {
    if (weather_sensitivity === 'low' && is_indoor) {
      boost += 0.8
      reasons.push('疲勞場景：輕鬆室內景點優先')
    }
  }

  if (vibe_tags && vibe_tags.length > 0) {
    const desc = (row.description ?? '').toLowerCase()
    const matched = vibe_tags.filter(tag => desc.includes(tag.toLowerCase()))
    if (matched.length > 0) {
      boost += matched.length * 0.2
      reasons.push(`偏好標籤命中：${matched.join('、')}`)
    }
  }

  return { boost, reasons }
}

function buildFilterMetadata(filter?: SearchFilter): Record<string, unknown> | null {
  if (!filter) return null
  const meta: Record<string, unknown> = {}
  if (filter.is_indoor !== undefined) meta.is_indoor = filter.is_indoor
  if (filter.region) meta.region = filter.region
  // level 是陣列，JSONB @> 不支援 IN，暫用 metadata 存的單值做精確比對
  // 若需要多 level 篩選，未來改成 RPC 參數
  if (filter.level?.length === 1) meta.level = filter.level[0]
  return Object.keys(meta).length > 0 ? meta : null
}

// ── 主搜尋函式 ────────────────────────────────────────────────────────────────

export async function searchPois(
  supabase: Awaited<ReturnType<typeof import('./supabase/server').createClient>>,
  opts: SearchOptions,
): Promise<SearchResponse> {
  const {
    query,
    scenario,
    vibe_tags,
    filter,
    top = 5,
    pool = 20,
    alpha = 0.5,
    include_debug = false,
  } = opts

  // Step 1: Embed query
  const t0 = Date.now()
  const queryEmbedding = await embedQuery(query)
  const embedding_ms = Date.now() - t0

  // Step 2: Hybrid search via Supabase RPC
  const t1 = Date.now()
  const filterMetadata = buildFilterMetadata(filter)

  const { data: rows, error } = await supabase.rpc('hybrid_search_poi_catalog', {
    query_text: query,
    query_embedding: queryEmbedding,
    match_threshold: 0.3,
    rrf_k: 60,
    match_count: pool,
    alpha,
    filter_metadata: filterMetadata,
  })

  if (error) throw new Error(`Supabase RPC error: ${error.message}`)
  const rpc_ms = Date.now() - t1

  // Step 3: Structural boost + rerank
  const t2 = Date.now()
  const ranked = (rows as RpcRow[])
    .map(row => {
      const { boost, reasons } = applyStructuralBoost(row, scenario, vibe_tags)
      const meta = row.metadata
      return {
        poi_id: row.id,
        source_id: row.source_id,
        name: row.name,
        region: meta.region ?? null,
        level: meta.level ?? 2,
        level_name: meta.level_name ?? '條件變動',
        is_indoor: meta.is_indoor ?? false,
        weather_sensitivity: meta.weather_sensitivity ?? 'medium',
        reliability_score: meta.reliability_score ?? 0,
        address: row.address,
        hours: row.hours,
        website_url: row.website_url,
        lat: row.lat,
        lng: row.lng,
        hybrid_score: row.hybrid_score,
        structural_boost: boost,
        boost_reasons: reasons,
        final_score: row.hybrid_score + boost,
      } satisfies SearchResult
    })
    .sort((a, b) => b.final_score - a.final_score)
    .slice(0, top)
  const rerank_ms = Date.now() - t2

  return {
    results: ranked,
    query,
    total: ranked.length,
    ...(include_debug && { debug: { embedding_ms, rpc_ms, rerank_ms } }),
  }
}
