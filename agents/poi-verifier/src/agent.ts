import type {
  PoiInput,
  VerificationContext,
  PoiVerifierOutput,
  VerificationResult,
  TdxConflictInput,
} from './types'
import { crossValidate } from './validators/index'
import { enrich } from './enrichers/index'
import { analyzeConflicts } from './conflict-resolver'

// Cost estimate: Gemini 1.5 Flash ~NT$0.002/1k tokens
const COST_PER_1K_TOKENS_NTD = 0.002

function buildNotFoundResult(
  poi: PoiInput,
  exists: false,
): PoiVerifierOutput {
  const emptyFacts: VerificationResult['facts'] = {
    official_name: poi.name,
    address: '無法驗證',
    hours: '無法驗證',
    average_stay_minutes: 0,
    last_verified_at: new Date().toISOString(),
    is_indoor: false,
    weather_sensitivity: 'medium',
  }
  return {
    poi_input: poi,
    verification_result: {
      exists,
      sources: [],
      reliability_score: 0,
      facts: emptyFacts,
    },
    enrichment_result: {
      suggested_level: 2,
      level_reasoning: '景點不存在或已永久關閉',
      backup_logic: null,
    },
    cost_estimate: { tokens_used: 0, estimated_cost_ntd: 0 },
    // 景點不存在的分支沒有呼叫 LLM，明確標記為 fallback，避免下游誤判為經過驗證。
    llm_source: 'fallback',
  }
}

export async function verifyPoi(
  input: PoiInput,
  context?: VerificationContext,
  tdx?: TdxConflictInput | null,
): Promise<PoiVerifierOutput> {
  // Step 1+2: External APIs + cross-validation
  const validation = await crossValidate(input, tdx)

  if (!validation.exists) {
    return buildNotFoundResult(input, false)
  }

  // Step 3+4+5: LLM enrichment (facts + level + backup_logic in one call)
  // 傳入 extras：官網摘要 + PTT/YouTube 最新日期作為 LLM 時效判斷的額外訊號
  const enrichOutput = await enrich(
    input,
    context,
    validation.google,
    validation.osm,
    validation.blogs,
    {
      youtube:     validation.youtube_videos,
      ptt:         validation.ptt_posts,
      officialSite: validation.official_website,
    },
  )

  const tokensUsed = enrichOutput.tokens_used
  const costNtd = (tokensUsed / 1000) * COST_PER_1K_TOKENS_NTD

  if (tokensUsed > 1500) {
    console.warn(`[agent] token usage ${tokensUsed} exceeds 1500 threshold`)
  }

  const llmFacts = enrichOutput.facts
  const conflictAnalysis = analyzeConflicts(validation)

  const verificationResult: VerificationResult = {
    exists: true,
    sources: validation.sources,
    reliability_score: validation.reliability_score,
    conflict_analysis: conflictAnalysis,
    source_breakdown: validation.source_breakdown,
    facts: {
      // LLM facts take priority; fall back to conflict-resolved value, then raw API data
      official_name:
        llmFacts?.official_name ??
        conflictAnalysis.official_name?.resolved ??
        validation.google?.official_name ??
        input.name,
      address:
        llmFacts?.address ??
        conflictAnalysis.address?.resolved ??
        validation.google?.formatted_address ??
        validation.osm?.display_name ??
        '未知',
      hours:
        llmFacts?.hours ??
        conflictAnalysis.hours?.resolved ??
        validation.google?.opening_hours?.join(' / ') ??
        '未知',
      average_stay_minutes: llmFacts?.average_stay_minutes ?? 90,
      last_verified_at: new Date().toISOString(),
      latest_blog_post_date:
        llmFacts?.latest_blog_post_date ?? validation.latest_blog_date,
      is_indoor: llmFacts?.is_indoor ?? false,
      weather_sensitivity: llmFacts?.weather_sensitivity ?? 'medium',
    },
  }

  return {
    poi_input: input,
    verification_result: verificationResult,
    enrichment_result: enrichOutput.enrichment,
    tourist_friendly_description: enrichOutput.tourist_friendly_description,
    cost_estimate: {
      tokens_used: tokensUsed,
      estimated_cost_ntd: Math.round(costNtd * 100) / 100,
    },
    raw_sources: {
      google_places:    validation.google ?? undefined,
      osm:              validation.osm    ?? undefined,
      blog_posts:       validation.blogs,
      youtube_videos:   validation.youtube_videos,        // [P2] 含業配影片（已在 scoring 過濾）
      ptt_posts:        validation.ptt_posts,             // [P1]
      official_website: validation.official_website ?? undefined, // [P0]
    },
    // 把 enrich() 判定的實際 LLM 來源一路帶到最終輸出並持久化。
    // 'fallback' 即代表這筆的 suggested_level 是降級預設值、facts 為 null，非真實驗證結果。
    llm_source: enrichOutput.llm_source,
  }
}
