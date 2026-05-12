import * as path from 'path'
import * as fs from 'fs'
import type { POI } from './types'

// Adapter for src/data/pois.ts — converts the Chinese-field schema used by the
// main Next.js app into the canonical POI shape consumed by the contingency
// handler. Keeps the rest of the agent decoupled from front-end data layout.

interface RawPOI {
  id: string
  name: string
  region: string
  category: string
  level: 0 | 1 | 2 | 3
  weather_sensitivity: '低' | '中' | '高' | '極高'
  tags: string[]
  is_indoor: boolean
  indoor_type: string
  duration_min: number
  lat: number
  lng: number
  backup_strategy: string
  image_url: string
  semantic_description: string
  rating: number
}

const SENSITIVITY_MAP: Record<RawPOI['weather_sensitivity'], POI['weather_sensitivity']> = {
  '低': 'low',
  '中': 'medium',
  '高': 'high',
  '極高': 'extreme',
}

function inferSpaceType(raw: RawPOI): POI['space_type'] {
  if (raw.is_indoor) return 'indoor'
  // Heuristic: covered structures (寺廟、亭台、車站) → semi_outdoor
  const semiHints = ['寺', '宮', '亭', '車站', '碼頭', '驛', '商店街', '老街']
  if (semiHints.some(k => raw.name.includes(k))) return 'semi_outdoor'
  return 'outdoor'
}

export function adaptRawPOI(raw: RawPOI): POI {
  return {
    poi_id: raw.id,
    name: raw.name,
    region: raw.region,
    category: raw.category,
    level: raw.level,
    is_indoor: raw.is_indoor,
    space_type: inferSpaceType(raw),
    weather_sensitivity: SENSITIVITY_MAP[raw.weather_sensitivity] ?? 'medium',
    tags: raw.tags,
    duration_min: raw.duration_min,
    latitude: raw.lat,
    longitude: raw.lng,
    rating: raw.rating,
    business_status: 'OPERATIONAL',
    image_url: raw.image_url,
    semantic_description: raw.semantic_description,
    backup_strategy: raw.backup_strategy,
    requires_reservation: raw.level === 0,
  }
}

// Load POIs from the main app's data module. We require() the TS file directly
// (ts-node compiles it on demand). Falls back gracefully if the file is missing.
export function loadAllPois(): POI[] {
  const filePath = path.resolve(__dirname, '..', '..', '..', 'src', 'data', 'pois.ts')
  if (!fs.existsSync(filePath)) {
    console.warn(`[poi-adapter] ${filePath} not found, returning empty pool`)
    return []
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(filePath) as { POIS?: RawPOI[] }
    if (!mod.POIS) {
      console.warn('[poi-adapter] pois.ts loaded but POIS export not found')
      return []
    }
    return mod.POIS.map(adaptRawPOI)
  } catch (err) {
    console.warn('[poi-adapter] failed to load pois.ts:', err)
    return []
  }
}

// Filter helpers used by the candidate-pool selector
export function poisWithin(pool: POI[], origin: { latitude: number; longitude: number }, radiusKm: number): POI[] {
  return pool.filter(p => {
    const dKm = haversineKm(origin.latitude, origin.longitude, p.latitude, p.longitude)
    return dKm <= radiusKm
  })
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
