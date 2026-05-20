import type {
  ContingencyConfig,
  ContingencyEvent,
  ContingencyPlan,
  LLMClient,
  POI,
  TripContext,
  WeatherEvent,
} from './types'
import { DEFAULT_CONFIG, SEVERITY_PRIORITY } from './types'
import { detectAllContingencies, type DetectorOverrides } from './detectors'
import { calculateExpectedValue } from './evaluators'
import { generateContingencyPlan, defaultLLMClient } from './generators'
import { loadAllPois, poisWithin } from './poi-adapter'
import { isPoiCatalogAvailable, searchPoiCatalog } from './poi-catalog-client'

export interface HandleContingencyOptions {
  config?: Partial<ContingencyConfig>
  llmClient?: LLMClient
  detectorOverrides?: DetectorOverrides
}

export async function handleContingency(
  tripContext: TripContext,
  options: HandleContingencyOptions = {},
): Promise<ContingencyPlan | null> {
  const startTime = Date.now()
  const config: ContingencyConfig = { ...DEFAULT_CONFIG, ...options.config }
  const llm: LLMClient = options.llmClient ?? defaultLLMClient

  try {
    // 1. Detect all events in parallel
    const events = await detectAllContingencies(tripContext, config, options.detectorOverrides)
    if (events.length === 0) return null

    // 2. Pick the highest-severity event
    const primary = pickPrimary(events)

    // 3. Expected-value analysis (weather events only)
    let evResult = null
    if (primary.kind === 'weather') {
      evResult = calculateExpectedValue(tripContext.current_poi, primary as WeatherEvent, config)
      if (!evResult.should_trigger_contingency) {
        return null
      }
    }

    // 4. Resolve candidate pool — priority: caller > Supabase RPC > static file
    let pool: POI[] = []
    let poolSource: NonNullable<ContingencyPlan['pool_source']> = 'static_fallback'
    if (tripContext.candidate_pool) {
      pool = tripContext.candidate_pool
      poolSource = 'caller_provided'
    } else if (isPoiCatalogAvailable()) {
      try {
        const rpcPool = await searchPoiCatalogPool(primary, tripContext.current_poi)
        if (rpcPool.length > 0) {
          pool = rpcPool
          poolSource = 'supabase_rpc'
        } else {
          pool = loadAllPois()
          poolSource = 'static_fallback'
        }
      } catch (err) {
        console.warn('[contingency-handler] pgvector RPC failed, falling back to static:', err)
        pool = loadAllPois()
        poolSource = 'static_fallback'
      }
    } else {
      pool = loadAllPois()
      poolSource = 'static_fallback'
    }

    const nearby = pool.length
      ? poisWithin(pool, {
          latitude: tripContext.current_poi.latitude,
          longitude: tripContext.current_poi.longitude,
        }, config.search_radius_km).filter(p => p.poi_id !== tripContext.current_poi.poi_id)
      : []

    // 5. Generate the plan
    const plan = await generateContingencyPlan(
      primary,
      tripContext.current_poi,
      evResult,
      nearby,
      config,
      llm,
    )

    plan.decision_latency_ms = Date.now() - startTime
    plan.pool_source = poolSource
    plan.pool_size = pool.length
    return plan
  } catch (err) {
    console.error('[contingency-handler] failed:', err)
    return null
  }
}

function pickPrimary(events: ContingencyEvent[]): ContingencyEvent {
  return events.slice().sort(
    (a, b) => SEVERITY_PRIORITY[b.severity] - SEVERITY_PRIORITY[a.severity],
  )[0]
}

// Translate the primary event + current POI into a natural-language query
// for jerry's match_poi_catalog RPC (pgvector semantic search).
async function searchPoiCatalogPool(event: ContingencyEvent, current: POI): Promise<POI[]> {
  const region = current.region ?? ''
  let query = ''
  const filter: Record<string, unknown> = {}

  if (event.kind === 'weather' && event.type === 'heavy_rain') {
    query = `下雨天 ${region} 室內景點 文青 美食 適合避雨`
    filter.is_indoor = true
  } else if (event.kind === 'weather' && event.type === 'high_temperature') {
    query = `${region} 室內冷氣 避暑 景點`
    filter.is_indoor = true
  } else if (event.kind === 'venue') {
    query = `${region} 類似 ${event.venue_name} 替代景點`
  } else if (event.kind === 'group') {
    query = `${region} 輕鬆 休息 咖啡廳 不用走太多路`
  } else {
    query = `${region} 景點`
  }

  return await searchPoiCatalog({ query, filterMetadata: filter, matchCount: 30 })
}

export { DEFAULT_CONFIG } from './types'
