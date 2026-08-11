import type { PoiInput, OsmRaw } from '../types'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function queryOsm(poi: PoiInput): Promise<OsmRaw | null> {
  const q = encodeURIComponent(poi.name)
  // extratags=1     → 取回 OSM 原始標籤（covered / shelter / wheelchair / opening_hours…）
  //                    這是 B-1 的核心：`space_type` 在此之前是用景點名稱關鍵字猜的，
  //                    而 space_type 決定期望值模型的 α 值。
  // addressdetails=1 → **沒有這個參數，Nominatim 根本不回 `address` 欄位**。
  //                    2026-08-04 實測確認：現行程式的 `address: r.address ?? null`
  //                    自始至終都是 null，沒有人發現，因為 null 是合法值。
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${q}&countrycodes=tw&format=json&limit=1&accept-language=zh-TW` +
    `&extratags=1&addressdetails=1`

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
    // extratags 是 OSM 貢獻者實際填的標籤，**極度稀疏**。
    // ⚠️ 「沒有 covered 標籤」不等於「沒有遮蔽」，只等於「沒人填」。
    //    下游判定必須把「標籤不存在」當成未知，不可當成否定值。
    const tags: Record<string, string> | null =
      r.extratags && typeof r.extratags === 'object' && Object.keys(r.extratags).length > 0
        ? (r.extratags as Record<string, string>)
        : null

    return {
      osm_id: r.osm_id ? String(r.osm_id) : null,
      display_name: r.display_name ?? null,
      address: r.address ?? null,
      category: r.type ?? r.class ?? null,
      // ⚠️ class/type 是 OSM 的**主要特徵分類**，判定室內外的價值遠高於 extratags。
      // 2026-08-04 實測 8 個真實景點：朱銘美術館 tourism/museum、阿妹茶樓
      // amenity/restaurant、陽明書屋 building/yes、中山樓 building/school——
      // 這些都是明確的室內證據，但**沒有一個出現在 extratags 裡**
      // （extratags 只有 fee、phone、wikidata 之類）。
      // 先前 `category: r.type ?? r.class` 把兩者壓成一個值，等於丟掉一半資訊。
      osm_class: r.class ?? null,
      osm_type: r.type ?? null,
      tags,
    }
  } catch (err) {
    console.warn('[osm] fetch error:', err)
    return null
  }
}
