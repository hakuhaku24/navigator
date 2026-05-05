import type { PoiInput, GooglePlacesRaw } from '../types'

const API_KEY = process.env.GOOGLE_PLACES_API_KEY

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

  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[google-places] HTTP ${res.status}`)
      return null
    }

    const data = await res.json()
    if (data.status !== 'OK' || !data.results?.length) {
      console.warn(`[google-places] status=${data.status}`)
      return null
    }

    const r = data.results[0]
    return {
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
    }
  } catch (err) {
    console.warn('[google-places] fetch error:', err)
    return null
  }
}
