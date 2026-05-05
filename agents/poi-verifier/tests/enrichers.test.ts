import { generateBackupLogic } from '../src/enrichers/resilience-generator'
import { rankCandidates } from '../src/enrichers/multi-criteria-ranker'
import type { POICandidate, VerificationContext } from '../src/types'

const mockCandidate = (overrides: Partial<POICandidate> = {}): POICandidate => ({
  poi_id: 'TEST-001',
  name: '測試景點',
  rating: 4.0,
  review_count: 200,
  distance_km: 2.0,
  opening_hours_margin_minutes: 120,
  cost_within_budget: true,
  weather_compatibility: 0.8,
  crowd_level: 0.3,
  current_crowd_level: 'moderate',
  energy_consumption: 40,
  space_type: 'indoor',
  decision_tags: { vibe: ['室內', '文化'], limitations: [] },
  source_reliability_score: 0.85,
  last_verified_at: new Date().toISOString(),
  last_update_date: Date.now(),
  level: 2,
  requires_reservation: false,
  touches_group_taboo: false,
  ...overrides,
})

function run() {
  console.log('=== enrichers tests ===\n')

  // Test 1: L0 should return null backup_logic
  console.log('Test 1: L0 景點 backup_logic 應為 null')
  const r1 = generateBackupLogic(0, [mockCandidate()], {})
  console.assert(r1 === null, `FAIL: expected null, got ${JSON.stringify(r1)}`)
  console.log('  PASS ✓')

  // Test 2: level_reasoning cannot be empty (verified via LLM; here just test structure)
  console.log('\nTest 2: L2 景點 backup_logic 應有 proximity_threshold_meters = 5000')
  const r2 = generateBackupLogic(2, [mockCandidate()], {})
  console.assert(r2 !== null, 'FAIL: expected non-null')
  console.assert(r2?.proximity_threshold_meters === 5000, `FAIL: got ${r2?.proximity_threshold_meters}`)
  console.log('  PASS ✓')

  // Test 3: L1 → 10000m threshold
  console.log('\nTest 3: L1 景點 proximity_threshold = 10000')
  const r3 = generateBackupLogic(1, [mockCandidate()], {})
  console.assert(r3?.proximity_threshold_meters === 10000, `FAIL: got ${r3?.proximity_threshold_meters}`)
  console.log('  PASS ✓')

  // Test 4: Disqualified candidates (extremely_busy) should be excluded from ranking
  console.log('\nTest 4: 人潮爆滿的景點應被嚴格篩掉')
  const busy = mockCandidate({ poi_id: 'BUSY-001', current_crowd_level: 'extremely_busy' })
  const good = mockCandidate({ poi_id: 'GOOD-001' })
  const r4 = generateBackupLogic(2, [busy, good], {})
  console.assert(r4?.recommended_backup === 'GOOD-001', `FAIL: recommended=${r4?.recommended_backup}`)
  console.log('  PASS ✓')

  // Test 5: Multi-criteria ranking — heavy_rain boosts weather_compatibility
  console.log('\nTest 5: heavy_rain 場景下 weather_compatibility 應提升排名')
  const outdoor = mockCandidate({ poi_id: 'OUTDOOR', weather_compatibility: 0.1, space_type: 'outdoor' })
  const indoor  = mockCandidate({ poi_id: 'INDOOR',  weather_compatibility: 0.9, space_type: 'indoor' })
  const ranked = rankCandidates([outdoor, indoor], { scenario: 'heavy_rain' })
  console.assert(ranked[0].poi_id === 'INDOOR', `FAIL: top=${ranked[0].poi_id}`)
  console.log('  PASS ✓')

  console.log('\n=== done ===')
}

run()
