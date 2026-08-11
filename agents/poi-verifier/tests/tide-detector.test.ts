/**
 * tide-detector.test.ts — 潮汐風險評估與敏感度判定
 *
 * 涵蓋 tide-detector 的純邏輯（不打網路）：
 *   · isTideSensitive  哪些景點需要看潮汐
 *   · parseTideDays    CWA 巢狀結構攤平
 *   · assessTideRisk   造訪時間是否落在滿潮附近
 *   · findTideDay      從 32 天預報挑出指定日期
 *
 * 為什麼這塊值得測：潮汐是目前唯一「LLM 原理上做不到」的判斷，也是唯一能在
 * 規劃階段（32 天預報）攔截白跑的能力。判錯的代價是使用者到現場發現步道被淹。
 *
 * 執行：npx ts-node tests/tide-detector.test.ts
 */

import {
  isTideSensitive,
  parseTideDays,
  assessTideRisk,
  findTideDay,
  type TideDay,
} from '../../contingency-handler/src/detectors/tide-detector'

let pass = 0, fail = 0
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}\n       got : ${g}\n       want: ${w}`) }
}

// ── 1. 潮汐敏感度 ───────────────────────────────────────────────────────────

console.log('\n[1] isTideSensitive：哪些景點需要看潮汐')

eq('神秘海岸 → 需要（滿潮時步道被淹）',
  isTideSensitive({ name: '神秘海岸' }), true)
eq('老梅綠石槽 → 需要（退潮才看得到）',
  isTideSensitive({ name: '老梅綠石槽' }), true)
eq('白沙灣海水浴場 → 需要', isTideSensitive({ name: '白沙灣海水浴場' }), true)
eq('深澳岬角 → 需要', isTideSensitive({ name: '深澳岬角水豚岩' }), true)

eq('陽明書屋 → 不需要（內陸）', isTideSensitive({ name: '陽明書屋' }), false)
eq('擎天崗 → 不需要', isTideSensitive({ name: '擎天崗' }), false)

// 這一組是關鍵：名字含「海」但其實是室內場館，不可誤判
eq('國立海洋科技博物館（室內）→ 不需要，不可被關鍵字誤中',
  isTideSensitive({ name: '國立海洋科技博物館', is_indoor: true }), false)
eq('野柳海洋世界（室內表演館）→ 不需要',
  isTideSensitive({ name: '野柳海洋世界', is_indoor: true }), false)

// is_indoor 未判定（null/undefined）時不擋——寧可多提醒一次潮汐，
// 也不要因為「不知道是不是室內」就漏掉海岸景點的警告
eq('海岸景點但 is_indoor 未判定 → 仍視為需要看潮汐',
  isTideSensitive({ name: '神秘海岸', is_indoor: undefined }), true)

eq('category 也納入比對',
  isTideSensitive({ name: '某某景點', category: '海濱' }), true)

// ── 2. CWA 結構攤平 ─────────────────────────────────────────────────────────

console.log('\n[2] parseTideDays：CWA 巢狀結構攤平')

const RAW = [{
  Date: '2026-08-02',
  LunarDate: '2026-06-20',
  TideRange: '中',
  Time: [
    { DateTime: '2026-08-02T03:09:00+08:00', Tide: '乾潮', TideHeights: { AboveTWVD: '17', AboveLocalMSL: 8, AboveChartDatum: 111 } },
    { DateTime: '2026-08-02T08:19:00+08:00', Tide: '滿潮', TideHeights: { AboveTWVD: '65', AboveLocalMSL: 56, AboveChartDatum: 159 } },
    { DateTime: '2026-08-02T15:36:00+08:00', Tide: '乾潮', TideHeights: { AboveTWVD: '-15', AboveLocalMSL: -23, AboveChartDatum: 79 } },
    { DateTime: '2026-08-02T21:32:00+08:00', Tide: '滿潮', TideHeights: { AboveTWVD: '55', AboveLocalMSL: 46, AboveChartDatum: 149 } },
  ],
}]

const parsed = parseTideDays(RAW)
eq('攤平出 1 天', parsed.length, 1)
eq('日期', parsed[0].date, '2026-08-02')
eq('潮差', parsed[0].tide_range, '中')
eq('4 個潮汐事件', parsed[0].events.length, 4)
eq('取 AboveLocalMSL 當潮高', parsed[0].events[1].height_cm, 56)
eq('負值潮高正確保留', parsed[0].events[2].height_cm, -23)

// 缺欄位不可讓整批炸開
eq('缺 DateTime 的事件被略過',
  parseTideDays([{ Date: '2026-08-02', Time: [{ Tide: '滿潮' }, { DateTime: 'x', Tide: '乾潮' }] }])[0].events.length, 1)
eq('完全沒有 Time → 空陣列',
  parseTideDays([{ Date: '2026-08-02' }])[0].events, [])
eq('潮高欄位缺失 → null（不可填 0，0 是有效潮位）',
  parseTideDays([{ Date: '2026-08-02', Time: [{ DateTime: 'x', Tide: '滿潮' }] }])[0].events[0].height_cm, null)

// CWA 回傳順序不保證按日期——2026-08-02 實測金山區，原始順序是 8/27 排在 8/14
// 前面。呼叫端若假設「第一筆是今天」就會拿到錯的日子，所以這裡統一排序。
console.log('\n[2b] 日期排序（CWA 回傳順序不可信）')
const unsorted = parseTideDays([
  { Date: '2026-08-27', Time: [] },
  { Date: '2026-08-02', Time: [] },
  { Date: '2026-08-14', Time: [] },
])
eq('攤平後依日期由早到晚排序',
  unsorted.map(d => d.date), ['2026-08-02', '2026-08-14', '2026-08-27'])

// ── 3. 風險評估 ─────────────────────────────────────────────────────────────

console.log('\n[3] assessTideRisk：造訪時間是否落在滿潮附近')

const DAY: TideDay = parsed[0]

// 08:19 滿潮 → 08:00 造訪距離 19 分鐘，在 ±90 分窗內
eq('滿潮前 19 分鐘 → high',
  assessTideRisk(DAY, '2026-08-02T08:00:00+08:00').risk, 'high')
eq('滿潮後 60 分鐘 → high',
  assessTideRisk(DAY, '2026-08-02T09:19:00+08:00').risk, 'high')

// 15:36 乾潮 → 這時去最好
eq('乾潮時段 → low',
  assessTideRisk(DAY, '2026-08-02T15:30:00+08:00').risk, 'low')
eq('距滿潮 3 小時 → low',
  assessTideRisk(DAY, '2026-08-02T11:19:00+08:00').risk, 'low')

// 邊界：剛好 90 分鐘算不算？（> 才放行，所以 90 分整仍是 high）
eq('距滿潮剛好 90 分鐘 → 仍 high（邊界從嚴）',
  assessTideRisk(DAY, '2026-08-02T06:49:00+08:00').risk, 'high')
eq('距滿潮 91 分鐘 → low',
  assessTideRisk(DAY, '2026-08-02T06:48:00+08:00').risk, 'low')

console.log('\n[3b] 高風險時要給得出替代時段')
const risky = assessTideRisk(DAY, '2026-08-02T08:00:00+08:00')
eq('回傳造成判定的滿潮事件',
  risky.nearest_high_tide?.datetime, '2026-08-02T08:19:00+08:00')
eq('建議改去離滿潮最遠的乾潮',
  risky.suggested_low_tide?.datetime, '2026-08-02T15:36:00+08:00')
eq('理由包含潮差資訊', risky.reason.includes('潮差中'), true)

// low risk 時不給建議時段：這個時段本來就沒問題，硬塞「建議改去 04:17」
// 只會讓人困惑（實測中午查詢時就出現過建議回到凌晨的荒謬輸出）
eq('低風險時不附建議時段（避免叫人回到已過去的凌晨）',
  assessTideRisk(DAY, '2026-08-02T12:00:00+08:00').suggested_low_tide, undefined)

console.log('\n[3c] 大潮的嚴重度要高於中／小潮')
const springTide: TideDay = { ...DAY, tide_range: '大' }
eq('大潮 → severity high',
  assessTideRisk(springTide, '2026-08-02T08:00:00+08:00').severity, 'high')
eq('中潮 → severity medium',
  assessTideRisk(DAY, '2026-08-02T08:00:00+08:00').severity, 'medium')

console.log('\n[3d] 查無資料 ≠ 安全')
// 這一組很重要：unknown 必須與 low 分開。前者顯示「潮汐資料待補」，
// 後者才能說「此時段適合前往」。混為一談就是在沒有依據時給出保證。
eq('null → unknown（不可回 low）', assessTideRisk(null, '2026-08-02T08:00:00+08:00').risk, 'unknown')
eq('空事件 → unknown',
  assessTideRisk({ date: '2026-08-02', lunar_date: '', tide_range: '', events: [] }, '2026-08-02T08:00:00+08:00').risk,
  'unknown')
eq('只有乾潮沒有滿潮 → unknown',
  assessTideRisk(
    { date: '2026-08-02', lunar_date: '', tide_range: '中', events: [{ datetime: '2026-08-02T03:09:00+08:00', tide: '乾潮', height_cm: 8 }] },
    '2026-08-02T08:00:00+08:00',
  ).risk, 'unknown')

// ── 4. 從 32 天預報挑日期 ───────────────────────────────────────────────────

console.log('\n[4] findTideDay：32 天預報挑指定日期')

const DAYS: TideDay[] = [
  { date: '2026-08-02', lunar_date: '', tide_range: '中', events: [] },
  { date: '2026-08-15', lunar_date: '', tide_range: '大', events: [] },
]
eq('挑得到 8/15（規劃階段查未來日期）', findTideDay(DAYS, '2026-08-15')?.tide_range, '大')
eq('傳完整 ISO 也可以', findTideDay(DAYS, '2026-08-15T15:00:00+08:00')?.tide_range, '大')
eq('日期不在預報範圍 → null', findTideDay(DAYS, '2026-12-25'), null)

console.log(`\n${'═'.repeat(55)}`)
console.log(`通過 ${pass} 項，失敗 ${fail} 項`)
console.log(`${'═'.repeat(55)}\n`)
process.exit(fail > 0 ? 1 : 0)
