import type { PoiInput, OsmRaw } from '../types'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function queryOsm(poi: PoiInput): Promise<OsmRaw | null> {
  const q = encodeURIComponent(poi.name)
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${q}&countrycodes=tw&format=json&limit=1&accept-language=zh-TW`

  try {
    // Nominatim rate limit: 1 req/s
    await sleep(1100)

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Navigator-POI-Verifier/0.1' },
    })
    if (!res.ok) {
      console.warn(`[osm] HTTP ${res.status}`)
      return null
    }

    const data = await res.json()
    if (!data?.length) return null

    const r = data[0]
    return {
      osm_id: r.osm_id ? String(r.osm_id) : null,
      display_name: r.display_name ?? null,
      address: r.address ?? null,
      category: r.type ?? r.class ?? null,
    }
  } catch (err) {
    console.warn('[osm] fetch error:', err)
    return null
  }
}
