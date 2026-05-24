"use client"

import React from "react"
import { SLATE, SLATE_BORDER, KB_LEVELS, REGIONS, type MapPOI } from "./tokens"
import { MAP_RATING } from "@/lib/map/data"

interface Props {
  poi: MapPOI
  saved: boolean
  onClick: () => void
}

export default function MiniCard({ poi, saved, onClick }: Props) {
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
