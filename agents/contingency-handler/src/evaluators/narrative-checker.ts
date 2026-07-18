import type { ContingencyCandidate, POI } from '../types'

// ── 反思迴路的「生成後自檢」──────────────────────────────────────────────
//
// strict-checker 是「生成前」過濾候選池；本檢查器是「生成後」檢查 LLM 敘述，
// 兩者合起來才是完整的 Reflection Loop：
//
//   generate 敘述 → checkNarrative → 不合格 → 理由回填 prompt → 重生成
//                                  → 用盡次數 → 退回規則保底（strategy.description）
//
// LLM 在本系統只負責敘述表述（不做決策），所以生成後要防的是：
//   1. 幻覺景點——提及不存在於推薦清單的景點名（憑訓練資料編出來的）
//   2. 推薦已被 strict-checker 淘汰的景點（歇業/打烊/天氣不合…）
//   3. 格式違規——markdown、空輸出、超長（prompt 要求 1–2 句純文字）

export interface NarrativeCheckContext {
  currentPoi: POI
  recommended: ContingencyCandidate[]
  disqualified: { poi_id: string; reason: string }[]
  pool: POI[]                  // 完整候選池（含被淘汰者），用名字比對敘述內容
}

export interface NarrativeCheckResult {
  ok: boolean
  violations: string[]
}

const MAX_NARRATIVE_LENGTH = 200   // prompt 要求 1–2 句話；超過視為未遵守

// 景點名稱變體：全名 + 去掉括號註記的基底名（例「野柳海洋世界 (預約席)」→「野柳海洋世界」）
function nameVariants(name: string): string[] {
  const variants = [name]
  const base = name.split('（')[0].split(' (')[0].trim()
  if (base && base !== name) variants.push(base)
  return variants
}

function mentions(text: string, name: string): boolean {
  return nameVariants(name).some(v => v.length >= 2 && text.includes(v))
}

export function checkNarrative(
  text: string,
  ctx: NarrativeCheckContext,
): NarrativeCheckResult {
  const violations: string[] = []

  // ── 格式檢查 ──
  const trimmed = text.trim()
  if (!trimmed) {
    return { ok: false, violations: ['敘述為空'] }
  }
  if (trimmed.length > MAX_NARRATIVE_LENGTH) {
    violations.push(`敘述超過 ${MAX_NARRATIVE_LENGTH} 字（實際 ${trimmed.length} 字），未遵守 1–2 句話的要求`)
  }
  if (trimmed.includes('**') || /^\s*[#*-]\s/m.test(trimmed)) {
    violations.push('敘述含 markdown 格式，要求為純文字')
  }

  // ── 景點名檢查：提及的名字必須在封閉集合內 ──
  const disqualifiedIds = new Map(ctx.disqualified.map(d => [d.poi_id, d.reason]))
  const recommendedIds = new Set(ctx.recommended.map(c => c.poi_id))

  for (const poi of ctx.pool) {
    if (!mentions(trimmed, poi.name)) continue
    if (poi.poi_id === ctx.currentPoi.poi_id) continue          // 提原景點 OK
    if (recommendedIds.has(poi.poi_id)) continue                 // 提推薦候選 OK
    const reason = disqualifiedIds.get(poi.poi_id)
    if (reason !== undefined) {
      violations.push(`提及已被反思審查淘汰的景點「${poi.name}」（淘汰理由：${reason}）`)
    } else {
      violations.push(`提及不在推薦清單中的景點「${poi.name}」`)
    }
  }

  return { ok: violations.length === 0, violations }
}
