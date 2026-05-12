import type { GroupEvent } from '../types'

// Group state detection is mocked in the prototype — real implementation would
// pull from wearables / app self-report.
export async function detectGroupEvent(
  groupState: { member_positions: { latitude: number; longitude: number }[]; timestamps: string[] },
  override?: Partial<GroupEvent>,
): Promise<GroupEvent | null> {
  if (override) {
    return {
      kind: 'group',
      type: override.type ?? 'fatigue',
      severity: override.severity ?? 'medium',
      affected_member_id: override.affected_member_id,
      description: override.description ?? '成員疲憊（mock）',
      data_source: 'mock',
      timestamp: new Date().toISOString(),
    }
  }

  // Member separation: any pairwise distance > 200 m
  if (groupState.member_positions.length >= 2) {
    const [a, b] = groupState.member_positions
    const dKm = haversine(a.latitude, a.longitude, b.latitude, b.longitude)
    if (dKm > 0.2) {
      return {
        kind: 'group',
        type: 'member_separation',
        severity: 'medium',
        description: `成員距離 ${(dKm * 1000).toFixed(0)} m`,
        data_source: 'mock',
        timestamp: new Date().toISOString(),
      }
    }
  }
  return null
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
