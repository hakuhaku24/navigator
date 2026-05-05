// Demo: 3 scenarios for professor presentation
// Usage: npx ts-node demo-scenarios.ts
import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import * as fs from 'fs'
import * as path from 'path'
import { verifyPoi } from './src/agent'
import type { PoiInput, VerificationContext } from './src/types'

const scenarios: Array<{
  label: string
  poi: PoiInput
  context: VerificationContext
}> = [
  {
    label: '正常場景：竹子湖海芋（晴天）',
    poi: { name: '竹子湖海芋', location: { latitude: 25.168, longitude: 121.541 } },
    context: { group_size: 4, vibe_tags: ['自然', '攝影', '輕鬆'] },
  },
  {
    label: '應變場景：竹子湖（大雨 80% 機率）',
    poi: { name: '竹子湖海芋', location: { latitude: 25.168, longitude: 121.541 } },
    context: {
      group_size: 4,
      vibe_tags: ['自然', '攝影'],
      scenario: 'heavy_rain',
    },
  },
  {
    label: '異常場景：不存在的景點',
    poi: { name: '台北星球大戰主題樂園', location: { latitude: 25.033, longitude: 121.565 } },
    context: { group_size: 2 },
  },
]

;(async () => {
  const outDir = path.join(__dirname, 'tests', 'fixtures')
  fs.mkdirSync(outDir, { recursive: true })

  for (const s of scenarios) {
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`📍 ${s.label}`)
    console.log('─'.repeat(60))

    const result = await verifyPoi(s.poi, s.context)

    console.log(`存在：${result.verification_result.exists}`)
    console.log(`可信度：${result.verification_result.reliability_score.toFixed(2)}`)
    console.log(`L 等級：${result.enrichment_result.suggested_level}`)
    console.log(`等級說明：${result.enrichment_result.level_reasoning}`)
    console.log(`Token：${result.cost_estimate.tokens_used}（NT$${result.cost_estimate.estimated_cost_ntd}）`)

    if (result.enrichment_result.backup_logic) {
      console.log(`備案策略：${result.enrichment_result.backup_logic.strategy_type}`)
      console.log(`推薦備案：${result.enrichment_result.backup_logic.recommended_backup ?? '無'}`)
    } else {
      console.log('備案：L0 無備案')
    }

    const filename = s.poi.name.replace(/\s+/g, '_') + '_' + (s.context.scenario ?? 'normal') + '.json'
    fs.writeFileSync(
      path.join(outDir, filename),
      JSON.stringify(result, null, 2),
      'utf-8',
    )
    console.log(`✅ 輸出到 tests/fixtures/${filename}`)
  }

  console.log('\n\n所有場景完成。')
})()
