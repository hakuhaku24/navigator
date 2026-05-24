"use client"

import React from "react"
import {
  FOREST, FOREST_LIGHT, SLATE, SLATE_SUB, SLATE_BORDER,
  REGIONS, KB_LEVELS, type MapPOI, type SheetMode,
} from "./tokens"
import { MAP_RATING, MAP_REVIEWS } from "@/lib/map/data"
import DetailBody from "./DetailBody"
import ReviewsBody from "./ReviewsBody"

interface Props {
  poi: MapPOI
  favorites: Set<string>
  toggleFav: (id: string) => void
  sheetMode: SheetMode
  setSheetMode: (m: SheetMode) => void
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

export default function SelectedDetail({
  poi, favorites, toggleFav, sheetMode, setSheetMode,
}: Props) {
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
        {!showReviews
          ? <DetailBody poi={poi} />
          : <ReviewsBody reviews={reviews} rating={rating} />
        }
      </div>
    </div>
  )
}
