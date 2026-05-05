import type {
  PoiInput,
  VerificationContext,
  GooglePlacesRaw,
  OsmRaw,
  BlogPostRaw,
  LlmOutput,
  EnrichmentResult,
} from '../types'
import { preClassifyLevel } from './level-classifier'
import { generateBackupLogic } from './resilience-generator'

const GEMINI_API_KEY   = process.env.GEMINI_API_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

const SYSTEM_PROMPT = `你是 Navigator 旅遊系統的景點資訊分析師，負責：
1. 整合多個資料來源，萃取可信的景點事實資訊
2. 根據景點屬性與旅行脈絡，判斷景點的彈性等級（L0–L3）
3. 為可替換景點產出備案邏輯
4. 以部落格/旅遊文章補足官方資料的觀點，讓結果更貼近旅客實際體驗

L0–L3 等級定義：
- L0 絕對錨點：有預訂或門票、系統禁止自動替換
- L1 彈性錨點：主要目的地、可平移時段但不換景點
- L2 條件變動：天氣敏感、雨天可換室內同類景點
- L3 水位調節：沿路順遊、隨時可 swap

政府或官方資訊經常使用行銷化、過度美化的描述，請優先以 blog post 的最近日期和實際遊客回饋驗證「目前真實狀態」，並在輸出中加上 latest_blog_post_date。

回傳格式必須是合法 JSON，不要加 markdown code block。`

function buildUserPrompt(
  poi: PoiInput,
  context: VerificationContext | undefined,
  google: GooglePlacesRaw | null,
  osm: OsmRaw | null,
  blogs: BlogPostRaw[],
): string {
  return `景點名稱：${poi.name}
座標：${poi.location.latitude}, ${poi.location.longitude}
使用者描述：${poi.user_description ?? '無'}
旅行人數：${context?.group_size ?? '未知'}
旅行 vibe：${context?.vibe_tags?.join(', ') ?? '未知'}

Google Places 資料：
${JSON.stringify(google, null, 2)}

OSM 資料：
${JSON.stringify(osm, null, 2)}

Blog Post 資料（最近 ${Math.min(blogs.length, 2)} 篇）：
${JSON.stringify(blogs.slice(0, 2).map(b => ({ title: b.title.slice(0, 60), date: b.published_date, snippet: b.snippet.slice(0, 120) })), null, 2)}

請輸出以下 JSON 結構：
{
  "facts": {
    "official_name": "...",
    "address": "...",
    "hours": "...",
    "average_stay_minutes": 數字,
    "is_indoor": true/false,
    "weather_sensitivity": "low" | "medium" | "high",
    "latest_blog_post_date": "YYYY-MM-DD 或 null"
  },
  "suggested_level": 0-3,
  "level_reasoning": "說明為何給這個等級",
  "backup_logic": {
    "strategy_type": "swap_same_level" | "switch_time_slot" | "cancel_with_notice",
    "description": "...",
    "candidate_pool_tags": ["..."],
    "proximity_threshold_meters": 數字
  },
  "tourist_friendly_description": "用旅客角度描述這個景點的吸引力、注意事項或建議"
}`
}

async function callGemini(userPrompt: string): Promise<LlmOutput | null> {
  if (!GEMINI_API_KEY) return null

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) {
      console.warn(`[gemini] HTTP ${res.status}`)
      return null
    }
    const data = await res.json()
    const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(text) as LlmOutput
  } catch (err) {
    console.warn('[gemini] error:', err)
    return null
  }
}

async function callClaude(userPrompt: string): Promise<{ output: LlmOutput | null; tokens: number }> {
  if (!ANTHROPIC_API_KEY) return { output: null, tokens: 0 }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!res.ok) {
      console.warn(`[claude] HTTP ${res.status}`)
      return { output: null, tokens: 0 }
    }
    const data = await res.json()
    const text: string = data.content?.[0]?.text ?? ''
    const tokens: number = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
    return { output: JSON.parse(text) as LlmOutput, tokens }
  } catch (err) {
    console.warn('[claude] error:', err)
    return { output: null, tokens: 0 }
  }
}

export interface EnrichOutput {
  enrichment: EnrichmentResult
  facts: LlmOutput['facts'] | null  // parsed from LLM; null if LLM failed
  tourist_friendly_description?: string
  tokens_used: number
  llm_source: 'gemini' | 'claude' | 'fallback'
}

export async function enrich(
  poi: PoiInput,
  context: VerificationContext | undefined,
  google: GooglePlacesRaw | null,
  osm: OsmRaw | null,
  blogs: BlogPostRaw[],
): Promise<EnrichOutput> {
  // Rule-based pre-classification
  preClassifyLevel(poi, google)  // currently always returns null

  const userPrompt = buildUserPrompt(poi, context, google, osm, blogs)

  // Try Gemini first, then Claude Haiku
  let llmOutput: LlmOutput | null = null
  let tokens = 0
  let llmSource: 'gemini' | 'claude' | 'fallback' = 'fallback'

  llmOutput = await callGemini(userPrompt)
  if (llmOutput) {
    llmSource = 'gemini'
    tokens = 800  // approximate; Gemini doesn't always return token counts
  } else {
    const claudeResult = await callClaude(userPrompt)
    if (claudeResult.output) {
      llmOutput = claudeResult.output
      tokens = claudeResult.tokens
      llmSource = 'claude'
    }
  }

  // If LLM completely failed, return minimal fallback
  if (!llmOutput) {
    console.warn('[enrich] both LLM providers failed, returning partial result')
    const fallback: EnrichmentResult = {
      suggested_level: 2,
      level_reasoning: '無法呼叫 LLM，預設 L2',
      backup_logic: {
        strategy_type: 'swap_same_level',
        description: '自動備案（LLM 不可用）',
        candidate_pool_tags: [],
        proximity_threshold_meters: 5000,
      },
    }
    return { enrichment: fallback, facts: null, tokens_used: 0, llm_source: 'fallback' }
  }

  const level = llmOutput.suggested_level
  const backupLogic = generateBackupLogic(level, [], context ?? {})

  const enrichment: EnrichmentResult = {
    suggested_level: level,
    level_reasoning: llmOutput.level_reasoning,
    backup_logic: backupLogic ?? llmOutput.backup_logic,
  }

  return {
    enrichment,
    facts: llmOutput.facts,
    tourist_friendly_description: llmOutput.tourist_friendly_description,
    tokens_used: tokens,
    llm_source: llmSource,
  }
}
