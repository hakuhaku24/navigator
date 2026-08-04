import type { WeatherEvent, WeatherAdvisory, EventSeverity } from '../types'

const CWA_API_KEY = process.env.CWA_API_KEY || process.env.WEATHER_API_KEY
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse'
const CWA_BASE = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore'
const CWA_DATASET = 'F-D0047-061' // 臺北市鄉鎮3天預報（找不到縣市對應時的退路）

const DATASET_ADVISORY = 'W-C0033-001' // 天氣警特報（縣市級）
const DATASET_UV = 'O-A0005-001'       // 氣象站每日紫外線指數最大值（測站級）
const DATASET_SUN = 'A-B0062-001'      // 日出日沒時刻（縣市級）

// 鄉鎮 → CWA dataset id 映射（北部三個示範縣市；其餘 fallback to 061 city-level）
const TOWNSHIP_DATASET: Record<string, string> = {
  '臺北市': 'F-D0047-061',
  '新北市': 'F-D0047-069',
  '基隆市': 'F-D0047-049',
  '宜蘭縣': 'F-D0047-001',
}

/**
 * 縣市 → 紫外線代表測站。
 *
 * ⚠️ `O-A0005-001` 是**測站級**資料（欄位名為「氣象站每日紫外線指數最大值」），
 * 不是鄉鎮級。這裡用「該縣市的代表站」近似，**不是景點所在地的實測值**，
 * 而且是**當日最大值**不是當下值。任何對外呈現都必須這樣說明。
 * 查無對應縣市時回 `null`，不要拿別縣市的站硬湊。
 */
const COUNTY_UV_STATION: Record<string, string> = {
  '臺北市': '466920', // 臺北
  // 新北市刻意用淡水而非板橋：①板橋 466880 **不在 O-A0005-001 的測站清單裡**
  // （2026-08-04 實測 30 站，無此站，先前對映到它會永遠回 null）
  // ②本專案的新北景點集中在北海岸與東北角，淡水是沿海站，比內陸的板橋更具代表性
  '新北市': '466900', // 淡水
  '基隆市': '466940', // 基隆
  '宜蘭縣': '467080', // 宜蘭
}

// ── 共用工具 ────────────────────────────────────────────────────────────────

/** CWA 的缺值慣例是 `-` 或空字串；轉不出數字一律回 null，**不要補預設值** */
function toNumberOrNull(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  const s = String(raw).trim()
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** 「現在」的臺灣日期（YYYY-MM-DD）。不可用 toISOString()——那是 UTC，凌晨會差一天 */
function todayInTaipei(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

async function cwaFetch(dataset: string, params: Record<string, string> = {}): Promise<any | null> {
  if (!CWA_API_KEY) {
    console.warn('[weather-detector] CWA_API_KEY not set')
    return null
  }
  const qs = new URLSearchParams({ Authorization: CWA_API_KEY, format: 'JSON', ...params })
  try {
    const res = await fetch(`${CWA_BASE}/${dataset}?${qs}`)
    if (!res.ok) {
      console.warn(`[weather-detector] ${dataset} HTTP ${res.status}`)
      return null
    }
    const data = await res.json()
    if (data?.success !== 'true' && data?.success !== true) {
      console.warn(`[weather-detector] ${dataset} success=${data?.success}`)
      return null
    }
    return data
  } catch (err) {
    console.warn(`[weather-detector] ${dataset} error:`, err)
    return null
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<{ city: string; town: string } | null> {
  try {
    const url = `${NOMINATIM}?lat=${lat}&lon=${lng}&format=json&zoom=14&accept-language=zh-TW`
    const res = await fetch(url, { headers: { 'User-Agent': 'Navigator-Contingency-Handler/0.1' } })
    if (!res.ok) return null
    const data = await res.json() as { address?: Record<string, string> }
    const addr = data.address ?? {}
    const city = addr.city || addr.state || addr.county || ''
    const town = addr.town || addr.suburb || addr.district || addr.city_district || addr.village || ''
    if (!city || !town) return null
    return { city, town }
  } catch (err) {
    console.warn('[weather-detector] reverseGeocode error:', err)
    return null
  }
}

// ── 鄉鎮天氣要素（一次呼叫拿全部）─────────────────────────────────────────────

export interface CwaConditions {
  rainfall_probability: number | null
  temperature: number | null
  apparent_temperature: number | null
  wind_speed_ms: number | null
  relative_humidity_percent: number | null
}

/**
 * 這五個要素**全部來自同一個 response**（實測 `F-D0047-069` 萬里區確認），
 * 所以接體感溫度／風速／濕度是**零額外 API 成本**。
 *
 * 注意時間鍵不一致：溫度類用 `DataTime`（時間點），降雨機率與天氣現象用
 * `StartTime`/`EndTime`（時段）。兩者都取 `Time[0]` ＝「最接近現在」。
 */
export function parseCwaConditions(loc: any): CwaConditions {
  const pick = (name: string, valueKey: string): number | null => {
    const elem = loc?.WeatherElement?.find((e: any) => e.ElementName === name)
    return toNumberOrNull(elem?.Time?.[0]?.ElementValue?.[0]?.[valueKey])
  }
  const rainElem = loc?.WeatherElement?.find((e: any) => String(e.ElementName).includes('降雨機率'))
  const rainPct = toNumberOrNull(rainElem?.Time?.[0]?.ElementValue?.[0]?.ProbabilityOfPrecipitation)

  return {
    rainfall_probability: rainPct === null ? null : rainPct / 100,
    temperature: pick('溫度', 'Temperature'),
    apparent_temperature: pick('體感溫度', 'ApparentTemperature'),
    wind_speed_ms: pick('風速', 'WindSpeed'),
    relative_humidity_percent: pick('相對濕度', 'RelativeHumidity'),
  }
}

async function queryConditions(city: string, town: string): Promise<CwaConditions | null> {
  const datasetId = TOWNSHIP_DATASET[city] ?? CWA_DATASET
  const data = await cwaFetch(datasetId, { LocationName: town })
  const loc = data?.records?.Locations?.[0]?.Location?.[0]
  if (!loc) {
    console.warn(`[weather-detector] no location for ${city}/${town}`)
    return null
  }
  return parseCwaConditions(loc)
}

// ── A-2 天氣警特報 ──────────────────────────────────────────────────────────

/**
 * 容錯解析單筆 hazard。
 *
 * ⚠️ 撰寫當下（2026-08-04）全台無生效警特報，**內層結構未經實際觀察**，
 * 官方也沒有公開的 schema 文件。因此這裡把常見的幾種路徑都試一遍，
 * 取不到就留 `null`，並**原封不動保留 `raw`**。
 *
 * 關鍵原則：**解析失敗不等於沒有警報**。只要 hazard 物件存在就代表有警報生效，
 * 呼叫端要依「陣列長度」判斷有無，不是依 `phenomena` 是否解析成功。
 */
export function parseHazard(hazard: any): WeatherAdvisory {
  const info = hazard?.info ?? hazard
  const valid = hazard?.validTime ?? hazard?.ValidTime ?? {}
  const str = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s === '' ? null : s
  }
  return {
    phenomena: str(info?.phenomena ?? info?.Phenomena ?? info?.phenomenon),
    significance: str(info?.significance ?? info?.Significance),
    start_time: str(valid?.startTime ?? valid?.StartTime),
    end_time: str(valid?.endTime ?? valid?.EndTime),
    raw: hazard,
  }
}

/**
 * 回傳 `null` 代表**查詢失敗、狀態未知**；回傳 `[]` 代表**查詢成功且確認無警報**。
 * 這兩者不可混為一談——「不知道有沒有警報」和「確定沒有警報」是不同的事。
 */
export async function queryAdvisories(city: string): Promise<WeatherAdvisory[] | null> {
  const data = await cwaFetch(DATASET_ADVISORY)
  const locations = data?.records?.location
  if (!Array.isArray(locations)) return null

  const hit = locations.find((l: any) => String(l?.locationName ?? '').trim() === city.trim())
  if (!hit) {
    console.warn(`[weather-detector] advisory: 找不到縣市 ${city}（資料含 ${locations.length} 個縣市）`)
    return null
  }
  const hazards = hit?.hazardConditions?.hazards
  if (!Array.isArray(hazards)) return []
  return hazards.map(parseHazard)
}

// ── A-4 紫外線 ──────────────────────────────────────────────────────────────

export async function queryUvIndex(city: string): Promise<number | null> {
  const station = COUNTY_UV_STATION[city]
  if (!station) return null // 沒有代表站就是不知道，不拿別縣市的站硬湊

  const data = await cwaFetch(DATASET_UV)
  const list = data?.records?.weatherElement?.location
  if (!Array.isArray(list)) return null

  const hit = list.find((l: any) => String(l?.StationID) === station)
  if (!hit) {
    // 「有對映但測站不在回應裡」跟「這個縣市沒對映」是兩件事，不可都靜默回 null。
    // 2026-08-04 就是這樣踩到的：新北市原本對映 466880（板橋），但該站根本不在
    // O-A0005-001 的清單中，於是新北市的紫外線永遠是 null 而沒有任何人發現。
    console.warn(
      `[weather-detector] UV: ${city} 對映測站 ${station} 不在回應中（共 ${list.length} 站）——對映表可能已過時`,
    )
    return null
  }
  return toNumberOrNull(hit.UVIndex)
}

// ── A-4 日出日沒 ────────────────────────────────────────────────────────────

export async function querySunTimes(city: string): Promise<{ sunrise: string; sunset: string } | null> {
  const today = todayInTaipei()
  const data = await cwaFetch(DATASET_SUN, { CountyName: city, Date: today })
  const loc = data?.records?.locations?.location?.[0]
  const entry = Array.isArray(loc?.time)
    ? loc.time.find((t: any) => String(t?.Date) === today) ?? loc.time[0]
    : null
  const sunrise = entry?.SunRiseTime
  const sunset = entry?.SunSetTime
  if (typeof sunrise !== 'string' || typeof sunset !== 'string') return null
  return { sunrise, sunset }
}

// ── 判定 ────────────────────────────────────────────────────────────────────

function severityFromRain(prob: number | null): EventSeverity | null {
  if (prob === null) return null
  if (prob >= 0.8) return 'critical'
  if (prob >= 0.6) return 'high'
  if (prob >= 0.4) return 'medium'
  return null
}

const SEVERITY_ORDER: EventSeverity[] = ['low', 'medium', 'high', 'critical']

function maxSeverity(a: EventSeverity | null, b: EventSeverity | null): EventSeverity | null {
  if (a === null) return b
  if (b === null) return a
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b
}

/**
 * 高溫判定以**體感溫度**為準，取不到才退回氣溫。
 * 兩者都是 null 時回 `null`＝**無法判定**，而不是「不熱」。
 */
export function highTemperatureSeverity(
  apparent: number | null,
  raw: number | null,
): EventSeverity | null {
  const t = apparent ?? raw
  if (t === null) return null
  if (t >= 38) return 'critical'
  if (t >= 35) return 'high'
  return null
}

// ── 主入口 ──────────────────────────────────────────────────────────────────

export async function detectWeatherEvent(
  location: { latitude: number; longitude: number },
  override?: { rainfall_probability?: number; temperature_celsius?: number },
): Promise<WeatherEvent | null> {
  const hasOverride =
    override?.rainfall_probability !== undefined || override?.temperature_celsius !== undefined

  // 反查鄉鎮永遠先做——**override 只覆寫它指名的欄位，其餘一律取真實值**。
  //
  // 為什麼不是「有 override 就整段跳過查詢」：weather 頁在天氣好的時候會改送
  // 模擬大雨來展示應變管線（page.tsx 的第二次呼叫），如果 override 模式不查
  // 警特報／紫外線／日出日沒，這些資料在 demo 上**永遠不會出現**——
  // 做完了卻看不到，正是本 repo 反覆發生的「接了也不會動」。
  // 模擬的是降雨，不是紫外線；沒被指名的東西沒有理由跟著變成未知。
  const geo = await reverseGeocode(location.latitude, location.longitude)

  const [realConditions, advisories, uvIndex, sunTimes] = geo
    ? await Promise.all([
        queryConditions(geo.city, geo.town),
        queryAdvisories(geo.city),
        queryUvIndex(geo.city),
        querySunTimes(geo.city),
      ])
    : [null, null, null, null]

  if (!hasOverride && !realConditions) {
    console.warn('[weather-detector] 無法取得天氣要素（反查或 CWA 失敗），不產生事件')
    return null
  }

  const dataSource: WeatherEvent['data_source'] = hasOverride ? 'mock' : 'cwa'

  // 沒給的欄位退回真實值；真實值也沒有才是 null。
  // 先前這裡是 `?? 25`，導致「只覆寫降雨機率」的情境憑空多出一個 25°C 的假溫度。
  const conditions: CwaConditions = hasOverride
    ? {
        rainfall_probability: override!.rainfall_probability ?? realConditions?.rainfall_probability ?? null,
        temperature: override!.temperature_celsius ?? realConditions?.temperature ?? null,
        // 溫度被覆寫時，體感溫度留 null：模擬情境下「這個氣溫對應的體感是幾度」
        // 我們並不知道，硬填一個就是編。heatImpactFactor 會自動退回氣溫，行為仍正確。
        apparent_temperature: override!.temperature_celsius !== undefined
          ? null
          : realConditions?.apparent_temperature ?? null,
        wind_speed_ms: realConditions?.wind_speed_ms ?? null,
        relative_humidity_percent: realConditions?.relative_humidity_percent ?? null,
      }
    : realConditions!

  const hasAdvisory = Array.isArray(advisories) && advisories.length > 0
  const rainSev = severityFromRain(conditions.rainfall_probability)
  const tempSev = highTemperatureSeverity(conditions.apparent_temperature, conditions.temperature)

  // 生效中的警特報是「不可抗力」的法定判準（旅遊定型化契約），
  // 本身就足以構成應變事件——即使降雨機率還沒到門檻。
  const advisorySev: EventSeverity | null = hasAdvisory ? 'high' : null

  const type: WeatherEvent['type'] | null =
    tempSev ? 'high_temperature'
      : rainSev ? 'heavy_rain'
        : hasAdvisory ? 'other'
          : null

  if (!type) return null

  const severity = maxSeverity(maxSeverity(tempSev, rainSev), advisorySev)!

  return {
    kind: 'weather',
    type,
    severity,
    rainfall_probability: conditions.rainfall_probability,
    temperature_celsius: conditions.temperature,
    apparent_temperature_celsius: conditions.apparent_temperature,
    wind_speed_ms: conditions.wind_speed_ms,
    relative_humidity_percent: conditions.relative_humidity_percent,
    uv_index: uvIndex,
    sun_times: sunTimes,
    advisories,
    affected_location: { ...location, radius_km: 5 },
    forecast_duration_minutes: 180,
    data_source: dataSource,
    timestamp: new Date().toISOString(),
  }
}
