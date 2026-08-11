import type {
  ContingencyConfig,
  ExpectedValueResult,
  POI,
  WeatherEvent,
} from '../types'
import { ALPHA_MAP, LEVEL_SCORES } from '../types'

/**
 * 期望值模型。
 *
 * ## 原公式（只有降雨）
 *
 *     EV = P_fine × L + P_rain × (L × α)
 *
 * ## 現行公式（2026-08-04 起，加入熱度）
 *
 * 改寫成「損失」的形式，把降雨與高溫視為**獨立**的兩個折損來源：
 *
 *     loss_rain = P_rain × (1 − α)
 *     loss_heat = H     × (1 − α)
 *     loss      = 1 − (1 − loss_rain) × (1 − loss_heat)
 *     EV        = L × (1 − loss)
 *
 * ⚠️ **這是原公式的推廣，不是替換**：H = 0 時可代數化簡回原式——
 *
 *     EV = L × (1 − P_rain(1−α))
 *        = L − L·P_rain + L·P_rain·α
 *        = (1 − P_rain)·L + P_rain·(L × α)
 *        = P_fine × L + P_rain × (L × α)   ✅ 與原式完全相同
 *
 * 所以「沒有高溫」的既有情境行為**一個字都不會變**，測試可據此驗證。
 *
 * ## 為什麼要加熱度項
 *
 * 在此之前 EV 只吃降雨機率，`high_temperature` 事件算出來的 `score_drop` 恆為 0，
 * **永遠不會超過門檻、永遠不會觸發應變**——偵測器辛苦判定的高溫事件到了這裡等於不存在。
 *
 * ## null 的處理
 *
 * `P_rain` 或 `H` 為 null ＝ **未取得**，不是 0。以 0 參與計算是為了讓另一項仍能運作，
 * 但 `inputs_known` 會如實記錄，敘述層不得把「不知道」講成「天氣良好」（SRS BFR20）。
 * 兩項皆未取得時回傳 EV/drop 為 null、`should_trigger_contingency: false`、`confidence: 0`。
 */
export function calculateExpectedValue(
  currentPoi: POI,
  weatherEvent: WeatherEvent,
  config: ContingencyConfig,
): ExpectedValueResult {
  const L = LEVEL_SCORES[currentPoi.level]
  const alpha = ALPHA_MAP[currentPoi.space_type] ?? 0.5

  const P_rain = weatherEvent.rainfall_probability === null
    ? null
    : clamp01(weatherEvent.rainfall_probability)
  const H = heatImpactFactor(
    weatherEvent.apparent_temperature_celsius,
    weatherEvent.temperature_celsius,
  )

  const inputs_known = { rainfall: P_rain !== null, heat: H !== null }

  // 兩項輸入都沒有 → 這條公式無法計算。不要回傳一個看起來正常的 0。
  if (P_rain === null && H === null) {
    return {
      original_poi_level: currentPoi.level,
      original_poi_score: L,
      rainfall_probability: null,
      fine_probability: null,
      weather_impact_factor: alpha,
      heat_impact_factor: null,
      expected_value_current: null,
      score_drop: null,
      contingency_threshold: config.contingency_threshold,
      should_trigger_contingency: false,
      confidence: 0,
      inputs_known,
    }
  }

  const lossRain = (P_rain ?? 0) * (1 - alpha)
  const lossHeat = (H ?? 0) * (1 - alpha)
  const loss = 1 - (1 - lossRain) * (1 - lossHeat)

  const EV = L * (1 - loss)
  const drop = L - EV

  // 資料來源品質 × 輸入完整度。少一項輸入就少一分把握——
  // 這個數字會被下游拿去講「我們有多確定」，不能因為算得出來就宣稱高信心。
  const base = weatherEvent.data_source === 'cwa' ? 0.9 : 0.6
  const bothKnown = inputs_known.rainfall && inputs_known.heat
  const confidence = bothKnown ? base : round2(base * 0.7)

  return {
    original_poi_level: currentPoi.level,
    original_poi_score: L,
    rainfall_probability: P_rain,
    fine_probability: P_rain === null ? null : 1 - P_rain,
    weather_impact_factor: alpha,
    heat_impact_factor: H,
    expected_value_current: round1(EV),
    score_drop: round1(drop),
    contingency_threshold: config.contingency_threshold,
    should_trigger_contingency: drop > config.contingency_threshold,
    confidence,
    inputs_known,
  }
}

/**
 * 熱度衝擊係數 H。以**體感溫度**為準，取不到才退回氣溫——
 * 體感溫度才是「人在戶外會不會出事」的正確輸入。
 *
 * 兩者皆 null 時回 `null`＝**無法判定**，不是「不熱」。
 * 門檻與 `weather-detector.ts` 的 `highTemperatureSeverity()` 一致（35 / 38）。
 */
export function heatImpactFactor(
  apparent: number | null,
  raw: number | null,
): number | null {
  const t = apparent ?? raw
  if (t === null) return null
  if (t >= 38) return 0.8
  if (t >= 35) return 0.5
  return 0
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}
