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

    // 4. Resolve candidate pool — caller-provided or loaded from adapter
    const pool = tripContext.candidate_pool ?? loadAllPois()
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

export { DEFAULT_CONFIG } from './types'
