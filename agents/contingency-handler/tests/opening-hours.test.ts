/**
 * C-1 的回歸測試：營業時間 margin 與 Google Places 失敗計數。
 *
 * 要證明的核心：**三種狀態不可混為一談**
 *   null ＝ 沒有資料（不知道）    ≠  0 ＝ 目前沒營業（知道）    ≠  正數 ＝ 還有多久打烊
 *
 * 在此之前 `opening_hours_margin_minutes` 沒有 producer，計分時 `?? 240` 一律
 * 補成滿分——畫面上「可預約性」每個景點永遠 100。
 *
 * 跑法：npx ts-node tests/opening-hours.test.ts
 */

import { minutesUntilClose, taipeiNowParts, ALWAYS_OPEN_MINUTES, type OpeningPeriod } from '../src/opening-hours'
import { normalizePeriods } from '../../poi-verifier/src/validators/google-places'

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log('  ✅', msg) }
  else { failed++; console.error('  ❌', msg) }
}
function section(t: string) { console.log(`\n${t}`) }

/** 建立一個「臺灣時間為某日某時」的 Date。臺灣固定 UTC+8，無日光節約 */
function taipei(day: '2026-08-04' | '2026-08-08' | '2026-08-09', hhmm: string): Date {
  return new Date(`${day}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00+08:00`)
}

// 2026-08-04 是星期二(2)、08-08 星期六(6)、08-09 星期日(0)
section('[0] 時區基準 —— 必須是臺北，不是本機')
assert(taipeiNowParts(taipei('2026-08-04', '1430')).day === 2,
  `2026-08-04 14:30 → 星期二（實際 ${taipeiNowParts(taipei('2026-08-04', '1430')).day}）`)
assert(taipeiNowParts(taipei('2026-08-04', '1430')).minutes === 14 * 60 + 30,
  '當日分鐘數換算正確')
assert(taipeiNowParts(taipei('2026-08-09', '0015')).day === 0,
  '2026-08-09 00:15 → 星期日（跨日邊界不會算錯）')

// ── [1] 三態語意 ────────────────────────────────────────────────────────────

section('[1] null / 0 / 正數 三種狀態必須可分')

assert(minutesUntilClose(null) === null, 'periods 為 null → null（不知道，不是一直開著）')
assert(minutesUntilClose(undefined) === null, 'periods 為 undefined → null')
assert(minutesUntilClose([]) === null, 'periods 為空陣列 → null')

// 週二 09:00–17:00
const tue9to17: OpeningPeriod[] = [
  { open_day: 2, open_time: '0900', close_day: 2, close_time: '1700' },
]
assert(minutesUntilClose(tue9to17, taipei('2026-08-04', '1630')) === 30,
  `週二 16:30，營業到 17:00 → 30 分鐘（實際 ${minutesUntilClose(tue9to17, taipei('2026-08-04', '1630'))}）`)
assert(minutesUntilClose(tue9to17, taipei('2026-08-04', '0800')) === 0,
  '週二 08:00 尚未開門 → 0（知道沒營業，不是 null）')
assert(minutesUntilClose(tue9to17, taipei('2026-08-04', '1800')) === 0,
  '週二 18:00 已打烊 → 0')
assert(minutesUntilClose(tue9to17, taipei('2026-08-08', '1200')) === 0,
  '週六（該日無時段）→ 0')

// ── [2] 24 小時營業 ─────────────────────────────────────────────────────────

section('[2] 24 小時營業 —— 不可與「不知道」混淆')

const always: OpeningPeriod[] = [
  { open_day: 0, open_time: '0000', close_day: null, close_time: null },
]
assert(minutesUntilClose(always, taipei('2026-08-04', '0300')) === ALWAYS_OPEN_MINUTES,
  `沒有 close ＝ 24 小時營業 → ${ALWAYS_OPEN_MINUTES}（不是 null，也不是 0）`)

// ── [3] 跨午夜與跨週界 ──────────────────────────────────────────────────────

section('[3] 跨午夜／跨週界的時段')

// 週六 22:00 → 週日 02:00
const sat22toSun02: OpeningPeriod[] = [
  { open_day: 6, open_time: '2200', close_day: 0, close_time: '0200' },
]
assert(minutesUntilClose(sat22toSun02, taipei('2026-08-08', '2330')) === 150,
  `週六 23:30，營業到週日 02:00 → 150 分鐘（實際 ${minutesUntilClose(sat22toSun02, taipei('2026-08-08', '2330'))}）`)
assert(minutesUntilClose(sat22toSun02, taipei('2026-08-09', '0100')) === 60,
  `週日 01:00 仍在週六那段內 → 60 分鐘（**跨週界**，實際 ${minutesUntilClose(sat22toSun02, taipei('2026-08-09', '0100'))}）`)
assert(minutesUntilClose(sat22toSun02, taipei('2026-08-09', '0300')) === 0,
  '週日 03:00 已打烊 → 0')

section('[3b] 多時段（午休）取最近的一個')
const lunchBreak: OpeningPeriod[] = [
  { open_day: 2, open_time: '0900', close_day: 2, close_time: '1200' },
  { open_day: 2, open_time: '1330', close_day: 2, close_time: '1700' },
]
assert(minutesUntilClose(lunchBreak, taipei('2026-08-04', '1130')) === 30,
  '上午時段 11:30 → 30 分鐘')
assert(minutesUntilClose(lunchBreak, taipei('2026-08-04', '1230')) === 0,
  '午休 12:30 → 0（沒營業）')
assert(minutesUntilClose(lunchBreak, taipei('2026-08-04', '1400')) === 180,
  '下午時段 14:00 → 180 分鐘')

// ── [4] normalizePeriods —— Google 原始格式 ─────────────────────────────────

section('[4] normalizePeriods 解析 Google 回傳')

const gp = normalizePeriods([
  { open: { day: 2, time: '0900' }, close: { day: 2, time: '1700' } },
  { open: { day: 3, time: '0900' }, close: { day: 3, time: '1700' } },
])
assert(gp !== null && gp.length === 2, `解析出 2 個時段（實際 ${gp?.length}）`)
assert(gp?.[0].open_time === '0900' && gp?.[0].close_time === '1700', '時間欄位正確')

const gp24 = normalizePeriods([{ open: { day: 0, time: '0000' } }])
assert(gp24?.[0].close_day === null && gp24?.[0].close_time === null,
  '沒有 close 的 period → close_* 保留 null（**不編一個 2359**）')

assert(normalizePeriods(null) === null, 'null → null')
assert(normalizePeriods([]) === null, '空陣列 → null')
assert(normalizePeriods([{ garbage: 1 }]) === null, '無法解析的內容 → null 而非半成品')

// ── 收尾 ────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(55)}`)
console.log(`通過 ${passed} 項，失敗 ${failed} 項`)
console.log('═'.repeat(55))
if (failed > 0) process.exitCode = 1
