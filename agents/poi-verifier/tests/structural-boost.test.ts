/**
 * structural-boost.test.ts — 語意搜尋的結構加權規則
 *
 * 守護兩件事：
 *
 * 1. **場景規則本身**（下雨推室內、L0 不自動替換…）——這是應變敘事的核心，
 *    寫錯會讓整個「情境適配」的主張失效，而且從畫面上看不出來。
 *
 * 2. **可信度真的有參與排序**（2026-08-02 新增）。在此之前 applyStructuralBoost
 *    完全不讀 reliability_score：explore 頁頂端秀「平均可信度 N%」，但使用者
 *    一輸入查詢，三源核驗 0.855 與單源 0.35 的景點排序完全一樣——系統宣稱
 *    可信度重要，卻沒有拿它排序（只有空查詢的 list 模式有 ORDER BY）。
 *
 * 量級是刻意壓小的：可信度項最大 ±0.15，不可蓋過「下雨要室內」的 +1.0。
 * 測試會驗證這個相對關係，避免日後調參把場景判斷淹掉。
 *
 * 執行：npx ts-node tests/structural-boost.test.ts
 */

import { applyStructuralBoost, type BoostMetadata } from '../../../src/lib/structural-boost'

let pass = 0, fail = 0
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}\n       got : ${g}\n       want: ${w}`) }
}
function approx(label: string, got: number, want: number, tol = 1e-9) {
  if (Math.abs(got - want) <= tol) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}\n       got : ${got}\n       want: ${want}`) }
}

// metadata 只帶測試需要的欄位；其餘走預設分支
function row(meta: BoostMetadata = {}, description = '') {
  return { metadata: meta, description }
}

// ── 1. 場景規則 ────────────────────────────────────────────────────────────

console.log('\n[1] 場景加權規則')

eq('L0 絕對錨點降權 −0.5',
  applyStructuralBoost(row({ level: 0 })).boost, -0.5)

eq('下雨 × 室內 → +1.0',
  applyStructuralBoost(row({ level: 2, is_indoor: true }), 'heavy_rain').boost, 1.0)

eq('下雨 × 高天氣敏感戶外 → −1.0',
  applyStructuralBoost(row({ level: 2, is_indoor: false, weather_sensitivity: 'high' }), 'heavy_rain').boost, -1.0)

eq('下雨 × 中天氣敏感 → −0.3',
  applyStructuralBoost(row({ level: 2, is_indoor: false, weather_sensitivity: 'medium' }), 'heavy_rain').boost, -0.3)

eq('景點關閉場景 × L2 → +0.5',
  applyStructuralBoost(row({ level: 2 }), 'closure').boost, 0.5)

eq('疲勞場景 × 低敏感室內 → +0.8',
  applyStructuralBoost(row({ level: 2, is_indoor: true, weather_sensitivity: 'low' }), 'fatigue').boost, 0.8)

// ── 2. 可信度加權（本次新增）────────────────────────────────────────────────

console.log('\n[2] 可信度真的有參與排序')

// 沒有 reliability_score 時完全不動（靜態資料／未驗證景點不因缺資料被懲罰）
eq('缺 reliability_score → 不加不減',
  applyStructuralBoost(row({ level: 2 })).boost, 0)

approx('reliability 0.5（中性）→ 0',
  applyStructuralBoost(row({ level: 2, reliability_score: 0.5 })).boost, 0)

approx('reliability 0.98（三源核驗）→ +0.144',
  applyStructuralBoost(row({ level: 2, reliability_score: 0.98 })).boost, 0.144)

approx('reliability 0.35（單源）→ −0.045',
  applyStructuralBoost(row({ level: 2, reliability_score: 0.35 })).boost, -0.045)

// 這一組是重點：高可信度必須真的排在低可信度前面
const high = applyStructuralBoost(row({ level: 2, reliability_score: 0.855 })).boost
const low = applyStructuralBoost(row({ level: 2, reliability_score: 0.35 })).boost
eq('三源核驗 0.855 排序高於單源 0.35（修復前兩者完全相同）', high > low, true)

console.log('\n[2b] 加權理由要能解釋給使用者看')
eq('高可信度會附理由',
  applyStructuralBoost(row({ level: 2, reliability_score: 0.98 })).reasons
    .some(r => r.includes('可信度高')), true)
eq('低可信度會附理由',
  applyStructuralBoost(row({ level: 2, reliability_score: 0.2 })).reasons
    .some(r => r.includes('可信度偏低')), true)
// 接近中性時不要製造雜訊
eq('可信度接近中性時不附理由',
  applyStructuralBoost(row({ level: 2, reliability_score: 0.55 })).reasons.length, 0)

// ── 3. 量級關係：可信度不可蓋過場景判斷 ─────────────────────────────────────
//
// 這是最重要的一組。若日後有人把可信度權重調大，「下雨要推室內」會被
// 「這個戶外景點驗證得比較完整」蓋過去——那正好毀掉應變的核心主張。

console.log('\n[3] 量級：可信度不可蓋過場景判斷')

// 極端情況：可信度最高的戶外高敏感景點 vs 可信度最低的室內景點，下雨時
const bestOutdoor = applyStructuralBoost(
  row({ level: 2, is_indoor: false, weather_sensitivity: 'high', reliability_score: 1.0 }),
  'heavy_rain',
).boost
const worstIndoor = applyStructuralBoost(
  row({ level: 2, is_indoor: true, reliability_score: 0.0 }),
  'heavy_rain',
).boost
eq('下雨時：可信度 0 的室內景點仍排在可信度 1.0 的高敏感戶外景點之前',
  worstIndoor > bestOutdoor, true)

eq('可信度項的絕對值上限不超過 0.15',
  Math.abs(applyStructuralBoost(row({ level: 2, reliability_score: 1.0 })).boost) <= 0.15, true)

// ── 4. 未判定（null）不可被當成戶外 ────────────────────────────────────────

console.log('\n[4] is_indoor 未判定時的行為')

// metadata.is_indoor 為 null（LLM 未判定）時，`meta.is_indoor ?? false` 會落到
// 「非室內」分支。這在排序上是可接受的（不給室內加分），但不該給予
// 「高天氣敏感戶外」的重懲——因為我們並不知道它是不是戶外。
const nullIndoor = applyStructuralBoost(
  row({ level: 2, is_indoor: null, weather_sensitivity: null }),
  'heavy_rain',
).boost
eq('is_indoor=null 且 weather=null → 不加室內分、也不重懲（落在 medium 的 −0.3）',
  nullIndoor, -0.3)

console.log(`\n${'═'.repeat(55)}`)
console.log(`通過 ${pass} 項，失敗 ${fail} 項`)
console.log(`${'═'.repeat(55)}\n`)
process.exit(fail > 0 ? 1 : 0)
