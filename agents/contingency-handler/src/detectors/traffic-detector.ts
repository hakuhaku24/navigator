import type { TrafficEvent } from '../types'

// Traffic detection is mocked in the prototype — real implementation would call
// Google Maps Distance Matrix and compare to baseline travel time.
export async function detectTrafficEvent(
  route?: { origin: { latitude: number; longitude: number }; destination: { latitude: number; longitude: number } },
  override?: Partial<TrafficEvent>,
): Promise<TrafficEvent | null> {
  if (!route) return null
  if (override) {
    return {
      kind: 'traffic',
      type: override.type ?? 'traffic_jam',
      severity: override.severity ?? 'high',
      affected_route: override.affected_route ?? 'mock-route',
      estimated_delay_minutes: override.estimated_delay_minutes ?? 30,
      alternative_routes: override.alternative_routes,
      data_source: 'mock',
      timestamp: new Date().toISOString(),
    }
  }
  return null
}
