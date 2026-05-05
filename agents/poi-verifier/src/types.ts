// ── Input ──────────────────────────────────────────────────────────────────

export interface PoiInput {
  name: string
  location: { latitude: number; longitude: number }
  user_description?: string
}

export interface VerificationContext {
  trip_id?: string
  group_size?: number
  vibe_tags?: string[]
  scenario?: 'heavy_rain' | 'closure' | 'fatigue'
  remaining_time_minutes?: number
  user_energy?: number         // 0–100
  group_preferences?: string[] // vibe tag list
  user_budget_ntd?: number
  group_taboos?: string[]
}

// ── External API Raw Results ───────────────────────────────────────────────

export interface GooglePlacesRaw {
  place_id: string | null
  official_name: string | null
  formatted_address: string | null
  opening_hours: string[] | null
  rating: number | null
  user_ratings_total: number | null
  business_status: string | null // "OPERATIONAL" | "CLOSED_PERMANENTLY" | ...
  geometry?: { lat: number; lng: number }  // returned location for distance check
}

export interface OsmRaw {
  osm_id: string | null
  display_name: string | null
  address: Record<string, string> | null
  category: string | null
}

export interface BlogPostRaw {
  title: string
  url: string
  published_date: string | null // YYYY-MM-DD
  snippet: string
  source: string
}

// ── Source Credibility ─────────────────────────────────────────────────────

export type SourceCredibility =
  | 'official'
  | 'semi_official'
  | 'blog_travel'
  | 'user_feedback'

export interface SourceMetadata {
  source_type: SourceCredibility
  last_updated_at: string  // ISO8601
  time_decay_factor: number // 0–1
  confidence: number        // 0–1
}

// ── POI Candidate (for backup ranking) ────────────────────────────────────

export interface POICandidate {
  poi_id: string
  name: string
  rating: number
  review_count: number
  distance_km: number
  opening_hours_margin_minutes: number
  cost_within_budget: boolean
  weather_compatibility: number        // 0–1
  crowd_level: number                  // 0–1
  current_crowd_level?: 'low' | 'moderate' | 'high' | 'extremely_busy'
  energy_consumption: number           // 0–100
  space_type: 'indoor' | 'semi_outdoor' | 'outdoor'
  decision_tags: { vibe: string[]; limitations: string[] }
  source_reliability_score: number     // 0–1
  last_verified_at: string             // ISO8601
  last_update_date?: number            // timestamp ms
  level: 0 | 1 | 2 | 3
  requires_reservation: boolean
  touches_group_taboo?: boolean
}

// ── Verification Result ────────────────────────────────────────────────────

export interface VerificationResult {
  exists: boolean
  sources: Array<'google_places' | 'osm' | 'blog_post' | 'llm_inferred'>
  reliability_score: number // 0–1
  source_breakdown?: {
    official?: SourceMetadata
    semi_official?: SourceMetadata
    blog_travel?: SourceMetadata
    user_feedback?: SourceMetadata
  }
  facts: {
    official_name: string
    address: string
    hours: string
    average_stay_minutes: number
    last_verified_at: string  // ISO8601
    latest_blog_post_date?: string  // YYYY-MM-DD
    is_indoor: boolean
    weather_sensitivity: 'low' | 'medium' | 'high'
    source_citation?: Array<{
      field: string
      primary_source: SourceCredibility
      confidence: number
    }>
  }
}

// ── Multi-criteria Weights ─────────────────────────────────────────────────

export interface MultiCriteriaWeights {
  rating: number
  review_count: number
  distance: number
  opening_hours_margin: number
  cost_within_budget: number
  weather_compatibility: number
  crowd_capacity: number
  energy_consumption: number
  group_preference_match: number
  source_credibility_boost: number
  recency_bonus: number
}

// ── Enrichment Result ──────────────────────────────────────────────────────

export interface CandidateScore {
  poi_id: string
  name: string
  distance_km: number
  multi_criteria_score: number
  score_breakdown?: {
    rating_score: number
    distance_score: number
    hours_margin_score: number
    weather_compatibility_score: number
    source_credibility_score: number
    recency_score: number
  }
  disqualification_reasons?: string[]
}

export interface EnrichmentResult {
  suggested_level: 0 | 1 | 2 | 3
  level_reasoning: string
  candidate_pool?: CandidateScore[]
  backup_logic: {
    strategy_type: 'swap_same_level' | 'switch_time_slot' | 'cancel_with_notice'
    description: string
    candidate_pool_tags: string[]
    proximity_threshold_meters: number
    recommended_backup?: string
  } | null  // null for L0
}

// ── LLM Output (parsed from LLM response) ─────────────────────────────────

export interface LlmOutput {
  facts: {
    official_name: string
    address: string
    hours: string
    average_stay_minutes: number
    is_indoor: boolean
    weather_sensitivity: 'low' | 'medium' | 'high'
    latest_blog_post_date?: string
  }
  suggested_level: 0 | 1 | 2 | 3
  level_reasoning: string
  backup_logic: {
    strategy_type: 'swap_same_level' | 'switch_time_slot' | 'cancel_with_notice'
    description: string
    candidate_pool_tags: string[]
    proximity_threshold_meters: number
  }
  tourist_friendly_description: string
}

// ── Final Output ───────────────────────────────────────────────────────────

export interface PoiVerifierOutput {
  poi_input: PoiInput
  verification_result: VerificationResult
  enrichment_result: EnrichmentResult
  tourist_friendly_description?: string
  cost_estimate: {
    tokens_used: number
    estimated_cost_ntd: number
  }
  raw_sources?: {
    google_places?: GooglePlacesRaw
    osm?: OsmRaw
    blog_posts?: BlogPostRaw[]
  }
}
