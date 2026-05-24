"use client"

import React from "react"
import {
  FOREST, FOREST_LIGHT, SLATE, SLATE_SUB, SLATE_BORDER,
  REGIONS, type RegionKey, type MapMode,
} from "./tokens"

interface Props {
  mode: MapMode
  regionFilter: RegionKey
  setRegionFilter: (r: RegionKey) => void
  onToggleMode: () => void
  onlySaved: boolean
  setOnlySaved: (v: boolean) => void
}

export default function MapHeader({
  mode, regionFilter, setRegionFilter, onToggleMode, onlySaved, setOnlySaved,
}: Props) {
  const TABS: [RegionKey, string, string | null][] = [
    ['all', '全部', null],
    ['beihai', '北海岸', REGIONS.beihai.color],
    ['yangming', '陽明山', REGIONS.yangming.color],
    ['dongbei', '東北角', REGIONS.dongbei.color],
  ]

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

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* onlySaved heart toggle */}
          <button
            onClick={e => { e.stopPropagation(); setOnlySaved(!onlySaved) }}
            title={onlySaved ? '顯示全部景點' : '只看收藏'}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: onlySaved ? '#FEF2F2' : '#fff',
              border: `1px solid ${onlySaved ? '#FCA5A5' : SLATE_BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
              transition: 'all 160ms',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={onlySaved ? '#DC2626' : 'none'}>
              <path
                d="M12 20s-7-4.5-9-9c-1.5-3.5 1-7 4.5-7 2 0 3.5 1 4.5 2.5C13 5 14.5 4 16.5 4 20 4 22.5 7.5 21 11c-2 4.5-9 9-9 9z"
                stroke={onlySaved ? '#DC2626' : '#94A3B8'} strokeWidth="2" strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* mode toggle */}
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
      </div>

      {/* Region tabs */}
      <div style={{ display: 'flex', gap: 5 }}>
        {TABS.map(([v, label, color]) => {
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
