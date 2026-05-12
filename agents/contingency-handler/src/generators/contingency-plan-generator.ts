import type {
  ContingencyCandidate,
  ContingencyConfig,
  ContingencyEvent,
  ContingencyPlan,
  ExpectedValueResult,
  ImpactAssessment,
  LLMClient,
  MultiCriteriaWeights,
  POI,
  StrategyType,
} from '../types'
import { DEFAULT_WEIGHTS, LEVEL_SCORES } from '../types'
import { performStrictCheck } from '../evaluators'
import { haversineKm } from '../poi-adapter'

// Event-specific weight overrides (each set must sum to 1.0).
function getWeightsForEvent(event: ContingencyEvent): MultiCriteriaWeights {
  if (event.kind === 'weather' && (event.type === 'heavy_rain' || event.type === 'high_temperature')) {
    return {
      weather_compatibility: 0.35,
      distance: 0.15, rating: 0.15, opening_hours_margin: 0.10,
      crowd_capacity: 0.05, energy_consumption: 0.05,
      group_preference_match: 0.07, review_count: 0.05,
      cost_within_budget: 0.03, source_credibility_boost: 0.025, recency_bonus: 0.025,
    }
  }
  if (event.kind === 'venue' && event.type === 'venue_closure') {
    return {
      opening_hours_margin: 0.30,
      distance: 0.20, rating: 0.15, weather_compatibility: 0.10,
      crowd_capacity: 0.08, energy_consumption: 0.05,
      group_preference_match: 0.05, review_count: 0.04,
      cost_within_budget: 0.02, source_credibility_boost: 0.01, recency_bonus: 0.00,
    }
  }
  if (event.kind === 'group' && event.type === 'fatigue') {
    return {
      energy_consumption: 0.30,
      distance: 0.20, crowd_capacity: 0.15, rating: 0.12,
      opening_hours_margin: 0.10, weather_compatibility: 0.05,
      group_preference_match: 0.05, review_count: 0.02,
      cost_within_budget: 0.01, source_credibility_boost: 0.00, recency_bonus: 0.00,
    }
  }
  return DEFAULT_WEIGHTS
}

// Weather compatibility: indoor 100, semi 60, outdoor 20 (when event is weather).
function weatherFit(poi: POI, event: ContingencyEvent): number {
  if (event.kind !== 'weather') return 70
  const base = poi.space_type === 'indoor' ? 100 : poi.space_type === 'semi_outdoor' ? 60 : 20
  // Penalize highly weather-sensitive POIs slightly more
  const sensitivityPenalty = poi.weather_sensitivity === 'extreme' ? 15
    : poi.weather_sensitivity === 'high' ? 10
    : poi.weather_sensitivity === 'medium' ? 5 : 0
  return Math.max(0, base - sensitivityPenalty)
}

// Score a single candidate against weighted criteria (returns 0–100).
function scoreCandidate(
  poi: POI,
  currentPoi: POI,
  event: ContingencyEvent,
  weights: MultiCriteriaWeights,
): { score: number; breakdown: ContingencyCandidate['score_breakdown']; distance: number } {
  const distKm = haversineKm(currentPoi.latitude, currentPoi.longitude, poi.latitude, poi.longitude)
  const distanceScore = Math.max(0, 100 - distKm * 10)         // 0 km → 100, 10 km → 0
  const ratingScore = ((poi.rating ?? 3.5) / 5) * 100
  const reviewCount = poi.review_count ?? 0
  const reviewScore = Math.min(100, (reviewCount / 100) * 100)
  const hoursMargin = poi.opening_hours_margin_minutes ?? 240
  const hoursScore = Math.min(100, (hoursMargin / 240) * 100)
  const crowdScore = poi.current_crowd_level === 'low' ? 100
    : poi.current_crowd_level === 'moderate' ? 75
    : poi.current_crowd_level === 'high' ? 40
    : poi.current_crowd_level === 'extremely_busy' ? 0
    : 80
  const energyScore = 100 - (poi.energy_consumption ?? 40)
  const weatherScore = weatherFit(poi, event)
  const costScore = poi.cost_ntd === undefined ? 70 : Math.max(0, 100 - poi.cost_ntd / 10)
  const sourceCredScore = 70
  const recencyScore = poi.last_info_update_age_days !== undefined
    ? Math.max(0, 100 - poi.last_info_update_age_days * 2) : 70
  const groupPrefScore = 60 // placeholder — would compare poi.tags ∩ group preferences

  const score =
    weights.rating * ratingScore +
    weights.review_count * reviewScore +
    weights.distance * distanceScore +
    weights.opening_hours_margin * hoursScore +
    weights.cost_within_budget * costScore +
    weights.weather_compatibility * weatherScore +
    weights.crowd_capacity * crowdScore +
    weights.energy_consumption * energyScore +
    weights.group_preference_match * groupPrefScore +
    weights.source_credibility_boost * sourceCredScore +
    weights.recency_bonus * recencyScore

  return {
    score: Math.round(score * 10) / 10,
    distance: distKm,
    breakdown: {
      weather_fit: Math.round(weatherScore),
      distance_score: Math.round(distanceScore),
      availability_score: Math.round(hoursScore),
      crowd_capacity_score: Math.round(crowdScore),
      group_preference_match: Math.round(groupPrefScore),
      rating_score: Math.round(ratingScore),
    },
  }
}

function suitabilityReason(poi: POI, event: ContingencyEvent): string {
  if (event.kind === 'weather' && event.type === 'heavy_rain') {
    if (poi.space_type === 'indoor') return `${poi.name} 為室內景點，下雨天最適合`
    if (poi.space_type === 'semi_outdoor') return `${poi.name} 為半戶外，部分區域可避雨`
  }
  if (event.kind === 'weather' && event.type === 'high_temperature') {
    if (poi.is_indoor) return `${poi.name} 有冷氣，可避暑`
  }
  if (event.kind === 'venue' && event.type === 'venue_closure') {
    return `${poi.name} 同區域且狀態正常，可替代原行程`
  }
  return `${poi.name} 在當前事件下評分較高`
}

function selectStrategy(
  event: ContingencyEvent,
  ranked: ContingencyCandidate[],
): { type: StrategyType; description: string; impact: ImpactAssessment } {
  const top = ranked[0]
  const hasGood = !!top && top.multi_criteria_score >= 60

  if (event.kind === 'weather') {
    return hasGood
      ? { type: 'swap_poi', description: `天氣不佳，推薦替換為：${top.name}`, impact: { time_impact_minutes: 15, cost_impact_ntd: 0, group_satisfaction_impact: 'neutral' } }
      : { type: 'delay_timeslot', description: '暫無好的替代景點，建議延後時段或室內休息', impact: { time_impact_minutes: 60, cost_impact_ntd: 0, group_satisfaction_impact: 'negative' } }
  }
  if (event.kind === 'venue') {
    return hasGood
      ? { type: 'swap_poi', description: `景點關閉，推薦改去：${top.name}`, impact: { time_impact_minutes: 20, cost_impact_ntd: 0, group_satisfaction_impact: 'neutral' } }
      : { type: 'skip_activity', description: '無合適替代，建議略過此景點', impact: { time_impact_minutes: 0, cost_impact_ntd: 0, group_satisfaction_impact: 'negative' } }
  }
  if (event.kind === 'group') {
    return {
      type: 'skip_activity',
      description: '成員體力不足，建議安排休息或縮短後段行程',
      impact: { time_impact_minutes: -30, cost_impact_ntd: 0, group_satisfaction_impact: 'positive' },
    }
  }
  if (event.kind === 'traffic') {
    return {
      type: 'route_change',
      description: '交通壅塞，建議改道或重新排序',
      impact: { time_impact_minutes: event.estimated_delay_minutes, cost_impact_ntd: 0, group_satisfaction_impact: 'negative' },
    }
  }
  return {
    type: 'delay_timeslot',
    description: '突發狀況，建議暫停並重新評估',
    impact: { time_impact_minutes: 30, cost_impact_ntd: 0, group_satisfaction_impact: 'neutral' },
  }
}

const SYSTEM_PROMPT = `你是 Navigator 旅遊系統的應變顧問。系統已用規則引擎完成事件偵測、期望值計算、嚴格篩選與多準則排序，
你的任務是：用 1–2 句話告訴使用者「為什麼需要應變、推薦做什麼」，語氣積極、強調新機會而非損失（loss aversion）。
不要重複所有數據，只挑使用者最需要知道的關鍵點。回傳純文字，無 markdown。`

async function generateNarrative(
  event: ContingencyEvent,
  evResult: ExpectedValueResult | null,
  ranked: ContingencyCandidate[],
  strategy: { type: StrategyType; description: string },
  llm: LLMClient,
): Promise<{ text: string; tokens: number; source: 'gemini' | 'claude' | 'fallback' }> {
  const topThree = ranked.slice(0, 3).map(c => `- ${c.name}（${c.distance_km.toFixed(1)} km, 分數 ${c.multi_criteria_score}）：${c.suitability_reason}`).join('\n')
  const evLine = evResult
    ? `期望值分析：原 POI L=${evResult.original_poi_score}, EV=${evResult.expected_value_current}, 落差=${evResult.score_drop}（門檻 ${evResult.contingency_threshold}）`
    : '無期望值分析（非天氣事件）'
  const userPrompt = `事件：${event.kind}/${(event as any).type ?? ''}，嚴重度 ${event.severity}
${evLine}
策略：${strategy.type} — ${strategy.description}
推薦備案：
${topThree || '（無）'}

請以積極、簡潔的中文，給使用者 1–2 句話的應變建議。`

  return llm.complete(SYSTEM_PROMPT, userPrompt)
}

export async function generateContingencyPlan(
  event: ContingencyEvent,
  currentPoi: POI,
  evResult: ExpectedValueResult | null,
  candidatePool: POI[],
  config: ContingencyConfig,
  llm: LLMClient,
): Promise<ContingencyPlan> {
  // Step 1 — strict filter
  const { qualified, disqualified } = performStrictCheck(candidatePool, event, config)

  // Step 2 — score & rank
  const weights = getWeightsForEvent(event)
  const scored: ContingencyCandidate[] = qualified.map(poi => {
    const { score, breakdown, distance } = scoreCandidate(poi, currentPoi, event, weights)
    return {
      poi_id: poi.poi_id,
      name: poi.name,
      distance_km: Math.round(distance * 10) / 10,
      level: poi.level,
      space_type: poi.space_type,
      multi_criteria_score: score,
      score_breakdown: breakdown,
      has_recent_positive_reviews: (poi.rating ?? 0) >= 4.0,
      is_verified: true,
      last_info_update_age_days: poi.last_info_update_age_days ?? 0,
      is_qualified: true,
      risk_warnings: poi.last_info_update_age_days && poi.last_info_update_age_days > 14
        ? ['資訊較久，建議致電確認']
        : undefined,
      suitability_reason: suitabilityReason(poi, event),
    }
  }).sort((a, b) => b.multi_criteria_score - a.multi_criteria_score)
    .slice(0, 5)

  // Step 3 — strategy
  const strategy = selectStrategy(event, scored)

  // Step 4 — LLM narrative (best-effort; fallback to strategy.description)
  const llmRes = await generateNarrative(event, evResult, scored, strategy, llm)
  const narrative = llmRes.text || strategy.description

  // Step 5 — assemble plan
  const triggerReason = evResult
    ? `期望值落差 ${evResult.score_drop} 超過門檻 ${evResult.contingency_threshold}，觸發應變`
    : `事件 ${(event as any).type ?? event.kind} 嚴重度 ${event.severity}，需立即處理`

  return {
    event,
    event_severity: event.severity,
    detection_timestamp: event.timestamp,
    expected_value_analysis: evResult,
    trigger_reason: triggerReason,
    checked_candidate_count: candidatePool.length,
    qualified_candidate_count: qualified.length,
    disqualified_details: disqualified,
    recommended_contingencies: scored,
    primary_recommendation: scored[0],
    strategy_type: strategy.type,
    strategy_description: strategy.description,
    impact_assessment: strategy.impact,
    user_action_required: true,
    user_options: [
      { option_id: 'accept', description: '接受推薦備案', action: 'swap_to_primary' },
      { option_id: 'browse', description: '查看所有備案', action: 'show_all_candidates' },
      { option_id: 'ignore', description: '維持原計畫', action: 'dismiss' },
    ],
    llm_narrative: narrative,
    decision_latency_ms: 0, // filled by agent.ts
    llm_tokens_used: llmRes.tokens,
    llm_source: llmRes.source,
  }
}

export { LEVEL_SCORES }
