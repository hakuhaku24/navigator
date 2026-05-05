import type {
  PoiInput,
  VerificationContext,
  PoiVerifierOutput,
  VerificationResult,
} from './types'
import { crossValidate } from './validators/index'
import { enrich } from './enrichers/index'

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
  }
}

export async function verifyPoi(
  input: PoiInput,
  context?: VerificationContext,
): Promise<PoiVerifierOutput> {
  // Step 1+2: External APIs + cross-validation
  const validation = await crossValidate(input)

  if (!validation.exists) {
    return buildNotFoundResult(input, false)
  }

  // Step 3+4+5: LLM enrichment (facts + level + backup_logic in one call)
  const enrichOutput = await enrich(
    input,
    context,
    validation.google,
    validation.osm,
    validation.blogs,
  )

  const tokensUsed = enrichOutput.tokens_used
  const costNtd = (tokensUsed / 1000) * COST_PER_1K_TOKENS_NTD

  if (tokensUsed > 1500) {
    console.warn(`[agent] token usage ${tokensUsed} exceeds 1500 threshold`)
  }

  const llmFacts = enrichOutput.facts
  const verificationResult: VerificationResult = {
    exists: true,
    sources: validation.sources,
    reliability_score: validation.reliability_score,
    source_breakdown: validation.source_breakdown,
    facts: {
      // LLM facts take priority; fall back to external API data
      official_name:
        llmFacts?.official_name ??
        validation.google?.official_name ??
        input.name,
      address:
        llmFacts?.address ??
        validation.google?.formatted_address ??
        validation.osm?.display_name ??
        '未知',
      hours:
        llmFacts?.hours ??
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
      google_places: validation.google ?? undefined,
      osm: validation.osm ?? undefined,
      blog_posts: validation.blogs,
    },
  }
}
