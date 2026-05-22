"use client"

import React, { useState, useMemo, useEffect } from "react"
import { POI_KB, type POIKnowledge } from "@/data/poi-kb"
import {
  MAP_COORDS, MAP_REVIEWS, MAP_RATING, REVIEW_AVATARS,
  DEFAULT_FAVORITES, SAMPLE_ROUTE, type Review,
} from "@/lib/map/data"

// ── Design tokens ──────────────────────────────────────────────
const FOREST       = '#1B4332'
const FOREST_MID   = '#2D6A4F'
const FOREST_LIGHT = '#52B788'
const FOREST_PALE  = '#D8F3DC'
const WARM_BG      = '#faf9f5'
const SLATE        = '#1E293B'
const SLATE_SUB    = '#64748B'
const SLATE_BORDER = '#E2E8F0'

const REGIONS = {
  beihai:   { name: '北海岸', color: '#0891B2' },
  yangming: { name: '陽明山', color: '#16A34A' },
  dongbei:  { name: '東北角', color: '#D97706' },
} as const

type RegionKey = keyof typeof REGIONS | 'all'

const KB_LEVELS = {
  0: { label: '絕對錨點', color: '#DC2626' },
  1: { label: '彈性錨點', color: '#EA580C' },
  2: { label: '條件變動', color: '#0891B2' },
  3: { label: '水位調節', color: '#64748B' },
} as const

// ── Adapted POI type for the map ───────────────────────────────
interface MapPOI {
  poi_id: string
  region: 'beihai' | 'yangming' | 'dongbei'
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

const REGION_MAP: Record<string, 'beihai' | 'yangming' | 'dongbei'> = {
  '北海岸': 'beihai', '陽明山': 'yangming', '東北角': 'dongbei',
}
const WEATHER_MAP: Record<string, 'low' | 'medium' | 'high'> = {
  '低': 'low', '中': 'medium', '高': 'high', '極高': 'high',
}
const REGION_PHOTO: Record<string, string> = {
  beihai:   'linear-gradient(135deg, #CFE7EE 0%, #5BA3B5 100%)',
  yangming: 'linear-gradient(135deg, #D8F3DC 0%, #52B788 100%)',
  dongbei:  'linear-gradient(135deg, #FEF9EC 0%, #D97706 100%)',
}

function adaptPOI(kb: POIKnowledge): MapPOI {
  const region = REGION_MAP[kb.region] ?? 'beihai'
  const tip = kb.blogPosts[0]?.snippet
    ? kb.blogPosts[0].snippet.slice(0, 70) + '…'
    : null
  const isHighWeather = kb.weatherSensitivity === '高' || kb.weatherSensitivity === '極高'
  return {
    poi_id: kb.id,
    region,
    level: kb.level as 0 | 1 | 2 | 3,
    name: kb.name,
    photo: kb.imageUrl ? `url(${kb.imageUrl})` : REGION_PHOTO[region],
    reliability_score: kb.reliabilityScore,
    sources: kb.sources,
    tags: kb.tags,
    tourist_friendly_description: kb.touristDescription,
    facts: {
      hours: kb.hours,
      average_stay_minutes: kb.durationMin,
      is_indoor: kb.isIndoor,
      weather_sensitivity: WEATHER_MAP[kb.weatherSensitivity] ?? 'medium',
      address: kb.address,
    },
    blog_insights: {
      constraints: isHighWeather ? ['天氣敏感景點，請先確認當日天氣與能見度'] : [],
      visitor_tips: tip ? [tip] : [],
      recent_status: kb.latestBlogDate
        ? `最新資訊來自 ${kb.latestBlogDate} 的部落格記錄`
        : '',
    },
  }
}

const MAP_POIS: MapPOI[] = POI_KB.map(adaptPOI)

// ── Page ───────────────────────────────────────────────────────
type SheetMode = 'peek' | 'half' | 'reviews'

export default function MapPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [regionFilter, setRegionFilter] = useState<RegionKey>('all')
  const [favorites, setFavorites] = useState<Set<string>>(new Set(DEFAULT_FAVORITES))
  const [sheetMode, setSheetMode] = useState<SheetMode>('peek')
  const [mapMode, setMapMode] = useState<'explore' | 'route'>('explore')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const selected = selectedId ? MAP_POIS.find(p => p.poi_id === selectedId) ?? null : null

  const toggleFav = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const visiblePOIs = useMemo(() => {
    return MAP_POIS.filter(p => {
      if (regionFilter !== 'all' && p.region !== regionFilter) return false
      return true
    })
  }, [regionFilter])

  const routeStops = SAMPLE_ROUTE.stops
  const routePoiIds = new Set(routeStops.map(s => s.poi))

  const onPickPin = (poi: MapPOI) => {
    setSelectedId(poi.poi_id)
    setSheetMode('half')
  }

  const onMapTap = () => {
    setSelectedId(null)
    setSheetMode('peek')
  }

  const PEEK_H = 140
  const HALF_H = 340
  const FULL_H = 540
  const sheetH = sheetMode === 'peek' ? PEEK_H : sheetMode === 'half' ? HALF_H : FULL_H
  const bottomNavH = isMobile ? 64 : 0

  return (
    <div style={{
      position: 'relative',
      height: '100dvh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      background: '#EAF1F3',
    }}>
      {/* Header */}
      <MapHeader
        mode={mapMode}
        regionFilter={regionFilter}
        setRegionFilter={setRegionFilter}
        onToggleMode={() => {
          setMapMode(m => m === 'explore' ? 'route' : 'explore')
          setSelectedId(null)
          setSheetMode('peek')
        }}
      />

      {/* Map area */}
      <div style={{ flex: 1, position: 'relative' }} onClick={onMapTap}>
        <MapCanvasSVG>
          {mapMode === 'route' && <RoutePath stops={routeStops} />}

          {mapMode === 'explore' && visiblePOIs.map(p => {
            const c = MAP_COORDS[p.poi_id]
            if (!c) return null
            return (
              <React.Fragment key={p.poi_id}>
                <MapPin
                  poi={p} x={c.x} y={c.y}
                  selected={p.poi_id === selectedId}
                  dim={false}
                  onTap={() => onPickPin(p)}
                />
                {favorites.has(p.poi_id) && <FavoriteBadge x={c.x} y={c.y} />}
              </React.Fragment>
            )
          })}

          {mapMode === 'route' && (
            <>
              {visiblePOIs.filter(p => !routePoiIds.has(p.poi_id)).map(p => {
                const c = MAP_COORDS[p.poi_id]
                if (!c) return null
                return <MapPin key={p.poi_id} poi={p} x={c.x} y={c.y} dim onTap={() => onPickPin(p)} />
              })}
              {routeStops.map((s, i) => {
                const p = MAP_POIS.find(x => x.poi_id === s.poi)
                const c = MAP_COORDS[s.poi]
                if (!p || !c) return null
                return (
                  <MapPin
                    key={s.poi} poi={p} x={c.x} y={c.y}
                    mode="route" routeIdx={i + 1}
                    selected={p.poi_id === selectedId}
                    onTap={() => onPickPin(p)}
                  />
                )
              })}
            </>
          )}

          {selected && MAP_RATING[selected.poi_id] && (
            <ReviewBubble
              x={MAP_COORDS[selected.poi_id]?.x ?? 0}
              y={MAP_COORDS[selected.poi_id]?.y ?? 0}
              rating={MAP_RATING[selected.poi_id]}
            />
          )}
        </MapCanvasSVG>

        <FloatingControls />
        <StatusBadge mode={mapMode} count={visiblePOIs.length} savedCount={favorites.size} />
      </div>

      {/* Bottom sheet */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: 0, right: 0,
          bottom: bottomNavH,
          height: sheetH,
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 30px rgba(15,23,42,0.12)',
          zIndex: 20,
          transition: 'height 280ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* grabber */}
        <div
          onClick={() => {
            if (selected) {
              if (sheetMode === 'peek') setSheetMode('half')
              else if (sheetMode === 'half') setSheetMode('reviews')
              else setSheetMode('peek')
            } else {
              setSheetMode(sheetMode === 'peek' ? 'half' : 'peek')
            }
          }}
          style={{ padding: '8px 0 4px', display: 'flex', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#CBD5E1' }} />
        </div>

        {!selected ? (
          mapMode === 'route'
            ? <RouteSummary expanded={sheetMode !== 'peek'} />
            : <ExploreSummary expanded={sheetMode !== 'peek'} favorites={favorites} onPickFromList={onPickPin} onSwitchToRoute={() => { setMapMode('route'); setSheetMode('half') }} />
        ) : (
          <SelectedDetail
            poi={selected}
            favorites={favorites}
            toggleFav={toggleFav}
            sheetMode={sheetMode}
            setSheetMode={setSheetMode}
          />
        )}
      </div>
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────
function MapHeader({
  mode, regionFilter, setRegionFilter, onToggleMode,
}: {
  mode: 'explore' | 'route'
  regionFilter: RegionKey
  setRegionFilter: (r: RegionKey) => void
  onToggleMode: () => void
}) {
  return (
    <div style={{
      flexShrink: 0, padding: '10px 14px 8px',
      background: 'linear-gradient(180deg, rgba(234,241,243,1) 70%, rgba(234,241,243,0))',
      position: 'relative', zIndex: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: FOREST_LIGHT, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase' }}>
            Navigator Map
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: SLATE, letterSpacing: -0.3, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            景點地圖
            {mode === 'route' && (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', background: FOREST, padding: '2px 7px', borderRadius: 4, letterSpacing: 0.5 }}>
                路線預覽
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onToggleMode}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: mode === 'route' ? FOREST : '#fff',
            padding: '7px 10px', borderRadius: 999,
            border: `1px solid ${mode === 'route' ? FOREST : SLATE_BORDER}`,
            color: mode === 'route' ? '#fff' : SLATE_SUB,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <circle cx="5" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="19" cy="12" r="2" fill="currentColor" />
            <path d="M7 12h5M14 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {mode === 'route' ? '探索模式' : '路線預覽'}
        </button>
      </div>

      {/* Region tabs */}
      <div style={{ display: 'flex', gap: 5 }}>
        {([['all', '全部', null], ['beihai', '北海岸', REGIONS.beihai.color], ['yangming', '陽明山', REGIONS.yangming.color], ['dongbei', '東北角', REGIONS.dongbei.color]] as [RegionKey, string, string | null][]).map(([v, label, color]) => {
          const on = regionFilter === v
          return (
            <button
              key={v}
              onClick={e => { e.stopPropagation(); setRegionFilter(v) }}
              style={{
                padding: '5px 11px', borderRadius: 999,
                background: on ? (color || FOREST) : '#fff',
                color: on ? '#fff' : SLATE_SUB,
                border: `1px solid ${on ? (color || FOREST) : SLATE_BORDER}`,
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                transition: 'all 160ms',
              }}
            >
              {color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? '#fff' : color }} />}
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Status badge ────────────────────────────────────────────────
function StatusBadge({ mode, count, savedCount }: { mode: string; count: number; savedCount: number }) {
  return (
    <div style={{ position: 'absolute', top: 8, left: 12, zIndex: 3 }}>
      <div style={{
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
        padding: '5px 9px', borderRadius: 999,
        fontSize: 10, fontWeight: 700, color: FOREST,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
          <path d="M9 12l2 2 4-4" stroke={FOREST_LIGHT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="9" stroke={FOREST_LIGHT} strokeWidth="2" />
        </svg>
        {mode === 'route' ? `路線 · ${SAMPLE_ROUTE.stops.length} 站` : `三源驗證 · ${count}`}
      </div>
    </div>
  )
}

// ── Floating controls ───────────────────────────────────────────
function FloatingControls() {
  const btn: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8,
    background: '#fff', border: `1px solid ${SLATE_BORDER}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    color: SLATE,
  }
  return (
    <div style={{ position: 'absolute', top: 8, right: 12, zIndex: 3, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <button style={btn}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      <button style={btn}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      <button style={{ ...btn, color: FOREST }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <button style={btn}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M4 6h16M4 12h10M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

// ── SVG Map Canvas ──────────────────────────────────────────────
function MapCanvasSVG({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 360 460" style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="sea-gradient" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="#CFE7EE" />
          <stop offset="1" stopColor="#A8D4DE" />
        </linearGradient>
        <linearGradient id="land-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F1ECDF" />
          <stop offset="1" stopColor="#E6DFCB" />
        </linearGradient>
        <pattern id="sea-dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.6" fill="rgba(255,255,255,0.5)" />
        </pattern>
        <pattern id="grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.025)" strokeWidth="0.5" />
        </pattern>
        <filter id="land-shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
          <feOffset dx="0" dy="1" />
          <feComponentTransfer><feFuncA type="linear" slope="0.18" /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <rect width="360" height="460" fill="url(#sea-gradient)" />
      <rect width="360" height="460" fill="url(#sea-dots)" />
      <ellipse cx="332" cy="98" rx="6" ry="3" fill="#7BB2BC" opacity="0.85" />
      <ellipse cx="338" cy="100" rx="2" ry="1" fill="#7BB2BC" opacity="0.85" />

      {/* Land */}
      <path
        d="M 0 240 Q 10 200 28 170 Q 40 145 56 118 Q 70 92 96 70 Q 124 50 158 42 Q 196 36 230 50 Q 262 60 286 88 Q 308 116 322 152 Q 332 184 340 220 Q 348 270 350 320 L 360 360 L 360 460 L 0 460 Z"
        fill="url(#land-gradient)" filter="url(#land-shadow)"
      />
      <path
        d="M 0 240 Q 10 200 28 170 Q 40 145 56 118 Q 70 92 96 70 Q 124 50 158 42 Q 196 36 230 50 Q 262 60 286 88 Q 308 116 322 152 Q 332 184 340 220 Q 348 270 350 320"
        fill="none" stroke="rgba(82,121,135,0.45)" strokeWidth="1.2" strokeLinecap="round"
      />

      {/* Coast texture */}
      <g stroke="rgba(82,121,135,0.3)" strokeWidth="0.7" fill="none">
        <path d="M 78 64 Q 82 58 86 64" /><path d="M 116 50 Q 120 45 124 50" />
        <path d="M 168 38 Q 172 34 176 38" /><path d="M 220 42 Q 224 38 228 42" />
        <path d="M 282 80 Q 286 76 290 80" /><path d="M 314 138 Q 318 134 322 138" />
      </g>

      {/* Region tints */}
      <ellipse cx="100" cy="80" rx="90" ry="42" fill="#0891B2" opacity="0.07" />
      <ellipse cx="140" cy="190" rx="76" ry="58" fill="#16A34A" opacity="0.08" />
      <ellipse cx="280" cy="170" rx="68" ry="68" fill="#D97706" opacity="0.07" />

      {/* Mountain ridges */}
      <g stroke="rgba(60,80,50,0.32)" strokeWidth="1.1" fill="none" strokeLinecap="round">
        <path d="M 90 200 L 105 180 L 120 195 L 140 168 L 160 180 L 175 165 L 195 185" />
        <path d="M 100 220 L 118 205 L 132 215 L 150 198 L 168 210 L 186 198" />
        <path d="M 116 158 L 130 145 L 148 155 L 168 142" />
      </g>
      <g fill="rgba(60,80,50,0.18)">
        <polygon points="140,148 148,162 132,162" />
        <polygon points="156,154 164,168 148,168" />
      </g>
      <g stroke="rgba(120,75,40,0.32)" strokeWidth="1.1" fill="none" strokeLinecap="round">
        <path d="M 232 152 L 246 140 L 258 152 L 272 138" />
        <path d="M 244 168 L 256 158 L 268 168" />
      </g>

      {/* Roads */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 8 240 Q 24 205 42 180 Q 62 145 80 122 Q 110 96 142 88 Q 174 86 200 96 Q 234 110 256 132 Q 280 152 300 180 Q 318 218 326 250"
          stroke="#ffffff" strokeWidth="3.5" opacity="0.7" />
        <path d="M 8 240 Q 24 205 42 180 Q 62 145 80 122 Q 110 96 142 88 Q 174 86 200 96 Q 234 110 256 132 Q 280 152 300 180 Q 318 218 326 250"
          stroke="#94A3B8" strokeWidth="1.1" strokeDasharray="4 4" />
        <path d="M 88 240 Q 100 220 120 205 Q 138 195 156 192 Q 172 200 184 215"
          stroke="#ffffff" strokeWidth="3" opacity="0.6" />
        <path d="M 88 240 Q 100 220 120 205 Q 138 195 156 192 Q 172 200 184 215"
          stroke="#94A3B8" strokeWidth="0.9" strokeDasharray="3 3" />
      </g>

      <rect x="0" y="0" width="360" height="460" fill="url(#grid)" opacity="0.3" />

      {/* Region labels */}
      <g style={{ fontFamily: '-apple-system, "Noto Sans TC", system-ui', fontSize: 9.5, fontWeight: 700, letterSpacing: 2 }}>
        <text x="76" y="42" fill="#0891B2" opacity="0.55">北　海　岸</text>
        <text x="116" y="262" fill="#16A34A" opacity="0.55">陽　明　山</text>
        <text x="248" y="106" fill="#D97706" opacity="0.55">東　北　角</text>
      </g>

      {/* Compass */}
      <g transform="translate(330, 410)">
        <circle r="14" fill="rgba(255,255,255,0.85)" stroke="rgba(0,0,0,0.08)" />
        <polygon points="0,-10 3,0 0,10 -3,0" fill="#1B4332" />
        <text x="0" y="-11" textAnchor="middle" fontSize="7" fontWeight="700" fill="#1B4332" style={{ fontFamily: 'system-ui' }}>N</text>
      </g>

      {children}
    </svg>
  )
}

// ── Map Pin ─────────────────────────────────────────────────────
function MapPin({
  poi, x, y, selected = false, dim = false, onTap, mode = 'normal', routeIdx,
}: {
  poi: MapPOI; x: number; y: number; selected?: boolean; dim?: boolean
  onTap?: () => void; mode?: 'normal' | 'route'; routeIdx?: number
}) {
  const L = KB_LEVELS[poi.level as keyof typeof KB_LEVELS]
  const R = REGIONS[poi.region]

  if (mode === 'route') {
    return (
      <g transform={`translate(${x}, ${y})`} style={{ cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); onTap?.() }}>
        <circle r="14" fill="#fff" stroke={FOREST} strokeWidth="2.5" />
        <circle r="11" fill={FOREST} />
        <text y="3.5" textAnchor="middle" fill="#fff"
          style={{ fontFamily: '-apple-system, system-ui', fontSize: 11, fontWeight: 800 }}>
          {routeIdx}
        </text>
        {selected && <circle r="20" fill="none" stroke={FOREST_LIGHT} strokeWidth="2" opacity="0.65" />}
      </g>
    )
  }

  const isAnchor = poi.level === 0
  const r = isAnchor ? 7 : 5.5

  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ cursor: 'pointer', opacity: dim ? 0.3 : 1, transition: 'opacity 200ms' }}
      onClick={e => { e.stopPropagation(); onTap?.() }}
    >
      {selected && (
        <>
          <circle r="18" fill={R.color} opacity="0.15">
            <animate attributeName="r" values="18;26;18" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.25;0;0.25" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle r="14" fill={R.color} opacity="0.22" />
        </>
      )}
      {isAnchor && !selected && <circle r="10" fill="none" stroke={R.color} strokeWidth="1.2" opacity="0.4" />}
      <ellipse cy="2" rx={r * 0.9} ry={r * 0.35} fill="rgba(0,0,0,0.18)" />
      <circle r={r} fill={R.color} stroke="#fff" strokeWidth="1.8" />
      {isAnchor && <circle r={r - 3} fill="#fff" opacity="0.95" />}
      {selected && (
        <text y={-r - 5} textAnchor="middle" fontSize="8.5" fontWeight="800"
          fill={L.color} style={{ fontFamily: 'system-ui' }}>
          L{poi.level}
        </text>
      )}
    </g>
  )
}

// ── Favorite Badge ──────────────────────────────────────────────
function FavoriteBadge({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x + 6}, ${y - 6})`}>
      <circle r="5.5" fill="#fff" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />
      <path d="M 0 1.2 C -1.3 -0.8 -3.5 -0.4 -3.5 1 C -3.5 2.5 -1.5 4 0 5 C 1.5 4 3.5 2.5 3.5 1 C 3.5 -0.4 1.3 -0.8 0 1.2 Z"
        fill="#DC2626" />
    </g>
  )
}

// ── Route Path ──────────────────────────────────────────────────
function RoutePath({ stops }: { stops: typeof SAMPLE_ROUTE.stops }) {
  const points = stops.map(s => MAP_COORDS[s.poi]).filter(Boolean)
  if (points.length < 2) return null

  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1]
    const p1 = points[i]
    const mx = (p0.x + p1.x) / 2
    const my = (p0.y + p1.y) / 2
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const len = Math.sqrt(dx * dx + dy * dy)
    const offset = Math.min(len * 0.18, 24)
    const cx = mx - (dy / len) * offset
    const cy = my + (dx / len) * offset
    d += ` Q ${cx} ${cy}, ${p1.x} ${p1.y}`
  }

  return (
    <g>
      <path d={d} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.85" />
      <path d={d} fill="none" stroke={FOREST} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="6 5" />
    </g>
  )
}

// ── Review Bubble ───────────────────────────────────────────────
function ReviewBubble({ x, y, rating }: { x: number; y: number; rating: { avg: string; count: number } }) {
  return (
    <g transform={`translate(${x}, ${y - 26})`} style={{ pointerEvents: 'none' }}>
      <rect x="-26" y="-13" width="52" height="20" rx="10" fill="#fff" stroke="rgba(0,0,0,0.08)" />
      <polygon points="-4,7 4,7 0,11" fill="#fff" />
      <text x="-15" y="2" fontSize="10" fontWeight="800" fill="#EAB308" style={{ fontFamily: 'system-ui' }}>★</text>
      <text x="-6" y="2" fontSize="10" fontWeight="800" fill={SLATE} style={{ fontFamily: 'system-ui' }}>{rating.avg}</text>
      <text x="11" y="2" fontSize="8.5" fontWeight="600" fill={SLATE_SUB} style={{ fontFamily: 'system-ui' }}>·{rating.count}則</text>
    </g>
  )
}

// ── Explore Summary (bottom sheet — no selection) ───────────────
function ExploreSummary({
  expanded, favorites, onPickFromList, onSwitchToRoute,
}: {
  expanded: boolean
  favorites: Set<string>
  onPickFromList: (p: MapPOI) => void
  onSwitchToRoute: () => void
}) {
  const featured = MAP_POIS.filter(p => p.level <= 1).slice(0, 12)
  return (
    <div style={{ padding: '4px 14px 16px', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 2px 8px' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: SLATE, letterSpacing: -0.2 }}>精選錨點 · L0–L1</div>
          <div style={{ fontSize: 10, color: SLATE_SUB, marginTop: 2, fontWeight: 500 }}>
            點擊 Pin 查看詳情與評價 · 已收藏 <b style={{ color: '#DC2626' }}>{favorites.size}</b> 筆
          </div>
        </div>
        <div style={{ fontSize: 9, color: SLATE_SUB, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
          {expanded ? '收合 ▾' : '展開 ▴'}
        </div>
      </div>

      <div
        style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, paddingRight: 14, marginLeft: -14, paddingLeft: 14 }}
        className="nav-scrollhide"
      >
        {featured.map(p => (
          <MiniCard key={p.poi_id} poi={p} saved={favorites.has(p.poi_id)} onClick={() => onPickFromList(p)} />
        ))}
      </div>

      {expanded && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 10,
          background: '#F8FAF9', border: '1px solid #E6EFE9',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, ${FOREST}, ${FOREST_MID})`,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800,
          }}>🗺</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: SLATE }}>已有規劃完的行程？</div>
            <div style={{ fontSize: 10.5, color: SLATE_SUB, marginTop: 1 }}>切換至「路線預覽」即可在地圖上瀏覽。</div>
          </div>
          <button
            onClick={onSwitchToRoute}
            style={{ background: FOREST, color: '#fff', border: 'none', padding: '7px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            查看 →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Mini Card ───────────────────────────────────────────────────
function MiniCard({ poi, saved, onClick }: { poi: MapPOI; saved: boolean; onClick: () => void }) {
  const L = KB_LEVELS[poi.level as keyof typeof KB_LEVELS]
  const R = REGIONS[poi.region]
  const rating = MAP_RATING[poi.poi_id]
  return (
    <div onClick={onClick} style={{
      width: 132, flexShrink: 0,
      background: '#fff', border: `1px solid ${SLATE_BORDER}`,
      borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
      boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
    }}>
      <div style={{ height: 60, background: poi.photo, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
        <span style={{
          position: 'absolute', top: 5, left: 5,
          background: L.color, color: '#fff',
          fontSize: 8.5, fontWeight: 800, padding: '2px 5px', borderRadius: 3, letterSpacing: 0.4,
        }}>L{poi.level}</span>
        {saved && (
          <span style={{
            position: 'absolute', top: 5, right: 5,
            width: 16, height: 16, borderRadius: '50%',
            background: 'rgba(255,255,255,0.95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: '#DC2626',
          }}>♥</span>
        )}
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{
          fontSize: 11.5, fontWeight: 700, color: SLATE,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: -0.2,
        }}>{poi.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9.5, color: R.color, fontWeight: 700 }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: R.color }} />
            {R.name}
          </span>
          {rating && (
            <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: SLATE, display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <span style={{ color: '#EAB308' }}>★</span>{rating.avg}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Route Summary ───────────────────────────────────────────────
function RouteSummary({ expanded }: { expanded: boolean }) {
  const totalH = Math.floor(SAMPLE_ROUTE.totalMinutes / 60)
  const totalM = SAMPLE_ROUTE.totalMinutes % 60
  return (
    <div style={{ padding: '4px 16px 16px', flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: SLATE, letterSpacing: -0.3 }}>{SAMPLE_ROUTE.title}</div>
          <div style={{ fontSize: 10, color: SLATE_SUB, marginTop: 2, fontWeight: 500 }}>
            {SAMPLE_ROUTE.date} · {SAMPLE_ROUTE.members} 人成行
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 700, color: FOREST }}>
          <span>{totalH}h {totalM}m</span>
          <span style={{ width: 1, height: 12, background: '#CBD5E1' }} />
          <span>{SAMPLE_ROUTE.totalKm} km</span>
        </div>
      </div>

      <div style={{ position: 'relative', paddingLeft: 4 }}>
        {SAMPLE_ROUTE.stops.map((s, i) => {
          const p = MAP_POIS.find(x => x.poi_id === s.poi)
          if (!p) return null
          const L = KB_LEVELS[p.level as keyof typeof KB_LEVELS]
          return (
            <div key={s.poi} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: i < SAMPLE_ROUTE.stops.length - 1 ? 14 : 4 }}>
              {i < SAMPLE_ROUTE.stops.length - 1 && (
                <div style={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: 2, background: '#E2E8F0', zIndex: 0 }} />
              )}
              <div style={{
                width: 24, height: 24, flexShrink: 0,
                background: FOREST, color: '#fff', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, position: 'relative', zIndex: 1,
                border: '2px solid #fff', boxShadow: `0 0 0 1.5px ${FOREST}`,
              }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: SLATE, letterSpacing: -0.2 }}>{p.name}</div>
                  <span style={{ fontSize: 8.5, fontWeight: 800, color: '#fff', background: L.color, padding: '1px 4px', borderRadius: 3 }}>L{p.level}</span>
                </div>
                <div style={{ fontSize: 10, color: SLATE_SUB, marginTop: 1, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontFamily: '"SF Mono", monospace', color: SLATE }}>{s.arrive} → {s.depart}</span>
                  <span style={{ width: 2, height: 2, borderRadius: '50%', background: '#CBD5E1' }} />
                  <span>{s.note}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {expanded && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button style={{ flex: 1, padding: 10, borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: FOREST, color: '#fff' }}>
            開始導航
          </button>
          <button style={{ flex: 1, padding: 10, borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${FOREST}`, background: '#fff', color: FOREST }}>
            分享路線
          </button>
        </div>
      )}
    </div>
  )
}

// ── Selected Detail ─────────────────────────────────────────────
function SelectedDetail({
  poi, favorites, toggleFav, sheetMode, setSheetMode,
}: {
  poi: MapPOI; favorites: Set<string>; toggleFav: (id: string) => void
  sheetMode: SheetMode; setSheetMode: (m: SheetMode) => void
}) {
  const L = KB_LEVELS[poi.level as keyof typeof KB_LEVELS]
  const R = REGIONS[poi.region]
  const rating = MAP_RATING[poi.poi_id]
  const reviews = MAP_REVIEWS[poi.poi_id] ?? []
  const saved = favorites.has(poi.poi_id)
  const showReviews = sheetMode === 'reviews'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{
            width: 64, height: 64, flexShrink: 0,
            background: poi.photo, backgroundSize: 'cover', backgroundPosition: 'center',
            borderRadius: 10, position: 'relative', overflow: 'hidden',
          }}>
            <span style={{
              position: 'absolute', top: 4, left: 4,
              background: L.color, color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 3,
            }}>L{poi.level}</span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: R.color, fontWeight: 700, marginBottom: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: R.color }} />
              {R.name}
              <span style={{ width: 2, height: 2, borderRadius: '50%', background: '#CBD5E1' }} />
              <span style={{ color: SLATE_SUB, fontSize: 9 }}>{poi.poi_id}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: SLATE, letterSpacing: -0.3, lineHeight: 1.15 }}>{poi.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 10.5, fontWeight: 600 }}>
              {rating ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: SLATE }}>
                  <span style={{ color: '#EAB308', fontSize: 12 }}>★</span>
                  <b style={{ fontSize: 12 }}>{rating.avg}</b>
                  <span style={{ color: SLATE_SUB, fontWeight: 500 }}>({rating.count})</span>
                </span>
              ) : (
                <span style={{ color: SLATE_SUB }}>尚無評價</span>
              )}
              <span style={{ width: 2, height: 2, borderRadius: '50%', background: '#CBD5E1' }} />
              <span style={{ color: FOREST, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                  <path d="M9 12l2 2 4-4" stroke={FOREST_LIGHT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="9" stroke={FOREST_LIGHT} strokeWidth="2" />
                </svg>
                可信 {poi.reliability_score.toFixed(2)}
              </span>
            </div>
          </div>

          <button onClick={() => toggleFav(poi.poi_id)} style={{
            width: 36, height: 36, borderRadius: 10,
            background: saved ? '#FEF2F2' : '#fff',
            border: `1px solid ${saved ? '#FCA5A5' : SLATE_BORDER}`,
            cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 180ms',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? '#DC2626' : 'none'}>
              <path d="M12 20s-7-4.5-9-9c-1.5-3.5 1-7 4.5-7 2 0 3.5 1 4.5 2.5C13 5 14.5 4 16.5 4 20 4 22.5 7.5 21 11c-2 4.5-9 9-9 9z"
                stroke={saved ? '#DC2626' : '#94A3B8'} strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div style={{
          marginTop: 8, fontSize: 11.5, color: SLATE_SUB, lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        } as React.CSSProperties}>
          {poi.tourist_friendly_description}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px', flexShrink: 0 }}>
        <button style={detailBtn('primary')}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          加入行程
        </button>
        <button onClick={() => setSheetMode(showReviews ? 'half' : 'reviews')} style={detailBtn(showReviews ? 'on' : 'ghost')}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M4 4h16v12H7l-3 4V4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          評價 {rating ? `(${rating.count})` : ''}
        </button>
        <button style={detailBtn('ghost')}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          分享
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!showReviews ? <DetailBody poi={poi} /> : <ReviewsBody reviews={reviews} rating={rating} />}
      </div>
    </div>
  )
}

function detailBtn(variant: 'primary' | 'on' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    flex: 1, padding: '9px 6px', borderRadius: 9,
    fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
  }
  if (variant === 'primary') return { ...base, background: FOREST, color: '#fff', border: 'none' }
  if (variant === 'on') return { ...base, background: '#FFF8EB', color: '#B45309', border: '1px solid #FCD34D' }
  return { ...base, background: '#fff', color: SLATE, border: `1px solid ${SLATE_BORDER}` }
}

// ── Detail Body ─────────────────────────────────────────────────
function DetailBody({ poi }: { poi: MapPOI }) {
  const f = poi.facts
  const ins = poi.blog_insights
  return (
    <div style={{ padding: '0 14px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
        <Fact label="營業時間" value={f.hours || '未知'} />
        <Fact label="平均停留" value={`${f.average_stay_minutes} 分鐘`} />
        <Fact label="場域" value={f.is_indoor ? '室內' : '戶外'} color={f.is_indoor ? FOREST : '#0891B2'} />
        <Fact
          label="天氣敏感"
          value={{ low: '低', medium: '中', high: '高' }[f.weather_sensitivity]}
          color={{ low: '#10B981', medium: '#F59E0B', high: '#EF4444' }[f.weather_sensitivity]}
        />
      </div>

      {f.address && (
        <div style={{
          marginTop: 8, padding: '7px 9px', background: '#F8FAFC',
          borderRadius: 8, fontSize: 10, color: SLATE_SUB,
          display: 'flex', alignItems: 'flex-start', gap: 5, fontWeight: 500,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z" stroke={SLATE_SUB} strokeWidth="1.8" />
            <circle cx="12" cy="10" r="3" stroke={SLATE_SUB} strokeWidth="1.8" />
          </svg>
          <span style={{ flex: 1, lineHeight: 1.4 }}>{f.address}</span>
        </div>
      )}

      {(ins.constraints.length > 0 || ins.visitor_tips.length > 0) && (
        <div style={{
          marginTop: 10, padding: '8px 10px',
          background: 'rgba(82,183,136,0.06)',
          borderLeft: `2px solid ${FOREST_LIGHT}`,
          borderRadius: '4px 8px 8px 4px',
          fontSize: 10.5, lineHeight: 1.55,
        }}>
          <div style={{
            fontSize: 9, color: FOREST, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', marginBottom: 4,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 8, background: FOREST, color: '#fff', padding: '1px 4px', borderRadius: 2 }}>LLM</span>
            來自 {poi.sources.length} 個來源的洞察
          </div>
          {ins.constraints[0] && (
            <div style={{ display: 'flex', gap: 4, color: '#B45309', marginTop: 2 }}>
              <span>⚠</span><span>{ins.constraints[0]}</span>
            </div>
          )}
          {ins.visitor_tips[0] && (
            <div style={{ display: 'flex', gap: 4, color: FOREST, marginTop: 2 }}>
              <span>💡</span><span>{ins.visitor_tips[0]}</span>
            </div>
          )}
          {ins.recent_status && (
            <div style={{ display: 'flex', gap: 4, color: SLATE_SUB, marginTop: 2 }}>
              <span>📍</span><span>{ins.recent_status}</span>
            </div>
          )}
        </div>
      )}

      {poi.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
          {poi.tags.slice(0, 5).map(t => (
            <span key={t} style={{
              fontSize: 10, color: SLATE_SUB, fontWeight: 600,
              background: '#F1F5F9', padding: '3px 8px', borderRadius: 999,
            }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 7, padding: '6px 8px' }}>
      <div style={{ fontSize: 8.5, color: SLATE_SUB, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 11, color: color ?? SLATE, fontWeight: 700, marginTop: 1, lineHeight: 1.3 }}>{value}</div>
    </div>
  )
}

// ── Reviews Body ────────────────────────────────────────────────
function ReviewsBody({ reviews, rating }: { reviews: Review[]; rating?: { avg: string; count: number } }) {
  if (reviews.length === 0 || !rating) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: SLATE_SUB, fontSize: 12 }}>
        尚無使用者評價，加入收藏成為第一位！
      </div>
    )
  }

  const dist = [5, 4, 3, 2, 1].map(s => ({
    stars: s, count: reviews.filter(r => r.stars === s).length,
  }))
  const maxC = Math.max(...dist.map(d => d.count), 1)

  return (
    <div style={{ padding: '0 14px 16px' }}>
      <div style={{
        display: 'flex', gap: 14, padding: '8px 12px',
        background: '#FFFBEB', border: '1px solid #FCD34D',
        borderRadius: 10, marginBottom: 12,
      }}>
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#B45309', letterSpacing: -1, lineHeight: 1 }}>{rating.avg}</div>
          <div style={{ fontSize: 14, color: '#EAB308', marginTop: 2, lineHeight: 1 }}>
            {'★'.repeat(Math.round(parseFloat(rating.avg)))}
            <span style={{ color: '#FDE68A' }}>{'★'.repeat(5 - Math.round(parseFloat(rating.avg)))}</span>
          </div>
          <div style={{ fontSize: 9, color: '#92400E', marginTop: 3, fontWeight: 600 }}>{rating.count} 則評價</div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center' }}>
          {dist.map(d => (
            <div key={d.stars} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, color: '#92400E', fontWeight: 600 }}>
              <span style={{ width: 8 }}>{d.stars}</span>
              <span style={{ color: '#EAB308' }}>★</span>
              <div style={{ flex: 1, height: 4, borderRadius: 999, background: '#FEF3C7', overflow: 'hidden' }}>
                <div style={{ width: `${(d.count / maxC) * 100}%`, height: '100%', background: '#EAB308', borderRadius: 999 }} />
              </div>
              <span style={{ width: 10, textAlign: 'right' }}>{d.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {reviews.map((r, i) => {
          const u = REVIEW_AVATARS[r.user]
          return (
            <div key={i} style={{ border: `1px solid ${SLATE_BORDER}`, borderRadius: 10, padding: '9px 11px', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: u.color, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>{u.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: SLATE, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {u.name}
                    {r.verified && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: '#fff', background: FOREST_LIGHT, padding: '1px 4px', borderRadius: 2 }}>
                        已驗證
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, fontSize: 9.5, color: SLATE_SUB }}>
                    <span style={{ color: '#EAB308', fontSize: 10 }}>
                      {'★'.repeat(r.stars)}<span style={{ color: '#E5E7EB' }}>{'★'.repeat(5 - r.stars)}</span>
                    </span>
                    <span>·</span>
                    <span>{r.date}</span>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: SLATE, lineHeight: 1.55 }}>{r.text}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, fontSize: 9.5, color: SLATE_SUB, fontWeight: 600 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M7 11V21M7 11l5-7c1 0 2 1 2 3v3h6c1 0 2 1 2 2l-2 8c0 1-1 2-2 2H7"
                      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                  {r.helpful} 人覺得有用
                </span>
                <span style={{ marginLeft: 'auto', color: FOREST }}>回覆</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
