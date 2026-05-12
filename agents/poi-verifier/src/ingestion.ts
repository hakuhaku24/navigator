import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import type { PoiVerifierOutput } from './types'

// ── Supabase client (lazy-init) ─────────────────────────────────────────────
let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase
  const url  = process.env.SUPABASE_URL
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _supabase = createClient(url, key)
  return _supabase
}

// ── 從原始字串 ID（例如 "YM-001"）生成穩定的 UUID ──────────────────────────
// 每次 upsert 同一筆 POI 都能命中同一個 UUID，不會重複建立
export function deterministicUUID(sourceId: string): string {
  const h = createHash('sha256').update('navigator:poi:' + sourceId).digest('hex')
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-${variant}${h.slice(17,20)}-${h.slice(20,32)}`
}

// ── 組裝要向量化的語意字串 ─────────────────────────────────────────────────
// 只抽有語意價值的欄位，不把整包 JSON 丟去 embed
function buildEmbedText(verified: PoiVerifierOutput, region: string): string {
  const { facts } = verified.verification_result
  const tags = verified.enrichment_result.backup_logic?.candidate_pool_tags ?? []

  return [
    `名稱: ${facts.official_name}`,
    `描述: ${verified.tourist_friendly_description ?? ''}`,
    `特色標籤: ${tags.join(', ')}`,
    `地區: ${region}`,
    `天氣敏感度: ${facts.weather_sensitivity}`,
    `空間類型: ${facts.is_indoor ? '室內' : '戶外'}`,
  ].join('\n')
}

// ── Google Embedding API（768 維）──────────────────────────────────────────
const EMBEDDING_ENDPOINTS = [
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent',
]

async function getEmbedding(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')

  const body = JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: 768 })

  for (const endpoint of EMBEDDING_ENDPOINTS) {
    const res = await fetch(`${endpoint}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (res.ok) {
      const data = await res.json()
      return data.embedding.values as number[]
    }
    const errText = await res.text()
    if (res.status !== 404) {
      throw new Error(`Embedding API ${res.status}: ${errText.slice(0, 200)}`)
    }
  }
  throw new Error('所有 Gemini Embedding 端點都回傳 404，這把 key 可能沒有 embedding 存取權')
}

// ── 公開介面 ───────────────────────────────────────────────────────────────

export interface IngestOptions {
  sourceId: string       // 原始 ID，例如 "YM-001"
  region: string         // 地區，例如 "陽明山"
  groupId?: string       // 若不傳則讀 SUPABASE_DEMO_GROUP_ID
  addedByUserId?: string // 若不傳則讀 SUPABASE_DEMO_USER_ID
}

export interface IngestResult {
  success: boolean
  uuid?: string
  embeddingDim?: number
  skipped?: boolean
  error?: string
}

export async function ingestToDB(
  verified: PoiVerifierOutput,
  opts: IngestOptions,
): Promise<IngestResult> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, skipped: true, error: 'SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 未設定' }
  }

  const groupId  = opts.groupId      ?? process.env.SUPABASE_DEMO_GROUP_ID
  const addedBy  = opts.addedByUserId ?? process.env.SUPABASE_DEMO_USER_ID
  if (!groupId || !addedBy) {
    return { success: false, skipped: true, error: 'SUPABASE_DEMO_GROUP_ID 或 SUPABASE_DEMO_USER_ID 未設定' }
  }

  const uuid      = deterministicUUID(opts.sourceId)
  const text      = buildEmbedText(verified, opts.region)
  const embedding = await getEmbedding(text)

  const { facts }      = verified.verification_result
  const { enrichment_result: enr } = verified
  const levelNames     = ['絕對錨點', '彈性錨點', '條件變動', '水位調節'] as const

  const { error } = await supabase.from('pois').upsert({
    id:          uuid,
    group_id:    groupId,
    added_by:    addedBy,
    name:        facts.official_name,
    description: verified.tourist_friendly_description ?? null,
    address:     facts.address,
    lat:         verified.poi_input.location.latitude,
    lng:         verified.poi_input.location.longitude,
    tags:        enr.backup_logic?.candidate_pool_tags ?? [],
    embedding,
    metadata: {
      source_id:             opts.sourceId,
      is_indoor:             facts.is_indoor,
      level:                 enr.suggested_level,
      level_name:            levelNames[enr.suggested_level],
      region:                opts.region,
      weather_sensitivity:   facts.weather_sensitivity,
      reliability_score:     verified.verification_result.reliability_score,
      average_stay_minutes:  facts.average_stay_minutes,
      backup_strategy:       enr.backup_logic?.strategy_type ?? null,
    },
  }, { onConflict: 'id' })

  if (error) return { success: false, uuid, error: error.message }
  return { success: true, uuid, embeddingDim: embedding.length }
}
