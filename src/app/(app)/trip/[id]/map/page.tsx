"use client"

import React, { useState, useMemo, useEffect } from "react"
import { POI_KB, type POIKnowledge } from "@/data/poi-kb"
import { MAP_COORDS, MAP_RATING, DEFAULT_FAVORITES, SAMPLE_ROUTE } from "@/lib/map/data"
import { INIT_VB, type VB, type MapPOI, type SheetMode } from "./_components/tokens"

import MapHeader from "./_components/MapHeader"
import MapCanvas from "./_components/MapCanvas"
import { MapPin, FavoriteBadge } from "./_components/MapPin"
import RoutePath from "./_components/RoutePath"
import ReviewBubble from "./_components/ReviewBubble"
import FloatingControls from "./_components/FloatingControls"
import StatusBadge from "./_components/StatusBadge"
import ExploreSummary from "./_components/ExploreSummary"
import RouteSummary from "./_components/RouteSummary"
import SelectedDetail from "./_components/SelectedDetail"

// ── Adapt POI_KB → MapPOI ─────────────────────────────────────
const REGION_MAP: Record<string, 'beihai' | 'yangming' | 'dongbei'> = {
  '北海岸': 'beihai', '陽明山': 'yangming', '東北角': 'dongbei',
}
const WEATHER_MAP: Record<string, 'low' | 'medium' | 'high'> = {
  '低': 'low', '中': 'medium', '高': 'high', '極高': 'high',
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
    photo: `url(https://picsum.photos/seed/${encodeURIComponent(kb.id)}/200/130)`,
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

// ── Zoom helper ───────────────────────────────────────────────
function zoomVb(prev: VB, factor: number, cx = 180, cy = 230): VB {
  const nw = Math.max(80, Math.min(360, prev.w * factor))
  const nh = nw * 460 / 360
  const r = nw / prev.w
  return { x: cx - (cx - prev.x) * r, y: cy - (cy - prev.y) * r, w: nw, h: nh }
}

// ── Page ──────────────────────────────────────────────────────
export default function MapPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [regionFilter, setRegionFilter] = useState<'all' | 'beihai' | 'yangming' | 'dongbei'>('all')
  const [favorites, setFavorites] = useState<Set<string>>(new Set(DEFAULT_FAVORITES))
  const [sheetMode, setSheetMode] = useState<SheetMode>('peek')
  const [mapMode, setMapMode] = useState<'explore' | 'route'>('explore')
  const [onlySaved, setOnlySaved] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [vb, setVb] = useState<VB>(INIT_VB)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const zoomIn  = () => setVb(p => zoomVb(p, 1 / 1.35))
  const zoomOut = () => setVb(p => zoomVb(p, 1.35))
  const resetZoom = () => setVb(INIT_VB)

  const selected = selectedId ? MAP_POIS.find(p => p.poi_id === selectedId) ?? null : null

  const toggleFav = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const setOnlySavedWithReset = (v: boolean) => {
    setOnlySaved(v)
    setSelectedId(null)
    setSheetMode('peek')
  }

  const visiblePOIs = useMemo(() => {
    return MAP_POIS.filter(p => {
      if (regionFilter !== 'all' && p.region !== regionFilter) return false
      if (onlySaved && !favorites.has(p.poi_id)) return false
      return true
    })
  }, [regionFilter, onlySaved, favorites])

  const featured = useMemo(
    () => MAP_POIS.filter(p => p.level <= 1).slice(0, 12),
    [],
  )

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
      <MapHeader
        mode={mapMode}
        regionFilter={regionFilter}
        setRegionFilter={r => { setRegionFilter(r); setSelectedId(null); setSheetMode('peek') }}
        onToggleMode={() => {
          setMapMode(m => m === 'explore' ? 'route' : 'explore')
          setSelectedId(null)
          setSheetMode('peek')
          setOnlySaved(false)
        }}
        onlySaved={onlySaved}
        setOnlySaved={setOnlySavedWithReset}
      />

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <MapCanvas vb={vb} setVb={setVb} onMapTap={onMapTap}>
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
        </MapCanvas>

        <FloatingControls onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} />
        <StatusBadge mode={mapMode} count={visiblePOIs.length} savedCount={favorites.size} onlySaved={onlySaved} />
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
            ? <RouteSummary expanded={sheetMode !== 'peek'} pois={MAP_POIS} />
            : <ExploreSummary
                expanded={sheetMode !== 'peek'}
                featured={featured}
                favorites={favorites}
                onPickFromList={onPickPin}
                onSwitchToRoute={() => { setMapMode('route'); setSheetMode('half') }}
                onlySaved={onlySaved}
                setOnlySaved={setOnlySavedWithReset}
              />
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
