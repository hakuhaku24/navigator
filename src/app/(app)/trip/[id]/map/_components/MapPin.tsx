"use client"

import React from "react"
import { FOREST, FOREST_LIGHT, REGIONS, KB_LEVELS, type MapPOI } from "./tokens"

interface MapPinProps {
  poi: MapPOI
  x: number
  y: number
  selected?: boolean
  dim?: boolean
  onTap?: () => void
  mode?: 'normal' | 'route'
  routeIdx?: number
}

export function MapPin({
  poi, x, y, selected = false, dim = false, onTap, mode = 'normal', routeIdx,
}: MapPinProps) {
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

export function FavoriteBadge({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x + 6}, ${y - 6})`}>
      <circle r="5.5" fill="#fff" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />
      <path
        d="M 0 1.2 C -1.3 -0.8 -3.5 -0.4 -3.5 1 C -3.5 2.5 -1.5 4 0 5 C 1.5 4 3.5 2.5 3.5 1 C 3.5 -0.4 1.3 -0.8 0 1.2 Z"
        fill="#DC2626"
      />
    </g>
  )
}
