/**
 * tide-detector.ts — 中央氣象署鄉鎮潮汐預報（F-A0021-001）
 *
 * ## 為什麼做這個
 *
 * 這是目前唯一「LLM 原理上做不到」的判斷。室內／戶外是靜態事實，大模型記得住；
 * 潮汐是每天不同的天文計算，只能查——而且查得到 32 天。
 *
 * 具體到本專案的資料：
 *   · 神秘海岸（NCA-007）**只有退潮才走得通**，滿潮時步道整段被淹
 *   · 老梅綠石槽（NCA-004）退潮才看得到最好的狀態
 * 兩者都是「去了會白跑」的典型，而且是 Google Places 與任何 LLM 都給不出來的。
 *
 * ## 32 天預報的意義
 *
 * 不只是即時應變的訊號。因為預報涵蓋未來一個月，**使用者在 /trip/build 排行程
 * 時就能檢查**：「你排 8/15 15:00 去神秘海岸，該日 14:20 滿潮，此時段步道不可
 * 通行」——這是規劃階段攔截白跑，不是事後補救。
 *
 * ## 涵蓋度（2026-08-02 實測）
 *
 * 全台 266 個鄉鎮。本專案海岸景點所在鄉鎮 6/6 全中：石門區、金山區、萬里區、
 * 三芝區、瑞芳區、貢寮區。北投／士林未涵蓋屬正確行為（陽明山內陸無潮汐）。
 *
 * 金鑰與天氣預報共用 `CWA_API_KEY`，已驗證有此資料集權限。
 */

import type { EventSeverity } from '../types'

const CWA_API_KEY = process.env.CWA_API_KEY || process.env.WEATHER_API_KEY
const TIDE_DATASET = 'F-A0021-001'
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse'

/**
 * 判定「接近滿潮」的時間窗（分鐘）。
 *
 * 滿潮與乾潮相隔約 6 小時，水位在滿潮前後變化最平緩、水位最高。取 ±90 分鐘
 * 是把「水位接近當日最高」的區間涵蓋進來，同時不過度保守到整天都在警告。
 */
const HIGH_TIDE_WINDOW_MINUTES = 90

// ── CWA 回應型別（依 2026-08-02 實際回應）──────────────────────────────────

interface TideApiResponse {
  success: string
  records?: {
    note?: string
    TideForecasts?: Array<{
      Location?: {
        LocationName?: string
        TimePeriods?: {
          Daily?: Array<TideDailyRaw>
        } | Array<TideDailyRaw>
      }
    }>
  }
}

interface TideDailyRaw {
  Date?: string
  LunarDate?: string
  TideRange?: string
  Time?: Array<{
    DateTime?: string
    Tide?: string
    TideHeights?: Record<string, string | number>
  }>
}

// ── 對外型別 ────────────────────────────────────────────────────────────────

export interface TideEvent {
  /** ISO8601（含 +08:00 時區） */
  datetime: string
  /** '滿潮' | '乾潮' */
  tide: string
  /** 相對當地平均海平面的潮高（公分）；取不到時為 null */
  height_cm: number | null
}

export interface TideDay {
  date: string          // YYYY-MM-DD
  lunar_date: string
  /** '大潮' | '中' | '小潮' — 潮差越大，滿潮時淹得越高 */
  tide_range: string
  events: TideEvent[]
}

export interface TideRisk {
  risk: 'high' | 'low' | 'unknown'
  reason: string
  /** 造成判定的那次潮汐事件（risk=high 時必有） */
  nearest_high_tide?: TideEvent
  /** 建議改去的時段（最近的乾潮），供敘述層使用 */
  suggested_low_tide?: TideEvent
  severity?: EventSeverity
}

// ── 潮汐敏感度判定 ──────────────────────────────────────────────────────────

/**
 * 這個景點會不會受潮汐影響。
 *
 * ⚠️ 這是**啟發式判斷，不是資料**。`poi_catalog` 目前沒有潮汐敏感度欄位，
 * 而替 45 筆景點人工標註是可行的（見 KNOWN_ISSUES 待辦）。在有真實欄位之前，
 * 用名稱與分類的關鍵字推斷——寧可漏判也不要誤判：只有明確指向潮間帶、
 * 海蝕地形、沙灘的字眼才算，「海洋科技博物館」這種含「海」但明顯是室內的
 * 會被 is_indoor 擋掉（呼叫端負責）。
 */
const TIDE_KEYWORDS = [
  '海岸', '海灘', '沙灘', '潮間帶', '石槽', '岬', '礁', '岩岸',
  '海蝕', '漁港', '海濱', '海水浴場', '秘境',
]

export function isTideSensitive(poi: {
  name: string
  category?: string
  is_indoor?: boolean
}): boolean {
  // 室內景點與潮汐無關，先擋掉（避免「海洋科技博物館」被關鍵字誤中）
  if (poi.is_indoor === true) return false
  const haystack = `${poi.name} ${poi.category ?? ''}`
  return TIDE_KEYWORDS.some(k => haystack.includes(k))
}

// ── 風險評估（純函式，可單元測試）──────────────────────────────────────────

function minutesBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60_000
}

/**
 * 給定某天的潮汐事件與造訪時間，判斷是否落在滿潮附近。
 *
 * 回傳 `unknown` 而非 `low` 的情境要分清楚：查不到資料 ≠ 安全。
 * 前者應顯示「潮汐資料待補」，後者才能說「此時段適合前往」。
 */
export function assessTideRisk(day: TideDay | null, visitTimeIso: string): TideRisk {
  if (!day || day.events.length === 0) {
    return { risk: 'unknown', reason: '查無該地點／日期的潮汐預報' }
  }

  const highs = day.events.filter(e => e.tide.includes('滿'))
  const lows = day.events.filter(e => e.tide.includes('乾'))
  if (highs.length === 0) {
    return { risk: 'unknown', reason: '潮汐預報缺少滿潮資料' }
  }

  let nearest = highs[0]
  let nearestGap = minutesBetween(nearest.datetime, visitTimeIso)
  for (const h of highs.slice(1)) {
    const gap = minutesBetween(h.datetime, visitTimeIso)
    if (gap < nearestGap) { nearest = h; nearestGap = gap }
  }

  if (nearestGap > HIGH_TIDE_WINDOW_MINUTES) {
    // 刻意不給 suggested_low_tide：這個時段本來就沒問題，硬塞一個「建議改去
    // 04:17」只會讓人困惑（實測時中午查詢就出現過建議回到凌晨的荒謬輸出）。
    return {
      risk: 'low',
      reason: `造訪時間距最近滿潮 ${Math.round(nearestGap)} 分鐘，水位已退`,
    }
  }

  // 大潮的滿潮水位明顯更高，淹沒範圍更大
  const severity: EventSeverity = day.tide_range.includes('大') ? 'high' : 'medium'
  // 建議時段取「離滿潮最遠的乾潮」
  let bestLow = lows[0]
  if (lows.length > 1) {
    let bestGap = minutesBetween(lows[0].datetime, nearest.datetime)
    for (const l of lows.slice(1)) {
      const gap = minutesBetween(l.datetime, nearest.datetime)
      if (gap > bestGap) { bestLow = l; bestGap = gap }
    }
  }

  return {
    risk: 'high',
    reason:
      `造訪時間距滿潮僅 ${Math.round(nearestGap)} 分鐘` +
      `（${day.date} 潮差${day.tide_range}），該時段水位偏高`,
    nearest_high_tide: nearest,
    suggested_low_tide: bestLow,
    severity,
  }
}

/** 從多天預報裡挑出指定日期那天 */
export function findTideDay(days: TideDay[], dateIso: string): TideDay | null {
  const target = dateIso.slice(0, 10)
  return days.find(d => d.date === target) ?? null
}

// ── CWA 查詢 ────────────────────────────────────────────────────────────────

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return null
}

/**
 * 把 CWA 的巢狀結構攤平成 TideDay[]（Daily 有時是陣列、有時包在物件裡）。
 *
 * ⚠️ **一定要排序**：CWA 回傳的順序不保證按日期。2026-08-02 實測金山區，
 * `days[0]` 是 8/27、`days[14]` 是 8/14——任何假設「第一筆是今天」的呼叫端
 * 都會拿到錯的日子。這裡統一排好，呼叫端才有可預期的契約。
 */
export function parseTideDays(raw: TideDailyRaw[]): TideDay[] {
  return raw.map(d => ({
    date: (d.Date ?? '').slice(0, 10),
    lunar_date: d.LunarDate ?? '',
    tide_range: d.TideRange ?? '',
    events: (d.Time ?? [])
      .filter(t => !!t.DateTime && !!t.Tide)
      .map(t => ({
        datetime: t.DateTime as string,
        tide: t.Tide as string,
        // AboveLocalMSL＝相對當地平均海平面，是三種基準裡最直觀的
        height_cm: toNumberOrNull(t.TideHeights?.AboveLocalMSL),
      })),
  })).sort((a, b) => a.date.localeCompare(b.date))
}

async function reverseGeocodeTownship(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${NOMINATIM}?lat=${lat}&lon=${lng}&format=json&zoom=14&accept-language=zh-TW`
    const res = await fetch(url, { headers: { 'User-Agent': 'Navigator-Contingency-Handler/0.1' } })
    if (!res.ok) return null
    const data = await res.json() as { address?: Record<string, string> }
    const addr = data.address ?? {}
    const city = addr.city || addr.state || addr.county || ''
    const town = addr.town || addr.suburb || addr.district || addr.city_district || addr.village || ''
    if (!city || !town) return null
    // CWA 的 LocationName 形如「新北市石門區」
    return `${city}${town}`
  } catch (err) {
    console.warn('[tide-detector] reverseGeocode error:', err)
    return null
  }
}

/**
 * 取得某座標所在鄉鎮的潮汐預報（未來約 1 個月）。
 *
 * @param townshipOverride 已知鄉鎮全名（如「新北市石門區」）時可略過反查，
 *                         省一次 Nominatim 呼叫（該服務硬性限制 1 req/s）
 */
export async function queryTideForecast(
  lat: number,
  lng: number,
  townshipOverride?: string,
): Promise<{ township: string; days: TideDay[] } | null> {
  if (!CWA_API_KEY) {
    console.warn('[tide-detector] CWA_API_KEY not set')
    return null
  }

  const township = townshipOverride ?? await reverseGeocodeTownship(lat, lng)
  if (!township) return null

  try {
    const url =
      `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${TIDE_DATASET}` +
      `?Authorization=${CWA_API_KEY}&format=JSON&LocationName=${encodeURIComponent(township)}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[tide-detector] CWA HTTP ${res.status}`)
      return null
    }
    const data = await res.json() as TideApiResponse
    const forecasts = data.records?.TideForecasts ?? []
    // 帶了 LocationName 參數通常只回一筆；沒中就自己找
    const hit =
      forecasts.find(f => f.Location?.LocationName === township) ?? forecasts[0]
    if (!hit?.Location) {
      console.warn(`[tide-detector] 查無 ${township} 的潮汐預報（內陸鄉鎮無此資料屬正常）`)
      return null
    }

    const tp = hit.Location.TimePeriods
    const daily: TideDailyRaw[] = Array.isArray(tp)
      ? tp
      : (tp?.Daily ?? [])
    return { township, days: parseTideDays(daily) }
  } catch (err) {
    console.warn('[tide-detector] error:', err)
    return null
  }
}
