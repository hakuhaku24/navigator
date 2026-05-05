// Usage: npx ts-node verify-poi.ts "竹子湖海芋" 25.168 121.541
import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import { verifyPoi } from './src/agent'

const [, , name, lat, lng] = process.argv

if (!name || !lat || !lng) {
  console.error('Usage: npx ts-node verify-poi.ts <景點名稱> <lat> <lng>')
  process.exit(1)
}

;(async () => {
  console.log(`\n驗證景點：${name} (${lat}, ${lng})\n`)
  const result = await verifyPoi({
    name,
    location: { latitude: +lat, longitude: +lng },
  })
  console.log(JSON.stringify(result, null, 2))
  console.log(`\n💰 Token 使用量：${result.cost_estimate.tokens_used}，估計費用：NT$${result.cost_estimate.estimated_cost_ntd}`)
})()
