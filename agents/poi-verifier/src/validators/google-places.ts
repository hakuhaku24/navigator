import type { PoiInput, GooglePlacesRaw, OpeningPeriod } from '../types'

const API_KEY = process.env.GOOGLE_PLACES_API_KEY

/**
 * 連續失敗計數（C-1）。
 *
 * ## 為什麼需要這個
 *
 * 在此之前，這支驗證器遇到非 200、`status != OK`、或任何例外，一律
 * `console.warn` + `return null`。**批次照常跑完，只是每一筆都少一個來源。**
 *
 * 這在 Places API (Legacy) 已被 Google 標為 legacy（新專案無法啟用）的情況下
 * 特別危險：端點哪天被收掉，整批資料會安靜地少掉 Google 這一類來源，
 * 沒有任何錯誤訊息——而「`sources_detected` 少一類」是完全合法的資料狀態，
 * 不會有任何東西報錯。
 *
 * 單筆查無（`ZERO_RESULTS`）是正常結果，不計入；**只有系統性失敗**
 * （HTTP 非 200、`REQUEST_DENIED`、`OVER_QUERY_LIMIT`、網路例外）才計數。
 */
let consecutiveSystemicFailures = 0
let totalSystemicFailures = 0

/** 連續這麼多次系統性失敗就視為端點／金鑰出事，拋錯讓呼叫端中止批次 */
export const GOOGLE_ABORT_THRESHOLD = 5

export class GooglePlacesSystemicFailure extends Error {
  constructor(public readonly consecutive: number, public readonly lastReason: string) {
    super(
      `Google Places 連續 ${consecutive} 次系統性失敗（最後一次：${lastReason}）。` +
      `可能原因：金鑰失效、配額耗盡，或 legacy 端點已被 Google 停用。` +
      `再跑下去只會產生「每筆都少一類來源」的資料。`,
    )
    this.name = 'GooglePlacesSystemicFailure'
  }
}

export function getGooglePlacesFailureStats() {
  return { consecutive: consecutiveSystemicFailures, total: totalSystemicFailures }
}

export function resetGooglePlacesFailureStats() {
  consecutiveSystemicFailures = 0
  totalSystemicFailures = 0
}

function noteSystemicFailure(reason: string): void {
  consecutiveSystemicFailures++
  totalSystemicFailures++
  console.warn(`[google-places] 系統性失敗（連續第 ${consecutiveSystemicFailures} 次）：${reason}`)
  if (consecutiveSystemicFailures >= GOOGLE_ABORT_THRESHOLD) {
    throw new GooglePlacesSystemicFailure(consecutiveSystemicFailures, reason)
  }
}

function noteSuccess(): void {
  consecutiveSystemicFailures = 0
}

// ── Text Search（第一段：找到 place_id）──────────────────────────────────────

export async function queryGooglePlaces(poi: PoiInput): Promise<GooglePlacesRaw | null> {
  if (!API_KEY) {
    console.warn('[google-places] GOOGLE_PLACES_API_KEY not set, skipping')
    return null
  }

  const query = encodeURIComponent(poi.name)
  const location = `${poi.location.latitude},${poi.location.longitude}`
  const url =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${query}&location=${location}&radius=2000&language=zh-TW&key=${API_KEY}`

  let data: any
  try {
    const res = await fetch(url)
    if (!res.ok) {
      noteSystemicFailure(`Text Search HTTP ${res.status}`)
      return null
    }
    data = await res.json()
  } catch (err) {
    noteSystemicFailure(`Text Search 例外 ${err instanceof Error ? err.message : String(err)}`)
    return null
  }

  // ZERO_RESULTS ＝ 這個景點 Google 查無，是正常結果，不是系統故障
  if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
    noteSuccess()
    console.warn(`[google-places] "${poi.name}" ZERO_RESULTS`)
    return null
  }
  if (data.status !== 'OK') {
    noteSystemicFailure(`Text Search status=${data.status}${data.error_message ? ` (${data.error_message})` : ''}`)
    return null
  }
  noteSuccess()

  const r = data.results[0]
  const base: GooglePlacesRaw = {
    place_id: r.place_id ?? null,
    official_name: r.name ?? null,
    formatted_address: r.formatted_address ?? null,
    opening_hours: r.opening_hours?.weekday_text ?? null,
    rating: r.rating ?? null,
    user_ratings_total: r.user_ratings_total ?? null,
    business_status: r.business_status ?? null,
    geometry: r.geometry?.location
      ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng }
      : undefined,
    // 以下由 Place Details 補；查不到就維持 null（**不是預設值**）
    wheelchair_accessible_entrance: null,
    opening_periods: null,
    special_days: null,
    website: null,
  }

  if (!base.place_id) return base
  const details = await queryPlaceDetails(base.place_id)
  return details ? { ...base, ...details } : base
}

// ── Place Details（第二段：拿 Text Search 拿不到的欄位）──────────────────────

/**
 * 為什麼要多這一通：Text Search 回傳的 `opening_hours` 只有 `weekday_text`
 * （給人看的字串），**沒有結構化時段**，也沒有例外日。
 *
 * 這正是「可預約性分數永遠 100」的根源——`opening_hours_margin_minutes`
 * 從來沒有 producer，計分時被 `?? 240` 補成滿分。
 *
 * ⚠️ 刻意**留在 legacy API**（2026-08-04 決議）：舊版 Place Details 的免費額度
 * 是 5,000/月，新版 Enterprise+Atmosphere 只有 1,000/月；而新版多出來的欄位
 * （accessibilityOptions 細項、restroom、goodForChildren）淨增益不足以換掉
 * 4,000 次額度，其中 parkingOptions／primaryType 還與 TDX 既有資料重複。
 * `special_days` 與輪椅可及性**舊版都有**（2026-08-04 實測朱銘美術館確認）。
 */
async function queryPlaceDetails(placeId: string): Promise<Partial<GooglePlacesRaw> | null> {
  // Basic 層：wheelchair_accessible_entrance、business_status
  // Contact 層：current_opening_hours（含 special_days）、website
  const fields = [
    'place_id', 'business_status', 'wheelchair_accessible_entrance',
    'current_opening_hours', 'opening_hours', 'website',
  ].join(',')
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}&fields=${fields}&language=zh-TW&key=${API_KEY}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      noteSystemicFailure(`Place Details HTTP ${res.status}`)
      return null
    }
    const data = await res.json()
    if (data.status === 'ZERO_RESULTS' || data.status === 'NOT_FOUND') {
      noteSuccess()
      return null
    }
    if (data.status !== 'OK') {
      noteSystemicFailure(`Place Details status=${data.status}${data.error_message ? ` (${data.error_message})` : ''}`)
      return null
    }
    noteSuccess()

    const r = data.result ?? {}
    const hours = r.current_opening_hours ?? r.opening_hours ?? null

    return {
      // Google 只在確定時才回這個欄位；缺席＝未知，**不可當成 false**
      wheelchair_accessible_entrance:
        typeof r.wheelchair_accessible_entrance === 'boolean'
          ? r.wheelchair_accessible_entrance
          : null,
      opening_periods: normalizePeriods(hours?.periods),
      // special_days 只在未來 7 天有例外營業時間時才出現（春節公休、颱風閉園…），
      // 所以「沒有」是常態，不代表查詢失敗
      special_days: Array.isArray(hours?.special_days) ? hours.special_days : null,
      website: typeof r.website === 'string' ? r.website : null,
      business_status: r.business_status ?? null,
    }
  } catch (err) {
    noteSystemicFailure(`Place Details 例外 ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/** Google 的 periods → 精簡結構。整週 24 小時營業時 Google 只回一筆沒有 close 的 period */
export function normalizePeriods(periods: unknown): OpeningPeriod[] | null {
  if (!Array.isArray(periods) || periods.length === 0) return null
  const out: OpeningPeriod[] = []
  for (const p of periods as any[]) {
    const openDay = p?.open?.day
    const openTime = p?.open?.time
    if (typeof openDay !== 'number' || typeof openTime !== 'string') continue
    out.push({
      open_day: openDay,
      open_time: openTime,
      // 沒有 close ＝ 24 小時營業。保留 null 讓下游知道，**不要編一個 23:59**
      close_day: typeof p?.close?.day === 'number' ? p.close.day : null,
      close_time: typeof p?.close?.time === 'string' ? p.close.time : null,
    })
  }
  return out.length > 0 ? out : null
}
