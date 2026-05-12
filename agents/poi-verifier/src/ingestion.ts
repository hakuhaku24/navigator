import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import type { PoiVerifierOutput, BlogPostRaw } from './types'

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
// 官方資料 + 部落格真實體驗，讓向量能命中「帶小孩注意安全」這類自然語言查詢
function buildEmbedText(verified: PoiVerifierOutput, region: string): string {
  const { facts } = verified.verification_result
  const tags = verified.enrichment_result.backup_logic?.candidate_pool_tags ?? []

  // 取最新兩篇部落格 snippet（有日期優先排序）
  const blogs = (verified.raw_sources?.blog_posts ?? [])
    .filter(b => b.snippet?.trim())
    .slice(0, 2)
    .map(b => `  ${b.published_date ? `[${b.published_date}]` : ''} ${b.snippet.slice(0, 150).trim()}`)

  return [
    `名稱: ${facts.official_name}`,
    `描述: ${verified.tourist_friendly_description ?? ''}`,
    `特色標籤: ${tags.join(', ')}`,
    `地區: ${region}`,
    `天氣敏感度: ${facts.weather_sensitivity}`,
    `空間類型: ${facts.is_indoor ? '室內' : '戶外'}`,
    blogs.length > 0 ? `旅客實際體驗:\n${blogs.join('\n')}` : '',
  ].filter(Boolean).join('\n')
}

// ── LLM 萃取非通用洞察（Google Maps 沒有的真實旅遊情報）─────────────────────
// 輸入：原始 blog snippets
// 輸出：結構化的限制條件、旅客建議、天氣注意、近況
interface PoiInsights {
  constraints:   string[]  // 非通用限制，如「假日停車困難」「需提前預約」
  visitor_tips:  string[]  // 旅客實戰建議，如「建議早上八點前入園」
  weather_notes: string[]  // 天氣/季節影響，如「雨後岩石濕滑」
  crowd_notes:   string    // 人潮規律，如「假日人潮密集，平日較空曠」
  recent_status: string    // 近期狀態，如「正常營業」「部分步道整修中」
}

async function extractInsights(
  poiName: string,
  blogs: BlogPostRaw[],
): Promise<PoiInsights | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key || blogs.length === 0) return null

  const blogText = blogs
    .filter(b => b.snippet?.trim())
    .slice(0, 3)
    .map(b => `[${b.published_date ?? '日期不明'}] ${b.snippet.slice(0, 300)}`)
    .join('\n')

  if (!blogText.trim()) return null

  const prompt = `你是旅遊資訊分析師。從以下部落格內容萃取「${poiName}」的非通用旅遊洞察。

部落格內容：
${blogText}

請只萃取部落格中明確提到、且 Google Maps 不會告訴你的實用資訊。
不要捏造或推測沒有提到的內容。

輸出 JSON（不要加 markdown）：
{
  "constraints": ["限制1", "限制2"],
  "visitor_tips": ["建議1", "建議2"],
  "weather_notes": ["天氣注意1"],
  "crowd_notes": "人潮描述",
  "recent_status": "近期狀態"
}`

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 512, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()) as PoiInsights
  } catch {
    return null
  }
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
    // 429 自動 retry，最多 3 次，每次等 15 秒
    for (let attempt = 1; attempt <= 3; attempt++) {
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
      if (res.status === 429) {
        if (attempt < 3) {
          process.stdout.write(` [429 retry ${attempt}/3, 等 15s...]`)
          await new Promise(r => setTimeout(r, 15_000))
          continue
        }
        throw new Error(`Embedding API 429: rate limit，已重試 3 次`)
      }
      if (res.status !== 404) {
        throw new Error(`Embedding API ${res.status}: ${errText.slice(0, 200)}`)
      }
      break  // 404 → 試下一個 endpoint
    }
  }
  throw new Error('所有 Gemini Embedding 端點都回傳 404，這把 key 可能沒有 embedding 存取權')
}

// ── 公開介面 ───────────────────────────────────────────────────────────────

export interface IngestOptions {
  sourceId: string  // 原始 ID，例如 "YM-001"
  region: string    // 地區，例如 "陽明山"
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

  const uuid      = deterministicUUID(opts.sourceId)
  const text      = buildEmbedText(verified, opts.region)
  const embedding = await getEmbedding(text)

  const { facts }      = verified.verification_result
  const { enrichment_result: enr } = verified
  const levelNames     = ['絕對錨點', '彈性錨點', '條件變動', '水位調節'] as const

  // LLM 萃取非通用洞察（限制、建議、天氣、人潮、近況）
  const insights = await extractInsights(
    facts.official_name,
    verified.raw_sources?.blog_posts ?? [],
  )

  // 寫入全域知識庫 poi_catalog（不綁特定群組）
  const { error } = await supabase.from('poi_catalog').upsert({
    id:            uuid,
    name:          facts.official_name,
    description:   verified.tourist_friendly_description ?? null,
    address:       facts.address,
    lat:           verified.poi_input.location.latitude,
    lng:           verified.poi_input.location.longitude,
    tags:          enr.backup_logic?.candidate_pool_tags ?? [],
    embedding,
    source_id:     opts.sourceId,
    blog_snippets: insights ?? [],
    metadata: {
      is_indoor:            facts.is_indoor,
      level:                enr.suggested_level,
      level_name:           levelNames[enr.suggested_level],
      region:               opts.region,
      weather_sensitivity:  facts.weather_sensitivity,
      reliability_score:    verified.verification_result.reliability_score,
      average_stay_minutes: facts.average_stay_minutes,
      backup_strategy:      enr.backup_logic?.strategy_type ?? null,
    },
  }, { onConflict: 'id' })

  if (error) return { success: false, uuid, error: error.message }
  return { success: true, uuid, embeddingDim: embedding.length }
}
