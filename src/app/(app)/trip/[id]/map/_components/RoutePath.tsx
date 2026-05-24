"use client"

import React from "react"
import { FOREST } from "./tokens"
import { MAP_COORDS, SAMPLE_ROUTE } from "@/lib/map/data"

export default function RoutePath({ stops }: { stops: typeof SAMPLE_ROUTE.stops }) {
  const points = stops.map(s => MAP_COORDS[s.poi]).filter(Boolean)
  if (points.length < 2) return null

  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1]
    const p1 = points[i]
    const mx = (p0.x + p1.x) / 2
    const my = (p0.y + p1.y) / 2
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const len = Math.sqrt(dx * dx + dy * dy)
    const offset = Math.min(len * 0.18, 24)
    const cx = mx - (dy / len) * offset
    const cy = my + (dx / len) * offset
    d += ` Q ${cx} ${cy}, ${p1.x} ${p1.y}`
  }

  return (
    <g>
      <path d={d} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.85" />
      <path d={d} fill="none" stroke={FOREST} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="6 5" />
    </g>
  )
}
