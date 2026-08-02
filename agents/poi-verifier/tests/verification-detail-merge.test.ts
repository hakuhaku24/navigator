/**
 * verification-detail-merge.test.ts — 驗證細節的「DB 優先、靜態檔補洞」規則
 *
 * 守護 0-6 這次改動：migration 010 把 `conflict_analysis` / `level_reasoning`
 * 加進 poi_catalog 之後，`verification-detail.ts` 的角色從「唯一來源」變成
 * 「補洞」——只填 DB 還沒有的欄位。
 *
 * 為什麼值得單獨測：這條規則寫反的後果很大又很隱蔽——
 * 靜態快照（2026-05-06 那批）蓋掉重跑後的新結果，等於重跑白做，
 * 而且畫面上看起來一切正常。
 *
 * 最容易寫錯的一點：判準必須是 `=== undefined`，不能用 `??` 或 `||`。
 *   · undefined ＝ DB 沒這個欄位（未套 migration／舊資料）  → 該補
 *   · null      ＝ DB 查過了，答案就是「沒有衝突」          → 不可補
 * 用 `??` 的話 null 會被當缺值，把「已驗證沒有衝突」誤植成舊的衝突資料。
 *
 * 執行：npx ts-node tests/verification-detail-merge.test.ts
 */

import {
  mergeVerificationDetail,
  type FallbackDetail,
  type MergeableResult,
} from '../../../src/lib/verification-detail-merge'

let pass = 0, fail = 0
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}\n       got : ${g}\n       want: ${w}`) }
}

// 靜態 poi-kb.ts 那份 2026-05-06 的快照
const STATIC: FallbackDetail = {
  conflicts: { address: { resolved: '舊地址', is_conflicted: true } },
  level_reasoning: '靜態檔的舊理由',
  blog_posts: [{ title: '靜態部落格' }],
}

// ── 1. DB 有值時不可被覆蓋 ─────────────────────────────────────────────────

console.log('\n[1] DB 已有的值必須勝出（重跑才不會白做）')

const dbHasConflicts = mergeVerificationDetail(
  { conflicts: { address: { resolved: '新地址', is_conflicted: false } } },
  STATIC,
)
eq('DB 有 conflicts → 保留 DB 的值',
  (dbHasConflicts.conflicts as Record<string, Record<string, unknown>>).address.resolved,
  '新地址')

eq('DB 有 level_reasoning → 保留 DB 的值',
  mergeVerificationDetail({ level_reasoning: 'DB 的新理由' }, STATIC).level_reasoning,
  'DB 的新理由')

// ── 2. null 是有效答案，不是缺值 ────────────────────────────────────────────
//
// 這是最容易寫錯的一組。`?? ` / `||` 都會在這裡把 null 換掉。

console.log('\n[2] null ＝「查過，沒有衝突」，不可被靜態檔補掉')

eq('DB 明確回 null → 保持 null（不得變成靜態檔的舊衝突）',
  mergeVerificationDetail({ conflicts: null }, STATIC).conflicts, null)

eq('DB 回空字串的 level_reasoning → 保持空字串（不得被補）',
  mergeVerificationDetail({ level_reasoning: '' }, STATIC).level_reasoning, '')

eq('DB 回空陣列的 blog_posts → 保持空陣列',
  mergeVerificationDetail({ blog_posts: [] }, STATIC).blog_posts, [])

// ── 3. undefined 才補 ───────────────────────────────────────────────────────

console.log('\n[3] undefined（DB 沒這欄位）才用靜態檔補')

const empty = mergeVerificationDetail({} as MergeableResult, STATIC)
eq('conflicts 缺 → 由靜態檔補',
  (empty.conflicts as Record<string, Record<string, unknown>>).address.resolved, '舊地址')
eq('level_reasoning 缺 → 由靜態檔補', empty.level_reasoning, '靜態檔的舊理由')
eq('blog_posts 缺 → 由靜態檔補', empty.blog_posts, [{ title: '靜態部落格' }])

// 混合情況：真實世界最常見——重跑過的欄位有值，沒對應 DB 欄位的仍是 undefined
console.log('\n[3b] 混合：部分來自 DB、部分來自靜態檔')
const mixed = mergeVerificationDetail(
  { conflicts: null, level_reasoning: 'DB 理由' } as MergeableResult, // 這兩個 DB 有
  STATIC,                                                            // blog_posts 只有靜態檔有
)
eq('DB 的 conflicts=null 保持', mixed.conflicts, null)
eq('DB 的 level_reasoning 保持', mixed.level_reasoning, 'DB 理由')
eq('blog_posts 由靜態檔補（DB 至今沒有這個欄位）',
  mixed.blog_posts, [{ title: '靜態部落格' }])

// ── 4. 不可就地修改原物件 ───────────────────────────────────────────────────
//
// route handler 會對整個 results 陣列 map，就地修改會污染呼叫端。

console.log('\n[4] 純函式：不得就地修改輸入')

const original: MergeableResult = {}
const result = mergeVerificationDetail(original, STATIC)
eq('原物件維持空白', Object.keys(original).length, 0)
eq('回傳的是新物件', result !== (original as unknown), true)

console.log(`\n${'═'.repeat(55)}`)
console.log(`通過 ${pass} 項，失敗 ${fail} 項`)
console.log(`${'═'.repeat(55)}\n`)
process.exit(fail > 0 ? 1 : 0)
