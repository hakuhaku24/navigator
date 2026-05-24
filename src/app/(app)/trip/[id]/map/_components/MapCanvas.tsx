"use client"

import React, { useRef, useEffect, useState } from "react"
import type { VB } from "./tokens"

interface Props {
  children: React.ReactNode
  vb: VB
  setVb: React.Dispatch<React.SetStateAction<VB>>
  onMapTap: () => void
}

export default function MapCanvas({ children, vb, setVb, onMapTap }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDragging = useRef(false)
  const didDrag = useRef(false)
  const lastPt = useRef({ x: 0, y: 0 })
  const [grabbing, setGrabbing] = useState(false)

  useEffect(() => {
    const el = svgRef.current!
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
      const cx = e.clientX, cy = e.clientY
      setVb(prev => {
        const px = prev.x + (cx - rect.left) / rect.width * prev.w
        const py = prev.y + (cy - rect.top) / rect.height * prev.h
        const nw = Math.max(80, Math.min(360, prev.w * factor))
        const nh = nw * 460 / 360
        const r = nw / prev.w
        return { x: px - (px - prev.x) * r, y: py - (py - prev.y) * r, w: nw, h: nh }
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [setVb])

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    isDragging.current = true
    didDrag.current = false
    lastPt.current = { x: e.clientX, y: e.clientY }
    setGrabbing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastPt.current.x
    const dy = e.clientY - lastPt.current.y
    if (Math.abs(dx) + Math.abs(dy) > 3) didDrag.current = true
    lastPt.current = { x: e.clientX, y: e.clientY }
    const rect = e.currentTarget.getBoundingClientRect()
    setVb(prev => ({
      ...prev,
      x: prev.x - dx / rect.width * prev.w,
      y: prev.y - dy / rect.height * prev.h,
    }))
  }

  const onPointerUp = () => { isDragging.current = false; setGrabbing(false) }

  const onSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!didDrag.current) { e.stopPropagation(); onMapTap() }
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid slice"
      style={{
        width: '100%', height: '100%', display: 'block',
        cursor: grabbing ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
      } as React.CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={onSvgClick}
    >
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

      <path
        d="M 0 240 Q 10 200 28 170 Q 40 145 56 118 Q 70 92 96 70 Q 124 50 158 42 Q 196 36 230 50 Q 262 60 286 88 Q 308 116 322 152 Q 332 184 340 220 Q 348 270 350 320 L 360 360 L 360 460 L 0 460 Z"
        fill="url(#land-gradient)" filter="url(#land-shadow)"
      />
      <path
        d="M 0 240 Q 10 200 28 170 Q 40 145 56 118 Q 70 92 96 70 Q 124 50 158 42 Q 196 36 230 50 Q 262 60 286 88 Q 308 116 322 152 Q 332 184 340 220 Q 348 270 350 320"
        fill="none" stroke="rgba(82,121,135,0.45)" strokeWidth="1.2" strokeLinecap="round"
      />

      <g stroke="rgba(82,121,135,0.3)" strokeWidth="0.7" fill="none">
        <path d="M 78 64 Q 82 58 86 64" /><path d="M 116 50 Q 120 45 124 50" />
        <path d="M 168 38 Q 172 34 176 38" /><path d="M 220 42 Q 224 38 228 42" />
        <path d="M 282 80 Q 286 76 290 80" /><path d="M 314 138 Q 318 134 322 138" />
      </g>

      <ellipse cx="100" cy="80" rx="90" ry="42" fill="#0891B2" opacity="0.07" />
      <ellipse cx="140" cy="190" rx="76" ry="58" fill="#16A34A" opacity="0.08" />
      <ellipse cx="280" cy="170" rx="68" ry="68" fill="#D97706" opacity="0.07" />

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

      <g style={{ fontFamily: '-apple-system, "Noto Sans TC", system-ui', fontSize: 9.5, fontWeight: 700, letterSpacing: 2 }}>
        <text x="76" y="42" fill="#0891B2" opacity="0.55">北　海　岸</text>
        <text x="116" y="262" fill="#16A34A" opacity="0.55">陽　明　山</text>
        <text x="248" y="106" fill="#D97706" opacity="0.55">東　北　角</text>
      </g>

      <g transform="translate(330, 410)">
        <circle r="14" fill="rgba(255,255,255,0.85)" stroke="rgba(0,0,0,0.08)" />
        <polygon points="0,-10 3,0 0,10 -3,0" fill="#1B4332" />
        <text x="0" y="-11" textAnchor="middle" fontSize="7" fontWeight="700" fill="#1B4332" style={{ fontFamily: 'system-ui' }}>N</text>
      </g>

      {children}
    </svg>
  )
}
