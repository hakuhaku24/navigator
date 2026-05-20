// ── Event Definitions ──────────────────────────────────────────────────────

export type EventType =
  | 'heavy_rain'
  | 'high_temperature'
  | 'strong_wind'
  | 'traffic_jam'
  | 'venue_closure'
  | 'overcrowding'
  | 'group_fatigue'
  | 'user_manual_report'

export type EventSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface BaseEvent {
  severity: EventSeverity
  timestamp: string // ISO8601
}

export interface WeatherEvent extends BaseEvent {
  kind: 'weather'
  type: 'heavy_rain' | 'high_temperature' | 'strong_wind' | 'other'
  rainfall_probability: number  // 0–1
  temperature_celsius: number
  affected_location: { latitude: number; longitude: number; radius_km: number }
  forecast_duration_minutes: number
  data_source: 'cwa' | 'mock'
}

export interface TrafficEvent extends BaseEvent {
  kind: 'traffic'
  type: 'traffic_jam' | 'accident' | 'road_closure'
  affected_route: string
  estimated_delay_minutes: number
  alternative_routes?: string[]
  data_source: 'google_maps' | 'mock'
}

export interface VenueEvent extends BaseEvent {
  kind: 'venue'
  type: 'venue_closure' | 'overcrowding' | 'no_reservation_available'
  venue_id: string
  venue_name: string
  reason: string
  estimated_recovery_minutes?: number
  current_crowd_level?: 'low' | 'moderate' | 'high' | 'extremely_busy'
  data_source: 'google_places' | 'user_report' | 'mock'
}

export interface GroupEvent extends BaseEvent {
  kind: 'group'
  type: 'fatigue' | 'injury' | 'member_separation' | 'lost_item'
  affected_member_id?: string
  description: string
  data_source: 'user_report' | 'mock'
}

export type ContingencyEvent = WeatherEvent | TrafficEvent | VenueEvent | GroupEvent

// ── POI (shared between contingency handler and other modules) ─────────────

export interface POI {
  poi_id: string
  name: string
  region?: string
  category?: string
  level: 0 | 1 | 2 | 3
  is_indoor: boolean
  space_type: 'indoor' | 'semi_outdoor' | 'outdoor'
  weather_sensitivity: 'low' | 'medium' | 'high' | 'extreme'
  tags: string[]
  duration_min: number
  latitude: number
  longitude: number
  rating?: number
  review_count?: number
  business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'
  current_crowd_level?: 'low' | 'moderate' | 'high' | 'extremely_busy'
  opening_hours_margin_minutes?: number
  last_info_update_age_days?: number
  energy_consumption?: number      // 0–100
  cost_ntd?: number
  requires_reservation?: boolean
  image_url?: string
  semantic_description?: string
  backup_strategy?: string
}

// ── Expected Value Result ──────────────────────────────────────────────────

export interface ExpectedValueResult {
  original_poi_level: 0 | 1 | 2 | 3
  original_poi_score: number              // L
  rainfall_probability: number            // P_rain
  fine_probability: number                // P_fine = 1 - P_rain
  weather_impact_factor: number           // α
  expected_value_current: number          // EV = P_fine × L + P_rain × (L × α)
  score_drop: number                      // L - EV
  contingency_threshold: number
  should_trigger_contingency: boolean
  confidence: number                      // 0–1
}

// ── Contingency Candidate ──────────────────────────────────────────────────

export interface ContingencyCandidate {
  poi_id: string
  name: string
  distance_km: number
  level: 0 | 1 | 2 | 3
  space_type: POI['space_type']

  multi_criteria_score: number            // 0–100
  score_breakdown: {
    weather_fit: number
    distance_score: number
    availability_score: number
    crowd_capacity_score: number
    group_preference_match: number
    rating_score: number
  }

  has_recent_positive_reviews: boolean
  is_verified: boolean
  last_info_update_age_days: number

  is_qualified: boolean
  disqualification_reasons?: string[]
  risk_warnings?: string[]

  suitability_reason: string
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

// ── Strategy & Impact ──────────────────────────────────────────────────────

export type StrategyType = 'swap_poi' | 'delay_timeslot' | 'skip_activity' | 'route_change'

export interface ImpactAssessment {
  time_impact_minutes: number
  cost_impact_ntd: number
  group_satisfaction_impact: 'positive' | 'neutral' | 'negative'
}

// ── Contingency Plan (final output) ────────────────────────────────────────

export interface ContingencyPlan {
  event: ContingencyEvent
  event_severity: EventSeverity
  detection_timestamp: string

  expected_value_analysis: ExpectedValueResult | null
  trigger_reason: string

  checked_candidate_count: number
  qualified_candidate_count: number
  disqualified_details: { poi_id: string; reason: string }[]

  recommended_contingencies: ContingencyCandidate[]
  primary_recommendation?: ContingencyCandidate

  strategy_type: StrategyType
  strategy_description: string
  impact_assessment: ImpactAssessment

  user_action_required: boolean
  user_options: { option_id: string; description: string; action: string }[]

  llm_narrative?: string
  decision_latency_ms: number
  llm_tokens_used: number
  llm_source: 'gemini' | 'claude' | 'fallback'

  pool_source?: 'supabase_rpc' | 'static_fallback' | 'caller_provided'
  pool_size?: number
}

// ── Configuration ──────────────────────────────────────────────────────────

export interface ContingencyConfig {
  contingency_threshold: number
  weather_severity_threshold: EventSeverity
  traffic_severity_threshold: EventSeverity
  venue_severity_threshold: EventSeverity
  max_crowd_level_allowed: 'moderate' | 'high'
  max_info_age_days: number
  min_review_count: number
  search_radius_km: number
  min_qualified_candidates: number
  max_decision_latency_ms: number
  max_llm_tokens: number
}

// ── Trip Context ───────────────────────────────────────────────────────────

export interface TripContext {
  current_location: { latitude: number; longitude: number }
  current_route?: {
    origin: { latitude: number; longitude: number }
    destination: { latitude: number; longitude: number }
  }
  current_poi: POI
  group_state: {
    member_positions: { latitude: number; longitude: number }[]
    timestamps: string[]
  }
  trip_id?: string
  candidate_pool?: POI[]   // optional: caller-provided alternatives; otherwise loaded from adapter
}

// ── LLM Client ─────────────────────────────────────────────────────────────

export interface LLMClient {
  complete(systemPrompt: string, userPrompt: string): Promise<{ text: string; tokens: number; source: 'gemini' | 'claude' | 'fallback' }>
}

// ── Constants ──────────────────────────────────────────────────────────────

export const SEVERITY_PRIORITY: Record<EventSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export const LEVEL_SCORES: Record<0 | 1 | 2 | 3, number> = {
  0: 100,
  1: 75,
  2: 50,
  3: 25,
}

export const ALPHA_MAP: Record<POI['space_type'], number> = {
  indoor: 0.95,
  semi_outdoor: 0.50,
  outdoor: 0.10,
}

export const DEFAULT_CONFIG: ContingencyConfig = {
  contingency_threshold: 20,
  weather_severity_threshold: 'medium',
  traffic_severity_threshold: 'high',
  venue_severity_threshold: 'medium',
  max_crowd_level_allowed: 'high',
  max_info_age_days: 30,
  min_review_count: 5,
  search_radius_km: 5,
  min_qualified_candidates: 3,
  max_decision_latency_ms: 3000,
  max_llm_tokens: 1000,
}

export const DEFAULT_WEIGHTS: MultiCriteriaWeights = {
  rating: 0.20,
  review_count: 0.10,
  distance: 0.15,
  opening_hours_margin: 0.10,
  cost_within_budget: 0.05,
  weather_compatibility: 0.15,
  crowd_capacity: 0.05,
  energy_consumption: 0.05,
  group_preference_match: 0.10,
  source_credibility_boost: 0.025,
  recency_bonus: 0.025,
}
