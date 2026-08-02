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

    // Nominatim 使用政策要求 User-Agent 能識別應用**並附聯絡管道**，
    // 否則有權直接封鎖。45 筆規模沒人管，擴充到數百筆就有風險。
    //
    // ⚠️ 必須是純 ASCII。HTTP header 值是 ByteString（latin-1），塞中文會讓
    // undici 直接拋 `Cannot convert argument to a ByteString`，整個 OSM 查詢
    // 靜默失敗、每筆景點都少一個來源——2026-08-03 就是這樣炸過一次。
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Navigator-POI-Verifier/0.1 (academic project; +https://github.com/hakuhaku24/tripplanner)',
      },
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
