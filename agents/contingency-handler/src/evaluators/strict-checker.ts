import type {
  ContingencyConfig,
  ContingencyEvent,
  POI,
} from '../types'

export interface StrictCheckResult {
  qualified: POI[]
  disqualified: { poi_id: string; reason: string }[]
}

// Strict rule-based filter — runs before scoring.
// Removes overcrowded / closed / stale / low-rated candidates.
// For weather events, also drops outdoor POIs.
export function performStrictCheck(
  candidates: POI[],
  event: ContingencyEvent,
  config: ContingencyConfig,
): StrictCheckResult {
  const qualified: POI[] = []
  const disqualified: { poi_id: string; reason: string }[] = []

  for (const poi of candidates) {
    const reasons: string[] = []

    if (poi.current_crowd_level === 'extremely_busy') {
      reasons.push('人潮爆滿')
    }
    if (poi.opening_hours_margin_minutes !== undefined && poi.opening_hours_margin_minutes < 5) {
      reasons.push('即將打烊')
    }
    if (
      poi.last_info_update_age_days !== undefined &&
      poi.last_info_update_age_days > config.max_info_age_days
    ) {
      reasons.push(`資訊超過 ${config.max_info_age_days} 天未更新`)
    }
    if (poi.business_status === 'CLOSED_PERMANENTLY' || poi.business_status === 'CLOSED_TEMPORARILY') {
      reasons.push(poi.business_status === 'CLOSED_PERMANENTLY' ? '永久歇業' : '臨時休業')
    }
    if (poi.rating !== undefined && poi.rating < 3.0) {
      reasons.push('評分過低')
    }

    // Event-specific rules
    if (event.kind === 'weather' && (event.type === 'heavy_rain' || event.type === 'high_temperature')) {
      if (poi.space_type === 'outdoor') {
        reasons.push('開放式戶外，天氣不適合')
      }
    }
    if (event.kind === 'venue' && event.venue_id === poi.poi_id) {
      reasons.push('即為發生事件之景點')
    }

    if (reasons.length === 0) {
      qualified.push(poi)
    } else {
      disqualified.push({ poi_id: poi.poi_id, reason: reasons.join(' | ') })
    }
  }

  return { qualified, disqualified }
}
