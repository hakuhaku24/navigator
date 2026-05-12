import type {
  ContingencyConfig,
  ExpectedValueResult,
  POI,
  WeatherEvent,
} from '../types'
import { ALPHA_MAP, LEVEL_SCORES } from '../types'

// EV = P_fine × L + P_rain × (L × α)
//   L      = level score (100 / 75 / 50 / 25)
//   P_rain = rainfall probability (0–1)
//   α      = weather impact factor (indoor 0.95, semi 0.50, outdoor 0.10)
// Contingency triggers when (L - EV) > threshold.
export function calculateExpectedValue(
  currentPoi: POI,
  weatherEvent: WeatherEvent,
  config: ContingencyConfig,
): ExpectedValueResult {
  const L = LEVEL_SCORES[currentPoi.level]
  const P_rain = clamp01(weatherEvent.rainfall_probability)
  const P_fine = 1 - P_rain
  const alpha = ALPHA_MAP[currentPoi.space_type] ?? 0.5

  const EV = P_fine * L + P_rain * (L * alpha)
  const drop = L - EV

  return {
    original_poi_level: currentPoi.level,
    original_poi_score: L,
    rainfall_probability: P_rain,
    fine_probability: P_fine,
    weather_impact_factor: alpha,
    expected_value_current: round1(EV),
    score_drop: round1(drop),
    contingency_threshold: config.contingency_threshold,
    should_trigger_contingency: drop > config.contingency_threshold,
    // Confidence based on data source quality: CWA real data = 0.9, mock = 0.6
    confidence: weatherEvent.data_source === 'cwa' ? 0.9 : 0.6,
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}
