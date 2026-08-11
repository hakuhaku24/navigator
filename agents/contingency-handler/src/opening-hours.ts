/**
 * 營業時間 —— 距離打烊還有幾分鐘（C-1）。
 *
 * ## 為什麼是執行時算，不是匯入時存
 *
 * `opening_hours_margin_minutes` 的定義是「**現在**距離打烊還有幾分鐘」。
 * 它跟時間有關，存進資料庫的當下就過期了。
 * 匯入時能存的只有「每週營業時段」（`metadata.opening_periods`），margin 必須即時算。
 *
 * ## 這條在修什麼
 *
 * `opening_hours_margin_minutes` 在此之前**全 repo 沒有任何 producer**：
 *   - `strict-checker` 有「距離打烊 < 5 分鐘就淘汰」的規則 → 從未觸發
 *   - 計分時 `poi.opening_hours_margin_minutes ?? 240` → 每個景點都拿滿分
 *   - 畫面上「可預約性」那條進度條 → **每個景點永遠都是 100**
 *
 * ## 三種回傳值的意義（不可混為一談）
 *
 *   `null`        沒有營業時段資料 ＝ **不知道**（不是「一直開著」）
 *   `0`           現在沒有營業
 *   正整數         距離打烊的分鐘數；24 小時營業回 `ALWAYS_OPEN_MINUTES`
 */

export interface OpeningPeriod {
  open_day: number    // 0=週日 … 6=週六
  open_time: string   // "HHmm"
  close_day: number | null
  close_time: string | null
}

/** 24 小時營業時的 margin。用有限值而非 Infinity，才能安全序列化成 JSON */
export const ALWAYS_OPEN_MINUTES = 24 * 60

/** 臺灣時間的「星期幾」與「當日第幾分鐘」。不可用本機時區——伺服器不一定在臺灣 */
export function taipeiNowParts(now: Date = new Date()): { day: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const parts = fmt.formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const DAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    day: DAYS[get('weekday')] ?? 0,
    minutes: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10),
  }
}

function hhmmToMinutes(hhmm: string): number | null {
  if (!/^\d{4}$/.test(hhmm)) return null
  const h = parseInt(hhmm.slice(0, 2), 10)
  const m = parseInt(hhmm.slice(2), 10)
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/** 把「星期幾＋當日分鐘」壓成一週內的絕對分鐘，方便比較跨日時段 */
function weekMinutes(day: number, minutes: number): number {
  return day * 24 * 60 + minutes
}

const WEEK = 7 * 24 * 60

/**
 * @returns 距離打烊的分鐘數；`0` ＝ 目前未營業；`null` ＝ **沒有資料，不知道**
 */
export function minutesUntilClose(
  periods: OpeningPeriod[] | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!periods || periods.length === 0) return null

  const { day, minutes } = taipeiNowParts(now)
  const nowW = weekMinutes(day, minutes)

  let best: number | null = null

  for (const p of periods) {
    const openM = hhmmToMinutes(p.open_time)
    if (openM === null) continue

    // 沒有 close ＝ 24 小時營業
    if (p.close_day === null || p.close_time === null) {
      return ALWAYS_OPEN_MINUTES
    }
    const closeM = hhmmToMinutes(p.close_time)
    if (closeM === null) continue

    const startW = weekMinutes(p.open_day, openM)
    let endW = weekMinutes(p.close_day, closeM)
    // 跨週界（例：週六 22:00 開到週日 02:00）
    if (endW <= startW) endW += WEEK

    // now 也要考慮「上一週的同一時段仍在進行中」的情形
    for (const candidate of [nowW, nowW + WEEK]) {
      if (candidate >= startW && candidate < endW) {
        const remaining = endW - candidate
        if (best === null || remaining < best) best = remaining
      }
    }
  }

  // 有時段資料、但現在不在任何時段內 ＝ 沒有營業（這是「知道」，不是「不知道」）
  return best ?? 0
}
