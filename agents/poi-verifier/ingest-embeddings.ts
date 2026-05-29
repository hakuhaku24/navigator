/**
 * ingest-embeddings.ts — 將 basic-rag.ts 生成的向量索引寫入 Supabase poi_catalog
 *
 * 前置條件：
 *   1. 已執行 npx ts-node basic-rag.ts --build → results/poi-embeddings.json 存在
 *   2. Supabase 已套用 005_embedding_3072.sql（poi_catalog.embedding 為 vector(3072)）
 *   3. .env 或 .env.local 設有 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npx ts-node ingest-embeddings.ts            # 寫入全部
 *   npx ts-node ingest-embeddings.ts --dry-run  # 印出 payload，不寫入
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { deterministicUUID } from './src/ingestion'

dotenv.config({ path: '../../.env.local' })
dotenv.config({ path: '../../.env' })

// ── 設定 ──────────────────────────────────────────────────────────────────────

const DRY_RUN         = process.argv.includes('--dry-run')
const EMBEDDINGS_FILE = path.join(__dirname, 'results/poi-embeddings.json')
const VERIFIED_FILE   = path.join(__dirname, 'results/poi_verified.json')

// ── 型別 ──────────────────────────────────────────────────────────────────────

interface EmbeddingEntry {
  poi_id: string
  name: string
  region: string
  suggested_level: number
  is_indoor: boolean
  weather_sensitivity: string
  embed_text: string
  embedding: number[]
}

interface VerifiedEntry {
  poi_id: string
  result: {
    poi_input: {
      location: { latitude: number; longitude: number }
    }
    verification_result: {
      facts: {
        address: string
        average_stay_minutes: number
        weather_sensitivity: string
      }
      reliability_score: number | null
      sources: string[]
    }
    enrichment_result: {
      suggested_level: number
      backup_logic: { strategy_type: string } | null
    }
    tourist_friendly_description?: string
  }
}

// ── Supabase client ───────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[fatal] SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 未設定')
    process.exit(1)
  }
  return createClient(url, key)
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. 載入資料
  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    console.error(`[fatal] 找不到向量索引：${EMBEDDINGS_FILE}`)
    console.error('        請先執行：npx ts-node basic-rag.ts --build')
    process.exit(1)
  }
  if (!fs.existsSync(VERIFIED_FILE)) {
    console.error(`[fatal] 找不到驗證結果：${VERIFIED_FILE}`)
    process.exit(1)
  }

  const embeddings: EmbeddingEntry[] = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'))
  const verified: VerifiedEntry[]    = JSON.parse(fs.readFileSync(VERIFIED_FILE, 'utf-8'))

  // 以 poi_id 建立 lookup map
  const verifiedMap = new Map(verified.map(v => [v.poi_id, v]))

  console.log(`[ingest] 載入向量索引：${embeddings.length} 筆（${embeddings[0]?.embedding.length ?? 0} 維）`)
  console.log(`[ingest] 載入驗證結果：${verified.length} 筆`)
  if (DRY_RUN) console.log('[ingest] ⚠️  dry-run 模式：只印 payload，不寫入 Supabase\n')

  const supabase = DRY_RUN ? null : getSupabase()
  const levelNames = ['絕對錨點', '彈性錨點', '條件變動', '水位調節'] as const

  let success = 0
  let skipped = 0
  let failed  = 0

  for (const entry of embeddings) {
    const v = verifiedMap.get(entry.poi_id)
    process.stdout.write(`  ${entry.poi_id} ${entry.name} ... `)

    // 沒有驗證結果的跳過
    if (!v || !('poi_input' in v.result)) {
      console.log('⏭  跳過（無驗證結果）')
      skipped++
      continue
    }

    const vr   = v.result.verification_result
    const enr  = v.result.enrichment_result
    const uuid = deterministicUUID(entry.poi_id)

    // reliability_score fallback（舊批次可能是 null）
    const reliabilityScore = vr.reliability_score ?? (
      vr.sources?.length === 3 ? 0.6 :
      vr.sources?.length === 2 ? 0.5 :
      vr.sources?.length === 1 ? 0.35 : 0
    )

    // 衍生 tags（不用額外 LLM 呼叫）
    const stay = vr.facts.average_stay_minutes ?? 90
    const tags = Array.from(new Set([
      entry.region,
      levelNames[enr.suggested_level],
      entry.is_indoor ? '室內' : '戶外',
      entry.weather_sensitivity === 'high' ? '怕雨'
        : entry.weather_sensitivity === 'low' ? '全天候' : '一般天候',
      stay < 60 ? '短停' : stay > 150 ? '久留' : '中停',
      enr.suggested_level === 0 ? '需預約' : null,
    ].filter((t): t is string => !!t)))

    const payload = {
      id:          uuid,
      name:        entry.name,
      description: v.result.tourist_friendly_description ?? null,
      address:     vr.facts.address,
      lat:         v.result.poi_input.location.latitude,
      lng:         v.result.poi_input.location.longitude,
      tags,
      embedding:   entry.embedding,   // 3072 維，已由 basic-rag.ts --build 生成
      source_id:   entry.poi_id,
      metadata: {
        is_indoor:            entry.is_indoor,
        level:                enr.suggested_level,
        level_name:           levelNames[enr.suggested_level],
        region:               entry.region,
        weather_sensitivity:  entry.weather_sensitivity,
        reliability_score:    reliabilityScore,
        average_stay_minutes: stay,
        backup_strategy:      enr.backup_logic?.strategy_type ?? null,
      },
    }

    if (DRY_RUN) {
      console.log('（dry-run）')
      console.log(JSON.stringify({ ...payload, embedding: `[...${payload.embedding.length} dims]` }, null, 2))
      success++
      continue
    }

    const { error } = await supabase!.from('poi_catalog').upsert(payload, { onConflict: 'id' })
    if (error) {
      console.log(`❌ ${error.message}`)
      failed++
    } else {
      console.log(`✅ uuid=${uuid.slice(0, 8)}…  dim=${entry.embedding.length}`)
      success++
    }
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`完成：✅ ${success} 筆  ⏭  ${skipped} 筆跳過  ❌ ${failed} 筆失敗`)
  if (!DRY_RUN && success > 0) {
    console.log(`\n[info] Supabase 搜尋現在可以用 match_poi_catalog RPC：`)
    console.log(`       SELECT * FROM match_poi_catalog(query_vec, 0.65, 5);`)
  }
}

main().catch(err => {
  console.error('[fatal]', err.message)
  process.exit(1)
})
