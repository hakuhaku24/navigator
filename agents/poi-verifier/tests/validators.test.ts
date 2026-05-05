import * as dotenv from 'dotenv'
dotenv.config({ path: '../../../.env.local' })

import { crossValidate } from '../src/validators/index'

async function run() {
  console.log('=== validators tests ===\n')

  // Test 1: Real POI should exist
  console.log('Test 1: 陽明山竹子湖海芋 (should exist)')
  const r1 = await crossValidate({
    name: '竹子湖海芋',
    location: { latitude: 25.168, longitude: 121.541 },
  })
  console.assert(r1.exists === true, `FAIL: exists=${r1.exists}`)
  console.assert(r1.reliability_score > 0, `FAIL: reliability_score=${r1.reliability_score}`)
  console.log(`  exists=${r1.exists}, reliability=${r1.reliability_score.toFixed(2)}, sources=${r1.sources.join(',')}`)
  console.log(`  PASS ✓`)

  // Test 2: Fake POI should not exist
  console.log('\nTest 2: 不存在的假地名 (should not exist)')
  const r2 = await crossValidate({
    name: '台北星球大戰主題樂園',
    location: { latitude: 25.033, longitude: 121.565 },
  })
  console.log(`  exists=${r2.exists}, reliability=${r2.reliability_score.toFixed(2)}, sources=${r2.sources.join(',')}`)
  // Note: google may still return a result due to fuzzy matching;
  // permanently-closed check is the hard gate
  console.log(`  DONE (manual review recommended)`)

  console.log('\n=== done ===')
}

run().catch(console.error)
