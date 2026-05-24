"use client"

import React from "react"
import { FOREST, SLATE, SLATE_BORDER } from "./tokens"

interface Props {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export default function FloatingControls({ onZoomIn, onZoomOut, onReset }: Props) {
  const btn: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 8,
    background: '#fff', border: `1px solid ${SLATE_BORDER}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    color: SLATE,
  }
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  return (
    <div
      style={{ position: 'absolute', top: 8, right: 12, zIndex: 3, display: 'flex', flexDirection: 'column', gap: 5 }}
      onClick={stop}
    >
      <button style={btn} onClick={onZoomIn} title="放大">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      <button style={btn} onClick={onZoomOut} title="縮小">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      <button style={{ ...btn, color: FOREST }} onClick={onReset} title="重置視角">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
