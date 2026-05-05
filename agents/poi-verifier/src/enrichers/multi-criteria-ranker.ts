import type { POICandidate, MultiCriteriaWeights, VerificationContext } from '../types'

// Default weights — must sum to 1.0
export const DEFAULT_WEIGHTS: MultiCriteriaWeights = {
  rating: 0.15,
  review_count: 0.10,
  distance: 0.15,
  weather_compatibility: 0.20,
  opening_hours_margin: 0.10,
  group_preference_match: 0.10,
  cost_within_budget: 0.05,
  crowd_capacity: 0.05,
  energy_consumption: 0.05,
  source_credibility_boost: 0.025,
  recency_bonus: 0.025,
}
// sum = 1.0 ✓

export function adjustWeightsForScenario(
  scenario: NonNullable<VerificationContext['scenario']>,
): MultiCriteriaWeights {
  switch (scenario) {
    case 'heavy_rain':
      return {
        weather_compatibility: 0.35,
        distance: 0.15,
        rating: 0.15,
        opening_hours_margin: 0.10,
        group_preference_match: 0.07,
        review_count: 0.05,
        crowd_capacity: 0.05,
        energy_consumption: 0.05,
        cost_within_budget: 0.03,
        source_credibility_boost: 0.025,
        recency_bonus: 0.025,
      } // sum = 1.0 ✓
    case 'closure':
      return {
        opening_hours_margin: 0.30,
        distance: 0.20,
        rating: 0.15,
        weather_compatibility: 0.10,
        crowd_capacity: 0.08,
        energy_consumption: 0.05,
        group_preference_match: 0.05,
        review_count: 0.04,
        cost_within_budget: 0.02,
        source_credibility_boost: 0.01,
        recency_bonus: 0.00,
      } // sum = 1.0 ✓
    case 'fatigue':
      return {
        energy_consumption: 0.30,
        distance: 0.20,
        crowd_capacity: 0.15,
        rating: 0.12,
        opening_hours_margin: 0.10,
        weather_compatibility: 0.05,
        group_preference_match: 0.05,
        review_count: 0.02,
        cost_within_budget: 0.01,
        source_credibility_boost: 0.00,
        recency_bonus: 0.00,
      } // sum = 1.0 ✓
  }
}

function matchGroupPreferences(poi: POICandidate, preferences: string[]): number {
  if (!preferences?.length) return 0.5
  const matches = poi.decision_tags.vibe.filter((v) => preferences.includes(v)).length
  return Math.min(matches / preferences.length, 1)
}

export interface ScoredCandidate extends POICandidate {
  multi_criteria_score: number
  score_breakdown: {
    rating_score: number
    distance_score: number
    hours_margin_score: number
    weather_compatibility_score: number
    source_credibility_score: number
    recency_score: number
  }
}

export function scoreCandidate(
  poi: POICandidate,
  weights: MultiCriteriaWeights,
  context: VerificationContext,
): ScoredCandidate {
  const ratingScore      = (poi.rating / 5) * weights.rating * 100
  const reviewScore      = (Math.log(poi.review_count + 1) / Math.log(1000)) * weights.review_count * 100
  const distanceScore    = (1 - Math.min(poi.distance_km, 5) / 5) * weights.distance * 100
  const hoursScore       = Math.min(poi.opening_hours_margin_minutes / 60, 1) * weights.opening_hours_margin * 100
  const budgetScore      = (poi.cost_within_budget ? 1 : 0) * weights.cost_within_budget * 100
  const weatherScore     = poi.weather_compatibility * weights.weather_compatibility * 100
  const crowdScore       = (1 - poi.crowd_level) * weights.crowd_capacity * 100
  const energyScore      = (1 - poi.energy_consumption / 100) * weights.energy_consumption * 100
  const prefScore        = matchGroupPreferences(poi, context.group_preferences ?? []) * weights.group_preference_match * 100
  const credibilityScore = (poi.source_reliability_score ?? 0) * weights.source_credibility_boost * 100

  const daysSinceUpdate  = (Date.now() - new Date(poi.last_verified_at).getTime()) / 86_400_000
  const recencyScore     = (1 - Math.min(daysSinceUpdate / 180, 1)) * weights.recency_bonus * 100

  const total = Math.min(
    ratingScore + reviewScore + distanceScore + hoursScore + budgetScore +
    weatherScore + crowdScore + energyScore + prefScore + credibilityScore + recencyScore,
    100,
  )

  return {
    ...poi,
    multi_criteria_score: Math.round(total * 10) / 10,
    score_breakdown: {
      rating_score: Math.round(ratingScore * 10) / 10,
      distance_score: Math.round(distanceScore * 10) / 10,
      hours_margin_score: Math.round(hoursScore * 10) / 10,
      weather_compatibility_score: Math.round(weatherScore * 10) / 10,
      source_credibility_score: Math.round(credibilityScore * 10) / 10,
      recency_score: Math.round(recencyScore * 10) / 10,
    },
  }
}

export function rankCandidates(
  candidates: POICandidate[],
  context: VerificationContext,
): ScoredCandidate[] {
  const weights = context.scenario
    ? adjustWeightsForScenario(context.scenario)
    : DEFAULT_WEIGHTS

  return candidates
    .map((c) => scoreCandidate(c, weights, context))
    .sort((a, b) => b.multi_criteria_score - a.multi_criteria_score)
}
