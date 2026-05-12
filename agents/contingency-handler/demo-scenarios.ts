// Demo scenarios: heavy rain on outdoor L2, venue closure on L1, group fatigue on L3.

import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.local') })

import { handleContingency } from './src/agent'
import { loadAllPois } from './src/poi-adapter'
import type { TripContext } from './src/types'
import type { DetectorOverrides } from './src/detectors'

const pool = loadAllPois()
function pickByLevel(level: 0 | 1 | 2 | 3) {
  return pool.find(p => p.level === level && p.space_type === 'outdoor')
    ?? pool.find(p => p.level === level)
}

async function runScenario(label: string, poiFinder: () => ReturnType<typeof pickByLevel>, overrides: DetectorOverrides) {
  const poi = poiFinder()
  if (!poi) {
    console.log(`[${label}] no suitable POI in pool, skipping`)
    return
  }
  const ctx: TripContext = {
    current_location: { latitude: poi.latitude, longitude: poi.longitude },
    current_poi: poi,
    group_state: { member_positions: [{ latitude: poi.latitude, longitude: poi.longitude }], timestamps: [new Date().toISOString()] },
    candidate_pool: pool,
  }
  console.log(`\n========== ${label} ==========`)
  console.log(`Current POI: ${poi.name} (Level ${poi.level}, ${poi.space_type})`)
  const plan = await handleContingency(ctx, { detectorOverrides: overrides })
  if (!plan) {
    console.log('Result: no_action_required')
    return
  }
  console.log(`Event: ${plan.event.kind}/${(plan.event as any).type} severity=${plan.event_severity}`)
  if (plan.expected_value_analysis) {
    const ev = plan.expected_value_analysis
    console.log(`EV analysis: L=${ev.original_poi_score} P_rain=${ev.rainfall_probability} α=${ev.weather_impact_factor} → EV=${ev.expected_value_current} drop=${ev.score_drop} (threshold ${ev.contingency_threshold})`)
  }
  console.log(`Trigger reason: ${plan.trigger_reason}`)
  console.log(`Candidates: checked=${plan.checked_candidate_count} qualified=${plan.qualified_candidate_count}`)
  console.log(`Strategy: ${plan.strategy_type} — ${plan.strategy_description}`)
  console.log('Top recommendations:')
  for (const c of plan.recommended_contingencies.slice(0, 3)) {
    console.log(`  - ${c.name} (${c.distance_km} km, score ${c.multi_criteria_score}) — ${c.suitability_reason}`)
  }
  if (plan.llm_narrative) console.log(`LLM narrative (${plan.llm_source}): ${plan.llm_narrative}`)
  console.log(`Latency: ${plan.decision_latency_ms} ms · tokens: ${plan.llm_tokens_used}`)
}

async function main() {
  await runScenario(
    'Scenario 1 — Heavy rain on outdoor L2',
    () => pickByLevel(2),
    { weather: { rainfall_probability: 0.85, temperature_celsius: 22 } },
  )
  await runScenario(
    'Scenario 2 — Venue closure on L1',
    () => pickByLevel(1),
    { venue: { type: 'venue_closure', severity: 'high', reason: '臨時休館 (mock)' } },
  )
  await runScenario(
    'Scenario 3 — Group fatigue on L3',
    () => pickByLevel(3),
    { group: { type: 'fatigue', severity: 'medium', description: '長步道後體力下降' } },
  )
}

main().catch(err => { console.error(err); process.exit(1) })
