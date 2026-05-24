"use client"

import React from "react"
import { FOREST, SLATE, SLATE_SUB, KB_LEVELS, type MapPOI } from "./tokens"
import { SAMPLE_ROUTE } from "@/lib/map/data"

interface Props {
  expanded: boolean
  pois: MapPOI[]
}

export default function RouteSummary({ expanded, pois }: Props) {
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
          const p = pois.find(x => x.poi_id === s.poi)
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
