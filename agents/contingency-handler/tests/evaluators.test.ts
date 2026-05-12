import { calculateExpectedValue, performStrictCheck } from '../src/evaluators'
import { DEFAULT_CONFIG, type POI, type WeatherEvent } from '../src/types'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('✗', msg)
    process.exitCode = 1
  } else {
    console.log('✓', msg)
  }
}

const outdoorL2: POI = {
  poi_id: 'TEST-1', name: 'Outdoor Park', level: 2, is_indoor: false,
  space_type: 'outdoor', weather_sensitivity: 'high', tags: [],
  duration_min: 60, latitude: 25.0, longitude: 121.5, rating: 4.3,
}
const indoorL2: POI = {
  poi_id: 'TEST-2', name: 'Museum', level: 2, is_indoor: true,
  space_type: 'indoor', weather_sensitivity: 'low', tags: [],
  duration_min: 90, latitude: 25.0, longitude: 121.5, rating: 4.4,
}

const rainEvent: WeatherEvent = {
  kind: 'weather', type: 'heavy_rain', severity: 'high',
  rainfall_probability: 0.8, temperature_celsius: 22,
  affected_location: { latitude: 25, longitude: 121.5, radius_km: 5 },
  forecast_duration_minutes: 180, data_source: 'mock', timestamp: new Date().toISOString(),
}

// EV test
const ev = calculateExpectedValue(outdoorL2, rainEvent, DEFAULT_CONFIG)
// L=50, P_rain=0.8, α=0.10 → EV = 0.2*50 + 0.8*(50*0.10) = 10 + 4 = 14, drop=36
assert(ev.expected_value_current === 14, `EV calc: expected 14, got ${ev.expected_value_current}`)
assert(ev.score_drop === 36, `drop: expected 36, got ${ev.score_drop}`)
assert(ev.should_trigger_contingency === true, 'should trigger contingency on outdoor + heavy rain')

const evIndoor = calculateExpectedValue(indoorL2, rainEvent, DEFAULT_CONFIG)
// L=50, α=0.95 → EV = 0.2*50 + 0.8*(50*0.95) = 10 + 38 = 48, drop=2
assert(evIndoor.should_trigger_contingency === false, 'indoor POI should NOT trigger contingency under rain')

// Strict-check test
const crowded: POI = { ...indoorL2, poi_id: 'CROWD', name: 'Crowded Cafe', current_crowd_level: 'extremely_busy' }
const lowRating: POI = { ...indoorL2, poi_id: 'LOW', name: 'Bad Spot', rating: 2.5 }
const outdoorCandidate: POI = { ...outdoorL2, poi_id: 'OUT', name: 'Open Park' }

const { qualified, disqualified } = performStrictCheck([indoorL2, crowded, lowRating, outdoorCandidate], rainEvent, DEFAULT_CONFIG)
assert(qualified.length === 1 && qualified[0].poi_id === 'TEST-2', `strict-check qualified should be only indoor museum, got ${qualified.map(p => p.poi_id).join(',')}`)
assert(disqualified.some(d => d.reason.includes('人潮爆滿')), 'should disqualify overcrowded')
assert(disqualified.some(d => d.reason.includes('評分過低')), 'should disqualify low-rated')
assert(disqualified.some(d => d.reason.includes('開放式戶外')), 'should disqualify outdoor under heavy rain')
