// CLI: npx ts-node handle-contingency.ts <eventType> <lat,lng> [currentPoiId]
//   eventType: heavy_rain | venue_closure | group_fatigue | auto
//   When eventType=auto, runs real detectors (CWA / live data) instead of mocks.
//
// Example: npx ts-node handle-contingency.ts heavy_rain 25.168,121.541 NCA-002

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local from repo root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.local') })

import { handleContingency } from './src/agent'
import { loadAllPois } from './src/poi-adapter'
import type { TripContext, POI } from './src/types'
import type { DetectorOverrides } from './src/detectors'

function mockPoiAt(lat: number, lng: number): POI {
  return {
    poi_id: 'AD-HOC',
    name: '臨時當前景點',
    level: 2,
    is_indoor: false,
    space_type: 'outdoor',
    weather_sensitivity: 'high',
    tags: [],
    duration_min: 60,
    latitude: lat,
    longitude: lng,
    business_status: 'OPERATIONAL',
  }
}

async function main() {
  const [, , eventTypeArg, locationArg, poiIdArg] = process.argv

  if (!eventTypeArg || !locationArg) {
    console.error('Usage: ts-node handle-contingency.ts <eventType> <lat,lng> [poiId]')
    process.exit(1)
  }

  const [lat, lng] = locationArg.split(',').map(Number)
  const pool = loadAllPois()
  const currentPoi = poiIdArg
    ? pool.find(p => p.poi_id === poiIdArg) ?? mockPoiAt(lat, lng)
    : mockPoiAt(lat, lng)

  const tripContext: TripContext = {
    current_location: { latitude: lat, longitude: lng },
    current_poi: currentPoi,
    group_state: { member_positions: [{ latitude: lat, longitude: lng }], timestamps: [new Date().toISOString()] },
    candidate_pool: pool,
  }

  const overrides: DetectorOverrides = {}
  switch (eventTypeArg) {
    case 'heavy_rain':
      overrides.weather = { rainfall_probability: 0.85, temperature_celsius: 22 }
      break
    case 'venue_closure':
      overrides.venue = { type: 'venue_closure', severity: 'high', reason: 'mock closure' }
      break
    case 'group_fatigue':
      overrides.group = { type: 'fatigue', severity: 'medium', description: '成員疲憊（mock）' }
      break
    case 'auto':
      // no overrides — uses real CWA + venue detector
      break
    default:
      console.error(`Unknown eventType: ${eventTypeArg}`)
      process.exit(1)
  }

  const plan = await handleContingency(tripContext, { detectorOverrides: overrides })
  if (!plan) {
    console.log(JSON.stringify({ status: 'no_action_required' }, null, 2))
    return
  }
  console.log(JSON.stringify(plan, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
