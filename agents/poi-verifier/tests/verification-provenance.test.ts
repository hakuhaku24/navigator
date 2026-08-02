/**
 * verification-provenance.test.ts — 資料可信度與降級偵測
 *
 * 這份測試守護的是 2026-08-02 掃描出來的那個 bug 不再發生：
 *
 *   Gemini 免費配額（RPD 20）在第 15 筆左右耗盡 → enrich() 走降級分支回 facts:null
 *   → agent.ts 用 `?? false` / `?? 'medium'` 把 null 補成看似合理的假值
 *   → 一路寫進 metadata、tags 與 embedding 文字
 *   → 線上 45 筆有 41 筆 is_indoor=false（含博物館、飯店、茶樓）
 *   → 應變管線下雨路徑是 `metadata @> {"is_indoor": true}` 硬性篩選
 *   → 僅存的 4 筆室內景點全在北海岸
 *   → **陽明山與東北角下雨時候選池為 0 筆，旗艦功能在 2/3 區域失效**
 *
 * 三條防線各自對應下面三組測試：
 *   1. 未判定必須保持 null（不可補預設值）        → withMetadataDefaults / metadataFromVerifierOutput
 *   2. 未驗證必須在資料庫裡看得見                 → deriveVerificationTier
 *   3. 連續降級必須中止批次（不可靜默量產垃圾）   → shouldAbortBatch
 *
 * 執行：npx ts-node tests/verification-provenance.test.ts
 */

import {
  withMetadataDefaults,
  metadataFromVerifierOutput,
  deriveVerificationTier,
  shouldAbortBatch,
  MAX_CONSECUTIVE_FALLBACKS,
  SMART_DEFAULTS,
} from '../src/canonical-poi'
import type { PoiVerifierOutput } from '../src/types'

let pass = 0, fail = 0
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}\n       got : ${g}\n       want: ${w}`) }
}

// ── 測試替身 ────────────────────────────────────────────────────────────────

/** 造一筆 verifier 輸出；預設是「LLM 成功、雙來源」的正常情況 */
function makeOutput(over: {
  llm_source?: PoiVerifierOutput['llm_source']
  is_indoor?: boolean | null
  weather_sensitivity?: 'low' | 'medium' | 'high' | null
  sources?: string[]
  suggested_level?: 0 | 1 | 2 | 3
} = {}): PoiVerifierOutput {
  return {
    poi_input: {
      name: '測試景點',
      location: { latitude: 25.2, longitude: 121.6 },
    },
    verification_result: {
      exists: true,
      sources: (over.sources ?? ['google_places', 'osm']) as never,
      reliability_score: 0.8,
      facts: {
        official_name: '測試景點',
        address: '新北市萬里區',
        hours: '全天開放',
        average_stay_minutes: 90,
        last_verified_at: '2026-08-02T00:00:00.000Z',
        is_indoor: over.is_indoor === undefined ? true : over.is_indoor,
        weather_sensitivity:
          over.weather_sensitivity === undefined ? 'low' : over.weather_sensitivity,
      },
    },
    enrichment_result: {
      suggested_level: over.suggested_level ?? 1,
      level_reasoning: '測試理由',
      backup_logic: null,
    },
    cost_estimate: { tokens_used: 1200, estimated_cost_ntd: 0.01 },
    llm_source: over.llm_source ?? 'gemini',
  } as PoiVerifierOutput
}

// ── 1. 未判定必須保持 null ──────────────────────────────────────────────────
//
// 這是最關鍵的一組。`false` 與 `null` 在 JSON 裡都是「非真值」，很容易被當成
// 同一回事——但對應變管線是天差地別：`metadata @> {"is_indoor": true}` 不會
// 匹配 null（正確：未知的不當室內用），而 false 會讓這筆被永久釘死成戶外。

console.log('\n[1] 未判定必須保持 null（不可補預設值）')

eq('SMART_DEFAULTS.is_indoor 必須是 null 而非 false',
  SMART_DEFAULTS.is_indoor, null)

eq('SMART_DEFAULTS.weather_sensitivity 必須是 null 而非 medium',
  SMART_DEFAULTS.weather_sensitivity, null)

eq('withMetadataDefaults：完全沒給值時 is_indoor 保持 null',
  withMetadataDefaults({}).is_indoor, null)

eq('withMetadataDefaults：完全沒給值時 weather_sensitivity 保持 null',
  withMetadataDefaults({}).weather_sensitivity, null)

eq('withMetadataDefaults：明確傳 null 時保持 null（不被預設值蓋掉）',
  withMetadataDefaults({ is_indoor: null }).is_indoor, null)

// false 是有效的判定結果（「確實是戶外」），必須與 null 區分，不可被吃掉
eq('withMetadataDefaults：明確傳 false 時保持 false（false 是判定結果，不是缺值）',
  withMetadataDefaults({ is_indoor: false }).is_indoor, false)

eq('withMetadataDefaults：明確傳 true 時保持 true',
  withMetadataDefaults({ is_indoor: true }).is_indoor, true)

// 其他欄位仍應照常補預設值——這次的修正只針對「只有 LLM 判得出來」的兩個欄位
eq('withMetadataDefaults：level 仍照常補預設 2',
  withMetadataDefaults({}).level, 2)
eq('withMetadataDefaults：average_stay_minutes 仍照常補預設 90',
  withMetadataDefaults({}).average_stay_minutes, 90)

console.log('\n[1b] metadataFromVerifierOutput 端到端保持 null')

eq('LLM 判定為室內 → true 一路帶到 metadata',
  metadataFromVerifierOutput(makeOutput({ is_indoor: true })).is_indoor, true)

eq('LLM 判定為戶外 → false 一路帶到 metadata',
  metadataFromVerifierOutput(makeOutput({ is_indoor: false })).is_indoor, false)

eq('LLM 未判定 → null 一路帶到 metadata（不得變成 false）',
  metadataFromVerifierOutput(makeOutput({ is_indoor: null })).is_indoor, null)

eq('LLM 未判定 → weather_sensitivity 為 null（不得變成 medium）',
  metadataFromVerifierOutput(makeOutput({ weather_sensitivity: null })).weather_sensitivity,
  null)

// ── 2. 未驗證必須在資料庫裡看得見 ───────────────────────────────────────────

console.log('\n[2] deriveVerificationTier 分層判定')

eq('LLM 降級 → unverified',
  deriveVerificationTier({
    llmSource: 'fallback', sourceCount: 2,
    hasAuthoritativeSource: false, hasResolvedConflict: false,
  }), 'unverified')

// 這條是重點：來源再多，只要 enrich 掛了，level／is_indoor 仍是預設值不是判斷。
// 不能因為來源數多就給高分——否則 2026-05-06 那批（Google+OSM+blog 三來源但
// enrich 全掛）會被誤判成 tier_2，比原本的 bug 還糟。
eq('LLM 降級即使有三來源＋官方＋衝突裁決，仍是 unverified（不得被來源數蓋過）',
  deriveVerificationTier({
    llmSource: 'fallback', sourceCount: 3,
    hasAuthoritativeSource: true, hasResolvedConflict: true,
  }), 'unverified')

eq('單一來源（TDX 純匯入）→ tier_0',
  deriveVerificationTier({
    llmSource: 'gemini', sourceCount: 1,
    hasAuthoritativeSource: true, hasResolvedConflict: false,
  }), 'tier_0')

eq('零來源 → tier_0',
  deriveVerificationTier({
    llmSource: 'gemini', sourceCount: 0,
    hasAuthoritativeSource: false, hasResolvedConflict: false,
  }), 'tier_0')

eq('雙來源交叉驗證 → tier_1',
  deriveVerificationTier({
    llmSource: 'gemini', sourceCount: 2,
    hasAuthoritativeSource: false, hasResolvedConflict: false,
  }), 'tier_1')

eq('雙來源＋官方來源但無衝突裁決 → 仍是 tier_1',
  deriveVerificationTier({
    llmSource: 'gemini', sourceCount: 2,
    hasAuthoritativeSource: true, hasResolvedConflict: false,
  }), 'tier_1')

eq('雙來源＋衝突裁決但無官方來源 → 仍是 tier_1',
  deriveVerificationTier({
    llmSource: 'gemini', sourceCount: 2,
    hasAuthoritativeSource: false, hasResolvedConflict: true,
  }), 'tier_1')

eq('雙來源＋官方＋衝突裁決 → tier_2',
  deriveVerificationTier({
    llmSource: 'gemini', sourceCount: 2,
    hasAuthoritativeSource: true, hasResolvedConflict: true,
  }), 'tier_2')

eq('claude 作為備援 LLM 也算真實驗證（非 fallback）',
  deriveVerificationTier({
    llmSource: 'claude', sourceCount: 2,
    hasAuthoritativeSource: false, hasResolvedConflict: false,
  }), 'tier_1')

// llm_source 是 2026-07-26 才加的欄位，舊資料是 undefined。
// undefined ≠ 'fallback'，所以不會被誤判成 unverified——這是刻意的：
// 我們無法從 undefined 推論它當初有沒有驗證過，不該憑空給它扣分或加分。
eq('llm_source 為 undefined（2026-07-26 前的舊資料）→ 依來源數判定，不強制 unverified',
  deriveVerificationTier({
    llmSource: undefined, sourceCount: 2,
    hasAuthoritativeSource: false, hasResolvedConflict: false,
  }), 'tier_1')

eq('llm_source 為 null → 同上',
  deriveVerificationTier({
    llmSource: null, sourceCount: 1,
    hasAuthoritativeSource: false, hasResolvedConflict: false,
  }), 'tier_0')

// ── 3. 連續降級必須中止批次 ─────────────────────────────────────────────────

console.log('\n[3] shouldAbortBatch 中止門檻')

eq('門檻常數為 3', MAX_CONSECUTIVE_FALLBACKS, 3)

eq('0 筆連續降級 → 不中止', shouldAbortBatch(0), false)

// 偶發的單筆 429／逾時不該中止整批，否則批次會過度脆弱
eq('1 筆連續降級 → 不中止（容許偶發失敗）', shouldAbortBatch(1), false)
eq('2 筆連續降級 → 不中止', shouldAbortBatch(2), false)

eq('3 筆連續降級 → 中止', shouldAbortBatch(3), true)
eq('4 筆連續降級 → 中止', shouldAbortBatch(4), true)

eq('可覆寫門檻（測試／小批次用）', shouldAbortBatch(1, 1), true)
eq('覆寫門檻後未達標仍不中止', shouldAbortBatch(1, 2), false)

// ── 結果 ────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(55)}`)
console.log(`通過 ${pass} 項，失敗 ${fail} 項`)
console.log(`${'═'.repeat(55)}\n`)
process.exit(fail > 0 ? 1 : 0)
