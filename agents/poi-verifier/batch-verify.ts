/**
 * 批次驗證 45 筆景點池
 * Usage:
 *   npx ts-node batch-verify.ts              # 只驗證，結果存 JSON
 *   npx ts-node batch-verify.ts --ingest     # 驗證 + embed + 寫入 Supabase
 *
 * 特性：
 * - 可中斷恢復：結果逐筆寫入，重跑會跳過已完成的
 * - 每筆間隔 12 秒（OSM rate limit 1 req/s + 緩衝）
 * - 錯誤不中斷：單筆失敗記錄 error，繼續下一筆
 * - 完成後輸出統計摘要
 *
 * --ingest 需要的 env vars（.env.local）：
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_DEMO_GROUP_ID   # 先在 Supabase 建好一個 travel_group，把 id 貼過來
 *   SUPABASE_DEMO_USER_ID    # 對應的系統使用者 id
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import * as fs from 'fs'
import * as path from 'path'
import { verifyPoi } from './src/agent'
import { ingestToDB } from './src/ingestion'
import { shouldAbortBatch, MAX_CONSECUTIVE_FALLBACKS } from './src/canonical-poi'
import type { PoiInput, VerificationContext, PoiVerifierOutput } from './src/types'

const INGEST = process.argv.includes('--ingest')

// ── 路徑設定 ──────────────────────────────────────────────────────────────
const SOURCE_PATH  = path.join(__dirname, '../../references/測資Json.json')
const RESULTS_DIR  = path.join(__dirname, 'results')
const RESULTS_PATH = path.join(RESULTS_DIR, 'poi_verified.json')

/**
 * 每筆之間的等待時間。可用 `--delay <ms>` 覆寫（與 ingest-from-tdx.ts 一致）。
 *
 * ⚠️ 原註解寫「OSM 1 req/s + 緩衝」，但那筆帳掛錯了：Nominatim 的節流**已經在
 * `validators/osm.ts` 內部處理**（每次請求前 `await sleep(1100)`），而每筆 POI
 * 只發一次 Nominatim 請求。所以這裡再等 12 秒是疊在上面的，比政策要求多一個
 * 數量級。其餘五個驗證器走 Promise.all 併發，最慢的 PTT 約 3 秒。
 *
 * 預設維持 12 秒不動既有預期；要跑快就傳 `--delay 3000`。
 */
const DELAY_MS = (() => {
  const i = process.argv.indexOf('--delay')
  const v = i !== -1 ? parseInt(process.argv[i + 1] ?? '', 10) : NaN
  return Number.isFinite(v) && v >= 0 ? v : 12_000
})()

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
  let fallbackTotal = 0        // 整批走降級分支的筆數
  let consecutiveFallbacks = 0 // 連續降級計數，成功一筆就歸零
  let aborted = false

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

      const isFallback = result.llm_source === 'fallback'
      console.log(
        `  exists=${exists}  score=${score}  level=L${level}  tokens=${result.cost_estimate.tokens_used}` +
        `  llm=${result.llm_source ?? 'unknown'}${isFallback ? '  ⚠ 降級（非真實驗證）' : ''}`,
      )

      if (isFallback) {
        fallbackTotal++
        consecutiveFallbacks++
      } else {
        consecutiveFallbacks = 0
      }

      entry = {
        poi_id: poi.id,
        name: poi.name,
        region: poi.region,
        verified_at: new Date().toISOString(),
        result,
      }

      // 降級的資料不入庫。寫進 results 檔還有救（可挑出來重跑），寫進 poi_catalog
      // 就會混進正式資料裡，而且 is_indoor 為 null 會讓應變管線撈不到候選。
      if (INGEST && exists && isFallback) {
        console.warn(`  [ingest] ⏭  跳過入庫：llm_source=fallback，非真實驗證結果`)
      } else if (INGEST && exists) {
        const ir = await ingestToDB(result, { sourceId: poi.id, region: poi.region })
        if (ir.skipped)        console.log(`  [ingest] ⏭  跳過：${ir.error}`)
        else if (!ir.success)  console.warn(`  [ingest] ❌ 失敗：${ir.error}`)
        else                   console.log(`  [ingest] ✅ uuid=${ir.uuid}  dim=${ir.embeddingDim}`)
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

    // 連續降級 = 系統性問題（配額耗盡／金鑰失效／網路），再跑下去只是量產垃圾
    if (shouldAbortBatch(consecutiveFallbacks)) {
      console.error(`\n${'═'.repeat(55)}`)
      console.error(`⛔ 已中止：連續 ${consecutiveFallbacks} 筆走降級分支`)
      console.error(`   最可能的原因是 LLM 配額耗盡（Gemini 免費層 RPD 僅 20）或金鑰失效。`)
      console.error(`   已完成 ${i + 1}/${todo.length} 筆，其中 ${fallbackTotal} 筆為降級資料。`)
      console.error(`   降級的筆數已寫入 ${RESULTS_PATH}，但**未入庫**；`)
      console.error(`   修正配額問題後重跑即可（已完成的筆數會自動跳過）。`)
      console.error(`${'═'.repeat(55)}\n`)
      aborted = true
      break
    }

    if (i < todo.length - 1) {
      process.stdout.write(`  ⏳ 等待 ${DELAY_MS / 1000} 秒...\r`)
      await sleep(DELAY_MS)
    }
  }

  // ── 摘要 ────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(55)}`)
  // 「成功」不等於「驗證過」——降級筆數也走 try 成功路徑，必須分開列
  const realVerified = success - fallbackTotal
  console.log(
    `${aborted ? '⛔ 已中止' : '✅ 完成'}！真實驗證 ${realVerified} 筆，` +
    `降級 ${fallbackTotal} 筆，失敗 ${failed} 筆`,
  )
  console.log(`結果存於：${RESULTS_PATH}`)
  if (fallbackTotal > 0) {
    console.warn(
      `\n⚠️  有 ${fallbackTotal} 筆是降級資料（llm_source=fallback）：\n` +
      `   suggested_level 是預設 L2 不是判斷、is_indoor 為 null（未判定）。\n` +
      `   這些筆數未入庫。修正 LLM 配額後刪掉它們在 ${path.basename(RESULTS_PATH)} 的\n` +
      `   對應項目再重跑，即可補齊。`,
    )
  }

  // 統計 exists / level 分布
  const all = [...existing.values()]
  const verified = all.filter((e) => !('error' in e.result))
  const existsCount = verified.filter((e) => (e.result as PoiVerifierOutput).verification_result.exists).length
  const levelDist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
  for (const e of verified) {
    const lvl = (e.result as PoiVerifierOutput).enrichment_result.suggested_level
    levelDist[lvl] = (levelDist[lvl] ?? 0) + 1
  }

  // 等級分布要排除降級筆數，否則 L2 會被預設值灌水看起來很正常
  // （2026-05-06 那批的 L2=39/45 就是這樣，30 筆是預設值不是判斷）
  const fbInFile = verified.filter(
    (e) => (e.result as PoiVerifierOutput).llm_source === 'fallback',
  ).length

  console.log(`\n景點存在確認：${existsCount}/${verified.length} 筆`)
  console.log(`等級分布：L0=${levelDist[0]}  L1=${levelDist[1]}  L2=${levelDist[2]}  L3=${levelDist[3]}`)
  if (fbInFile > 0) {
    console.log(`  ↑ 其中 ${fbInFile} 筆為降級預設 L2，非真實分級判斷`)
  }
  console.log(`${'═'.repeat(55)}\n`)

  // 非零 exit code：讓 CI／腳本串接時抓得到，也避免「跑完了」的錯覺
  if (aborted || fallbackTotal > 0) process.exit(1)
})()
