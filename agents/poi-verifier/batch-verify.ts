/**
 * 批次驗證 45 筆景點池
 * Usage: npx ts-node batch-verify.ts
 *
 * 特性：
 * - 可中斷恢復：結果逐筆寫入，重跑會跳過已完成的
 * - 每筆間隔 12 秒（OSM rate limit 1 req/s + 緩衝）
 * - 錯誤不中斷：單筆失敗記錄 error，繼續下一筆
 * - 完成後輸出統計摘要
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import * as fs from 'fs'
import * as path from 'path'
import { verifyPoi } from './src/agent'
import type { PoiInput, VerificationContext, PoiVerifierOutput } from './src/types'

// ── 路徑設定 ──────────────────────────────────────────────────────────────
const SOURCE_PATH  = path.join(__dirname, '../../references/測資Json.json')
const RESULTS_DIR  = path.join(__dirname, 'results')
const RESULTS_PATH = path.join(RESULTS_DIR, 'poi_verified.json')

const DELAY_MS = 12_000   // OSM 1 req/s + 緩衝

// ── 型別 ──────────────────────────────────────────────────────────────────
interface RawPoi {
  id: string
  name: string
  region: string
  category: string
  level: number
  weather_sensitivity: string
  tags: string[]
  is_indoor: boolean
  indoor_type: string
  duration_min: number
  lat: number
  lng: number
  backup_strategy: string
  image_url: string
  semantic_description: string
  rating: number
}

interface VerifiedEntry {
  poi_id: string
  name: string
  region: string
  verified_at: string
  result: PoiVerifierOutput | { error: string }
}

// ── 載入已完成的結果（resumable）──────────────────────────────────────────
function loadExisting(): Map<string, VerifiedEntry> {
  const map = new Map<string, VerifiedEntry>()
  if (!fs.existsSync(RESULTS_PATH)) return map
  try {
    const entries: VerifiedEntry[] = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8'))
    for (const e of entries) map.set(e.poi_id, e)
    console.log(`[batch] 載入已完成：${map.size} 筆`)
  } catch {
    console.warn('[batch] 結果檔案讀取失敗，從頭開始')
  }
  return map
}

function saveAll(map: Map<string, VerifiedEntry>) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  fs.writeFileSync(RESULTS_PATH, JSON.stringify([...map.values()], null, 2), 'utf-8')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── 主流程 ────────────────────────────────────────────────────────────────
;(async () => {
  const raw = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf-8'))
  const pois: RawPoi[] = raw.data

  const existing = loadExisting()
  const todo = pois.filter((p) => !existing.has(p.id))

  console.log(`\n總計 ${pois.length} 筆，待驗證 ${todo.length} 筆，預估時間 ${Math.ceil(todo.length * DELAY_MS / 60000)} 分鐘\n`)

  let success = 0
  let failed = 0

  for (let i = 0; i < todo.length; i++) {
    const poi = todo[i]
    const progress = `[${i + 1}/${todo.length}]`

    console.log(`${'─'.repeat(55)}`)
    console.log(`${progress} ${poi.id} ${poi.name}（${poi.region}）`)

    const input: PoiInput = {
      name: poi.name,
      location: { latitude: poi.lat, longitude: poi.lng },
      user_description: poi.semantic_description,
    }
    const context: VerificationContext = {
      vibe_tags: poi.tags,
    }

    let entry: VerifiedEntry

    try {
      const result = await verifyPoi(input, context)
      const score = result.verification_result.reliability_score.toFixed(2)
      const level = result.enrichment_result.suggested_level
      const exists = result.verification_result.exists

      console.log(`  exists=${exists}  score=${score}  level=L${level}  tokens=${result.cost_estimate.tokens_used}`)

      entry = {
        poi_id: poi.id,
        name: poi.name,
        region: poi.region,
        verified_at: new Date().toISOString(),
        result,
      }
      success++
    } catch (err: any) {
      console.warn(`  ❌ 錯誤：${err?.message ?? err}`)
      entry = {
        poi_id: poi.id,
        name: poi.name,
        region: poi.region,
        verified_at: new Date().toISOString(),
        result: { error: String(err?.message ?? err) },
      }
      failed++
    }

    existing.set(poi.id, entry)
    saveAll(existing)  // 每筆完成立刻寫檔

    if (i < todo.length - 1) {
      process.stdout.write(`  ⏳ 等待 ${DELAY_MS / 1000} 秒...\r`)
      await sleep(DELAY_MS)
    }
  }

  // ── 摘要 ────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(55)}`)
  console.log(`✅ 完成！成功 ${success} 筆，失敗 ${failed} 筆`)
  console.log(`結果存於：${RESULTS_PATH}`)

  // 統計 exists / level 分布
  const all = [...existing.values()]
  const verified = all.filter((e) => !('error' in e.result))
  const existsCount = verified.filter((e) => (e.result as PoiVerifierOutput).verification_result.exists).length
  const levelDist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
  for (const e of verified) {
    const lvl = (e.result as PoiVerifierOutput).enrichment_result.suggested_level
    levelDist[lvl] = (levelDist[lvl] ?? 0) + 1
  }

  console.log(`\n景點存在確認：${existsCount}/${verified.length} 筆`)
  console.log(`等級分布：L0=${levelDist[0]}  L1=${levelDist[1]}  L2=${levelDist[2]}  L3=${levelDist[3]}`)
  console.log(`${'═'.repeat(55)}\n`)
})()
