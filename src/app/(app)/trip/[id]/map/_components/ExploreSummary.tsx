"use client"

import React from "react"
import { FOREST, FOREST_MID, SLATE, SLATE_SUB, type MapPOI } from "./tokens"
import MiniCard from "./MiniCard"

interface Props {
  expanded: boolean
  featured: MapPOI[]
  favorites: Set<string>
  onPickFromList: (p: MapPOI) => void
  onSwitchToRoute: () => void
  onlySaved: boolean
  setOnlySaved: (v: boolean) => void
}

export default function ExploreSummary({
  expanded, featured, favorites, onPickFromList, onSwitchToRoute, onlySaved, setOnlySaved,
}: Props) {
  return (
    <div style={{ padding: '4px 14px 16px', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 2px 8px' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: SLATE, letterSpacing: -0.2 }}>精選錨點 · L0–L1</div>
          <div style={{ fontSize: 10, color: SLATE_SUB, marginTop: 2, fontWeight: 500 }}>
            點擊 Pin 查看詳情與評價 · 已收藏 <b style={{ color: '#DC2626' }}>{favorites.size}</b> 筆
          </div>
        </div>

        <button
          onClick={e => { e.stopPropagation(); setOnlySaved(!onlySaved) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 999,
            background: onlySaved ? '#FEF2F2' : '#F8FAFC',
            border: `1px solid ${onlySaved ? '#FCA5A5' : '#E2E8F0'}`,
            color: onlySaved ? '#DC2626' : SLATE_SUB,
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
            transition: 'all 160ms',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill={onlySaved ? '#DC2626' : 'none'}>
            <path
              d="M12 20s-7-4.5-9-9c-1.5-3.5 1-7 4.5-7 2 0 3.5 1 4.5 2.5C13 5 14.5 4 16.5 4 20 4 22.5 7.5 21 11c-2 4.5-9 9-9 9z"
              stroke={onlySaved ? '#DC2626' : '#94A3B8'} strokeWidth="2" strokeLinejoin="round"
            />
          </svg>
          {onlySaved ? '已收藏' : '收藏篩選'}
        </button>
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
