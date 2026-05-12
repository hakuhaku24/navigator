// Integration smoke test — runs the full pipeline with mocked detector overrides
// (no external API calls needed). Verifies that handleContingency returns a plan,
// runs under the latency budget, and produces qualified recommendations.

import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local') })

import { handleContingency } from '../src/agent'
import { loadAllPois } from '../src/poi-adapter'
import type { POI, TripContext, LLMClient } from '../src/types'

const mockLLM: LLMClient = {
  async complete() { return { text: '建議下雨天到附近室內景點，氣氛悠閒。', tokens: 0, source: 'fallback' } },
}

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('✗', msg); process.exitCode = 1 } else { console.log('✓', msg) }
}

async function main() {
  const pool = loadAllPois()
  assert(pool.length > 0, `POI pool loaded (${pool.length} items)`)

  const outdoorL2 = pool.find(p => p.level === 2 && p.space_type === 'outdoor')
  assert(!!outdoorL2, 'found at least one outdoor L2 POI in pool')
  if (!outdoorL2) return

  const ctx: TripContext = {
    current_location: { latitude: outdoorL2.latitude, longitude: outdoorL2.longitude },
    current_poi: outdoorL2,
    group_state: { member_positions: [{ latitude: outdoorL2.latitude, longitude: outdoorL2.longitude }], timestamps: [new Date().toISOString()] },
    candidate_pool: pool,
  }

  const plan = await handleContingency(ctx, {
    llmClient: mockLLM,
    detectorOverrides: { weather: { rainfall_probability: 0.85, temperature_celsius: 22 } },
  })

  assert(plan !== null, 'plan generated for heavy rain on outdoor L2')
  if (!plan) return
  assert(plan.event.kind === 'weather', 'event kind === weather')
  assert(plan.event_severity === 'critical' || plan.event_severity === 'high', `severity high/critical (got ${plan.event_severity})`)
  assert(plan.expected_value_analysis !== null, 'EV analysis present')
  assert(plan.expected_value_analysis!.should_trigger_contingency, 'EV says trigger contingency')
  assert(plan.checked_candidate_count > 0, `checked some candidates (${plan.checked_candidate_count})`)
  assert(plan.qualified_candidate_count >= 1, `at least 1 qualified candidate (${plan.qualified_candidate_count})`)
  assert(plan.recommended_contingencies.length > 0, `recommendations returned (${plan.recommended_contingencies.length})`)
  assert(plan.decision_latency_ms < 3000, `latency < 3000ms (got ${plan.decision_latency_ms})`)
  assert(plan.strategy_type === 'swap_poi' || plan.strategy_type === 'delay_timeslot', `strategy is swap/delay (got ${plan.strategy_type})`)

  console.log('\nTop recommendation:', plan.primary_recommendation?.name, `(${plan.primary_recommendation?.multi_criteria_score})`)
  console.log('Strategy:', plan.strategy_description)
}

main().catch(err => { console.error(err); process.exit(1) })
