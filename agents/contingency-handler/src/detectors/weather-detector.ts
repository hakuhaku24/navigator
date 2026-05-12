import type { WeatherEvent, EventSeverity } from '../types'

const CWA_API_KEY = process.env.CWA_API_KEY || process.env.WEATHER_API_KEY
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse'
const CWA_DATASET = 'F-D0047-061' // 臺北市鄉鎮3天預報

// 鄉鎮 → CWA dataset id 映射（北部三個示範縣市；其餘 fallback to 091 city-level）
const TOWNSHIP_DATASET: Record<string, string> = {
  '臺北市': 'F-D0047-061',
  '新北市': 'F-D0047-069',
  '基隆市': 'F-D0047-049',
  '宜蘭縣': 'F-D0047-001',
}

interface CwaResponse {
  success: string
  records: {
    Locations: Array<{
      LocationsName: string
      Location: Array<{
        LocationName: string
        Geocode: string
        WeatherElement: Array<{
          ElementName: string
          Time: Array<{
            StartTime?: string
            EndTime?: string
            DataTime?: string
            ElementValue: Array<Record<string, string>>
          }>
        }>
      }>
    }>
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

// Query CWA precipitation probability for the next ~6 hours
async function queryCwa(
  city: string,
  town: string,
): Promise<{ rainfall_probability: number; temperature: number } | null> {
  if (!CWA_API_KEY) {
    console.warn('[weather-detector] CWA_API_KEY not set')
    return null
  }
  const datasetId = TOWNSHIP_DATASET[city] ?? CWA_DATASET
  const url =
    `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${datasetId}` +
    `?Authorization=${CWA_API_KEY}` +
    `&LocationName=${encodeURIComponent(town)}` +
    `&format=JSON`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[weather-detector] CWA HTTP ${res.status}`)
      return null
    }
    const data = await res.json() as CwaResponse
    if (data.success !== 'true') return null
    const loc = data.records?.Locations?.[0]?.Location?.[0]
    if (!loc) {
      console.warn(`[weather-detector] CWA returned no location for ${city}/${town}`)
      return null
    }

    const rainElem = loc.WeatherElement.find(e => e.ElementName.includes('降雨機率'))
    const tempElem = loc.WeatherElement.find(e => e.ElementName === '溫度')

    // Use the first time slot (closest to now)
    const rainRaw = rainElem?.Time?.[0]?.ElementValue?.[0]?.ProbabilityOfPrecipitation
    const tempRaw = tempElem?.Time?.[0]?.ElementValue?.[0]?.Temperature

    const rainProb = rainRaw && rainRaw !== '-' ? Number(rainRaw) / 100 : 0
    const temp = tempRaw && tempRaw !== '-' ? Number(tempRaw) : 25

    return { rainfall_probability: rainProb, temperature: temp }
  } catch (err) {
    console.warn('[weather-detector] CWA error:', err)
    return null
  }
}

function severityFromRain(prob: number): EventSeverity | null {
  if (prob >= 0.8) return 'critical'
  if (prob >= 0.6) return 'high'
  if (prob >= 0.4) return 'medium'
  return null
}

export async function detectWeatherEvent(
  location: { latitude: number; longitude: number },
  override?: { rainfall_probability?: number; temperature_celsius?: number },
): Promise<WeatherEvent | null> {
  let rainProb: number
  let temp: number
  let dataSource: WeatherEvent['data_source'] = 'cwa'

  if (override?.rainfall_probability !== undefined || override?.temperature_celsius !== undefined) {
    rainProb = override.rainfall_probability ?? 0
    temp = override.temperature_celsius ?? 25
    dataSource = 'mock'
  } else {
    const geo = await reverseGeocode(location.latitude, location.longitude)
    if (!geo) {
      console.warn('[weather-detector] reverse geocode failed, no weather data')
      return null
    }
    const cwa = await queryCwa(geo.city, geo.town)
    if (!cwa) return null
    rainProb = cwa.rainfall_probability
    temp = cwa.temperature
  }

  const now = new Date().toISOString()

  // High-temperature event (independent of rain)
  if (temp >= 35) {
    return {
      kind: 'weather',
      type: 'high_temperature',
      severity: temp >= 38 ? 'critical' : 'high',
      rainfall_probability: rainProb,
      temperature_celsius: temp,
      affected_location: { ...location, radius_km: 5 },
      forecast_duration_minutes: 180,
      data_source: dataSource,
      timestamp: now,
    }
  }

  const rainSev = severityFromRain(rainProb)
  if (!rainSev) return null

  return {
    kind: 'weather',
    type: 'heavy_rain',
    severity: rainSev,
    rainfall_probability: rainProb,
    temperature_celsius: temp,
    affected_location: { ...location, radius_km: 5 },
    forecast_duration_minutes: 180,
    data_source: dataSource,
    timestamp: now,
  }
}
