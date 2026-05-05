import * as dotenv from 'dotenv'
dotenv.config({ path: '../../../.env.local' })

import * as fs from 'fs'
import * as path from 'path'
import { verifyPoi } from '../src/agent'

async function run() {
  console.log('=== integration test ===\n')

  const result = await verifyPoi(
    {
      name: '野柳地質公園',
      location: { latitude: 25.206, longitude: 121.691 },
      user_description: '想看女王頭地形',
    },
    {
      group_size: 4,
      vibe_tags: ['自然景觀', '攝影'],
      scenario: 'heavy_rain',
    },
  )

  // Write fixture
  const outDir = path.join(__dirname, 'fixtures')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'integration_野柳地質公園.json')
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf-8')
  console.log(`✅ 輸出：${outFile}`)

  // Assertions
  console.assert(typeof result.verification_result.exists === 'boolean', 'exists must be boolean')
  console.assert(result.enrichment_result.suggested_level >= 0, 'level >= 0')
  console.assert(result.enrichment_result.level_reasoning.length > 0, 'level_reasoning must not be empty')
  console.assert(result.cost_estimate.tokens_used >= 0, 'tokens must be >= 0')

  if (result.cost_estimate.tokens_used > 1500) {
    console.warn(`⚠️  Token 使用量 ${result.cost_estimate.tokens_used} 超過 1500 門檻`)
  }

  console.log(`\n摘要：`)
  console.log(`  exists=${result.verification_result.exists}`)
  console.log(`  reliability=${result.verification_result.reliability_score.toFixed(2)}`)
  console.log(`  level=L${result.enrichment_result.suggested_level}`)
  console.log(`  reasoning=${result.enrichment_result.level_reasoning}`)
  console.log(`  tokens=${result.cost_estimate.tokens_used}`)
  console.log(`  backup=${result.enrichment_result.backup_logic?.recommended_backup ?? '無（L0）'}`)

  console.log('\n=== done ===')
}

run().catch(console.error)
