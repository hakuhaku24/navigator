/**
 * structural-boost.ts — 語意搜尋結果的結構加權規則
 *
 * 單獨成檔的理由：這是排序策略的唯一決策點（「下雨要推室內」這類核心行為
 * 全靠它），必須能被單元測試直接涵蓋。`poi-search.ts` 會 import `@/data/poi-kb`
 * 之類的路徑別名，在 agents/poi-verifier 的 ts-node 環境下解析不了，
 * 所以本檔刻意零 import。
 *
 * 對應測試：agents/poi-verifier/tests/structural-boost.test.ts
 *
 * ⚠️ 與 agents/poi-verifier/rag-reranker.ts 的關係（2026-08-02）：
 * 場景加權規則（L0 降權、下雨室內優先…）兩邊維持一致，改動請同步。
 * 但有兩處已知分歧，不是疏漏：
 *
 *   1. 可信度加權只在這裡有。rag-reranker 的資料源是 basic-rag 建的本地索引，
 *      `HybridSearchResult` 沒有 reliability_score 欄位；且它是純離線 CLI，
 *      沒有任何 route 或頁面呼叫（見 CLAUDE.md §9）。
 *   2. 量級不同。rag-reranker 用 `hybrid_score + boost * 0.001` 把加成縮到與
 *      RRF 分數（~0.001–0.01）同一個數量級；這裡是直接相加，所以任何非零的
 *      場景加權都會支配排序，檢索名次退化成組內平手鍵。這是既有行為，
 *      要改動等於改變整個排序策略，需另行決定。
 */

export type Scenario = 'heavy_rain' | 'closure' | 'fatigue'

/** 只取加權需要的 metadata 欄位，避免耦合到完整的 RpcMetadata */
export interface BoostMetadata {
  /** null ＝ 未判定（LLM 加值失敗），不是「戶外」 */
  is_indoor?: boolean | null
  weather_sensitivity?: string | null
  level?: number | null
  /** poi-verifier 的多來源交叉驗證分數（0–1） */
  reliability_score?: number | null
  [key: string]: unknown
}

export interface BoostInput {
  metadata: BoostMetadata
  description: string | null
}

export function applyStructuralBoost(
  row: BoostInput,
  scenario?: Scenario,
  vibe_tags?: string[],
): { boost: number; reasons: string[] } {
  const meta = row.metadata
  const is_indoor = meta.is_indoor ?? false
  const weather_sensitivity = meta.weather_sensitivity ?? 'medium'
  const level = meta.level ?? 2

  let boost = 0
  const reasons: string[] = []

  // L0 不能自動替換，在備援搜尋中往後推
  if (level === 0) {
    boost -= 0.5
    reasons.push('L0 絕對錨點：不應自動替換')
  }

  if (scenario === 'heavy_rain') {
    if (is_indoor) {
      boost += 1.0
      reasons.push('下雨場景：室內景點強力優先')
    } else if (weather_sensitivity === 'high') {
      boost -= 1.0
      reasons.push('下雨場景：高天氣敏感戶外景點降權')
    } else if (weather_sensitivity === 'medium') {
      boost -= 0.3
      reasons.push('下雨場景：中天氣敏感景點輕微降權')
    }
  }

  if (scenario === 'closure') {
    if (level === 2 || level === 3) {
      boost += 0.5
      reasons.push('景點關閉場景：L2/L3 候補池優先')
    }
  }

  if (scenario === 'fatigue') {
    if (weather_sensitivity === 'low' && is_indoor) {
      boost += 0.8
      reasons.push('疲勞場景：輕鬆室內景點優先')
    }
  }

  if (vibe_tags && vibe_tags.length > 0) {
    const desc = (row.description ?? '').toLowerCase()
    const matched = vibe_tags.filter(tag => desc.includes(tag.toLowerCase()))
    if (matched.length > 0) {
      boost += matched.length * 0.2
      reasons.push(`偏好標籤命中：${matched.join('、')}`)
    }
  }

  // ── 可信度加權（2026-08-02 新增）──────────────────────────────────────────
  // 在此之前這裡完全不讀 reliability_score：explore 頁頂端秀「平均可信度 N%」，
  // 但使用者一輸入查詢，三源核驗 0.855 與單源 0.35 的景點排序完全一樣——
  // 系統宣稱可信度重要，卻沒有真的拿它排序（只有空查詢的 list 模式有 ORDER BY）。
  //
  // 量級刻意壓小到 ±0.15：場景 boost 是 ±0.3~1.0，可信度不可蓋過
  // 「下雨要推室內」這種核心判斷，只在場景條件相同時用來分高下。
  const reliability = meta.reliability_score
  if (typeof reliability === 'number') {
    const delta = (reliability - 0.5) * 0.3   // 0.35 → −0.045；0.98 → +0.144
    boost += delta
    if (Math.abs(delta) >= 0.05) {
      reasons.push(
        delta > 0
          ? `多來源驗證可信度高（${Math.round(reliability * 100)}%）`
          : `可信度偏低（${Math.round(reliability * 100)}%）`,
      )
    }
  }

  return { boost, reasons }
}
