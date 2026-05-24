"use client"

import React from "react"
import { SLATE, SLATE_SUB } from "./tokens"

interface Props {
  x: number
  y: number
  rating: { avg: string; count: number }
}

export default function ReviewBubble({ x, y, rating }: Props) {
  return (
    <g transform={`translate(${x}, ${y - 26})`} style={{ pointerEvents: 'none' }}>
      <rect x="-26" y="-13" width="52" height="20" rx="10" fill="#fff" stroke="rgba(0,0,0,0.08)" />
      <polygon points="-4,7 4,7 0,11" fill="#fff" />
      <text x="-15" y="2" fontSize="10" fontWeight="800" fill="#EAB308" style={{ fontFamily: 'system-ui' }}>★</text>
      <text x="-6" y="2" fontSize="10" fontWeight="800" fill={SLATE} style={{ fontFamily: 'system-ui' }}>{rating.avg}</text>
      <text x="11" y="2" fontSize="8.5" fontWeight="600" fill={SLATE_SUB} style={{ fontFamily: 'system-ui' }}>·{rating.count}則</text>
    </g>
  )
}
