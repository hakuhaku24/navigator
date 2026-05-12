import type { VenueEvent, POI } from '../types'

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY

// Query Google Places to check whether the venue is closed / over capacity.
// Falls back to the POI's own business_status / current_crowd_level fields when
// no API key is available (mock-friendly).
export async function detectVenueEvent(
  poi: POI,
  override?: Partial<VenueEvent>,
): Promise<VenueEvent | null> {
  const now = new Date().toISOString()

  if (override) {
    return {
      kind: 'venue',
      type: override.type ?? 'venue_closure',
      severity: override.severity ?? 'high',
      venue_id: poi.poi_id,
      venue_name: poi.name,
      reason: override.reason ?? 'mock event',
      estimated_recovery_minutes: override.estimated_recovery_minutes,
      current_crowd_level: override.current_crowd_level,
      data_source: 'mock',
      timestamp: now,
    }
  }

  // Inline check on POI snapshot
  if (poi.business_status === 'CLOSED_PERMANENTLY' || poi.business_status === 'CLOSED_TEMPORARILY') {
    return {
      kind: 'venue',
      type: 'venue_closure',
      severity: poi.business_status === 'CLOSED_PERMANENTLY' ? 'critical' : 'high',
      venue_id: poi.poi_id,
      venue_name: poi.name,
      reason: poi.business_status === 'CLOSED_PERMANENTLY' ? '永久歇業' : '臨時休業',
      data_source: 'mock',
      timestamp: now,
    }
  }
  if (poi.current_crowd_level === 'extremely_busy') {
    return {
      kind: 'venue',
      type: 'overcrowding',
      severity: 'high',
      venue_id: poi.poi_id,
      venue_name: poi.name,
      reason: '人潮爆滿',
      current_crowd_level: 'extremely_busy',
      data_source: 'mock',
      timestamp: now,
    }
  }

  // Live Google Places call (optional)
  if (GOOGLE_PLACES_API_KEY) {
    try {
      const query = encodeURIComponent(poi.name)
      const url =
        `https://maps.googleapis.com/maps/api/place/textsearch/json` +
        `?query=${query}&language=zh-TW&key=${GOOGLE_PLACES_API_KEY}`
      const res = await fetch(url)
      if (!res.ok) return null
      const data = await res.json() as { results?: Array<{ business_status?: string }> }
      const status = data.results?.[0]?.business_status
      if (status === 'CLOSED_PERMANENTLY' || status === 'CLOSED_TEMPORARILY') {
        return {
          kind: 'venue',
          type: 'venue_closure',
          severity: status === 'CLOSED_PERMANENTLY' ? 'critical' : 'high',
          venue_id: poi.poi_id,
          venue_name: poi.name,
          reason: status === 'CLOSED_PERMANENTLY' ? '永久歇業 (Google Places)' : '臨時休業 (Google Places)',
          data_source: 'google_places',
          timestamp: now,
        }
      }
    } catch (err) {
      console.warn('[venue-detector] google places error:', err)
    }
  }

  return null
}
