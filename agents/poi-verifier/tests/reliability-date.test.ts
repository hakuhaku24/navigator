/**
 * reliability-date.test.ts — 可信度計分的日期防護
 *
 * 守護 2026-08-03 重跑時發現的一個靜默資料損毀：
 *
 *   某部落格日期萃取出 `2025-20-01`（20 月）
 *     → 通過 `/^\d{4}-\d{2}-\d{2}$/` 的形狀檢查
 *     → `new Date()` 回 Invalid Date
 *     → `getTime()` 是 NaN
 *     → time_decay_factor / confidence / reliability_score 全部變成 NaN
 *     → 存進 Supabase 變成 `null`
 *
 * 45 筆裡有 3 筆中獎（三貂角燈塔、草山行館、萊萊祕境），而**整條管線沒有
 * 任何一處報錯**——驗證回傳成功、型別正確、筆數正確。這是本 repo 反覆出現的
 * 同一種故障：不是壞掉，是壞得像正常的。
 *
 * 執行：npx ts-node tests/reliability-date.test.ts
 */

import { isRealIsoDate } from '../src/validators/index'

let pass = 0, fail = 0
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}\n       got : ${g}\n       want: ${w}`) }
}

console.log('\n[1] isRealIsoDate：合法日期')
eq('一般日期',            isRealIsoDate('2025-09-29'), true)
eq('閏年 2/29',           isRealIsoDate('2024-02-29'), true)
eq('年初',                isRealIsoDate('2026-01-01'), true)
eq('年末',                isRealIsoDate('2026-12-31'), true)

console.log('\n[2] isRealIsoDate：形狀對但日期不存在 ← 本次事故的類型')
// 這一組全部都會通過 /^\d{4}-\d{2}-\d{2}$/，但都不是真的日期
eq('20 月（實際發生過）',  isRealIsoDate('2025-20-01'), false)
eq('13 月',               isRealIsoDate('2025-13-01'), false)
eq('00 月',               isRealIsoDate('2025-00-15'), false)
eq('32 日',               isRealIsoDate('2025-01-32'), false)
eq('00 日',               isRealIsoDate('2025-01-00'), false)
eq('非閏年的 2/29',        isRealIsoDate('2025-02-29'), false)
eq('4/31（該月只有 30 天）', isRealIsoDate('2025-04-31'), false)

console.log('\n[3] isRealIsoDate：形狀就不對')
eq('斜線分隔',            isRealIsoDate('2025/09/29'), false)
eq('月份未補零',          isRealIsoDate('2025-9-29'),  false)
eq('含時間',              isRealIsoDate('2025-09-29T00:00:00Z'), false)
eq('空字串',              isRealIsoDate(''),           false)
eq('null',                isRealIsoDate(null),         false)
eq('undefined',           isRealIsoDate(undefined),    false)
eq('純文字',              isRealIsoDate('不明'),        false)

console.log(`\n${'═'.repeat(55)}`)
console.log(`通過 ${pass} 項，失敗 ${fail} 項`)
console.log(`${'═'.repeat(55)}\n`)
process.exit(fail > 0 ? 1 : 0)
