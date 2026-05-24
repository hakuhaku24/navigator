"use client"

import React from "react"
import { FOREST, FOREST_LIGHT } from "./tokens"
import { SAMPLE_ROUTE } from "@/lib/map/data"

interface Props {
  mode: string
  count: number
  savedCount: number
  onlySaved: boolean
}

export default function StatusBadge({ mode, count, savedCount, onlySaved }: Props) {
  if (onlySaved) {
    return (
      <div style={{ position: 'absolute', top: 8, left: 12, zIndex: 3 }}>
        <div style={{
          background: '#DC2626', backdropFilter: 'blur(8px)',
          padding: '5px 9px', borderRadius: 999,
          fontSize: 10, fontWeight: 700, color: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          ♡ 我的收藏 · {savedCount}
        </div>
      </div>
    )
  }

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
