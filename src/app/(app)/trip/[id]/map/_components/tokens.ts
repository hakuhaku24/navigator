// Shared design tokens, types, and constants for the Map page

export const FOREST       = '#1B4332'
export const FOREST_MID   = '#2D6A4F'
export const FOREST_LIGHT = '#52B788'
export const FOREST_PALE  = '#D8F3DC'
export const SLATE        = '#1E293B'
export const SLATE_SUB    = '#64748B'
export const SLATE_BORDER = '#E2E8F0'

export const REGIONS = {
  beihai:   { name: '北海岸', color: '#0891B2' },
  yangming: { name: '陽明山', color: '#16A34A' },
  dongbei:  { name: '東北角', color: '#D97706' },
} as const

export type RegionKey = keyof typeof REGIONS | 'all'

export const KB_LEVELS = {
  0: { label: '絕對錨點', color: '#DC2626' },
  1: { label: '彈性錨點', color: '#EA580C' },
  2: { label: '條件變動', color: '#0891B2' },
  3: { label: '水位調節', color: '#64748B' },
} as const

export interface MapPOI {
  poi_id: string
  region: keyof typeof REGIONS
  level: 0 | 1 | 2 | 3
  name: string
  photo: string
  reliability_score: number
  sources: string[]
  tags: string[]
  tourist_friendly_description: string
  facts: {
    hours: string
    average_stay_minutes: number
    is_indoor: boolean
    weather_sensitivity: 'low' | 'medium' | 'high'
    address: string
  }
  blog_insights: {
    constraints: string[]
    visitor_tips: string[]
    recent_status: string
  }
}

export interface VB { x: number; y: number; w: number; h: number }
export const INIT_VB: VB = { x: 0, y: 0, w: 360, h: 460 }

export type SheetMode = 'peek' | 'half' | 'reviews'
export type MapMode   = 'explore' | 'route'

export const SNAP_PEEK    = '140px'
export const SNAP_HALF    = '355px'
export const SNAP_REVIEWS = '540px'

export const SHEET_HEIGHT: Record<SheetMode, number> = {
  peek: 140,
  half: 355,
  reviews: 540,
}
