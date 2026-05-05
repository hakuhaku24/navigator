import type { POICandidate, VerificationContext, EnrichmentResult, CandidateScore } from '../types'
import { rankCandidates } from './multi-criteria-ranker'

const PROXIMITY_BY_LEVEL: Record<1 | 2 | 3, number> = {
  1: 10000,
  2: 5000,
  3: 2000,
}

type DisqualReason =
  | '人潮爆滿'
  | '即將打烊'
  | '資訊 > 30 天未更新'
  | '費用超預算'
  | '觸碰成員禁忌'
  | '信度過低'

function disqualify(
  candidate: POICandidate,
  context: VerificationContext,
): DisqualReason[] {
  const reasons: DisqualReason[] = []

  if (candidate.current_crowd_level === 'extremely_busy') {
    reasons.push('人潮爆滿')
  }
  if (candidate.opening_hours_margin_minutes < 5) {
    reasons.push('即將打烊')
  }
  if (
    candidate.last_update_date !== undefined &&
    candidate.last_update_date < Date.now() - 30 * 86_400_000 &&
    !candidate.requires_reservation
  ) {
    reasons.push('資訊 > 30 天未更新')
  }
  if (
    context.user_budget_ntd !== undefined &&
    !candidate.cost_within_budget
  ) {
    reasons.push('費用超預算')
  }
  if (candidate.touches_group_taboo) {
    reasons.push('觸碰成員禁忌')
  }
  if (candidate.source_reliability_score < 0.3) {
    reasons.push('信度過低')
  }

  return reasons
}

export function generateBackupLogic(
  level: 0 | 1 | 2 | 3,
  candidatePool: POICandidate[],
  context: VerificationContext,
): EnrichmentResult['backup_logic'] {
  // L0 = absolute anchor, no backup
  if (level === 0) return null

  const proximityThreshold = PROXIMITY_BY_LEVEL[level as 1 | 2 | 3]

  // Strict check: separate qualified from disqualified
  const qualified: POICandidate[] = []
  const disqualified: CandidateScore[] = []

  for (const c of candidatePool) {
    const reasons = disqualify(c, context)
    if (reasons.length === 0) {
      qualified.push(c)
    } else {
      disqualified.push({
        poi_id: c.poi_id,
        name: c.name,
        distance_km: c.distance_km,
        multi_criteria_score: 0,
        disqualification_reasons: reasons,
      })
    }
  }

  // Multi-criteria ranking on qualified candidates
  const scored = rankCandidates(qualified, context)

  const candidateScores: CandidateScore[] = [
    ...scored.map((s) => ({
      poi_id: s.poi_id,
      name: s.name,
      distance_km: s.distance_km,
      multi_criteria_score: s.multi_criteria_score,
      score_breakdown: s.score_breakdown,
    })),
    ...disqualified,
  ]

  const topTags = scored
    .slice(0, 3)
    .flatMap((s) => s.decision_tags?.vibe ?? [])
    .filter((v, i, arr) => arr.indexOf(v) === i)  // deduplicate
    .slice(0, 5)

  return {
    strategy_type: level <= 1 ? 'switch_time_slot' : 'swap_same_level',
    description: `備案池已根據評分、距離、營業時間、天氣相容度排序，共通過嚴格篩查 ${qualified.length} 筆`,
    candidate_pool_tags: topTags,
    proximity_threshold_meters: proximityThreshold,
    recommended_backup: scored[0]?.poi_id,
  }
}
