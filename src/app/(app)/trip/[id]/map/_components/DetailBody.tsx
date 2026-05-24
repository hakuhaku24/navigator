"use client"

import React from "react"
import { FOREST, FOREST_LIGHT, SLATE, SLATE_SUB, type MapPOI } from "./tokens"

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 7, padding: '6px 8px' }}>
      <div style={{ fontSize: 8.5, color: SLATE_SUB, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 11, color: color ?? SLATE, fontWeight: 700, marginTop: 1, lineHeight: 1.3 }}>{value}</div>
    </div>
  )
}

export default function DetailBody({ poi }: { poi: MapPOI }) {
  const f = poi.facts
  const ins = poi.blog_insights
  return (
    <div style={{ padding: '0 14px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
        <Fact label="營業時間" value={f.hours || '未知'} />
        <Fact label="平均停留" value={`${f.average_stay_minutes} 分鐘`} />
        <Fact label="場域" value={f.is_indoor ? '室內' : '戶外'} color={f.is_indoor ? FOREST : '#0891B2'} />
        <Fact
          label="天氣敏感"
          value={{ low: '低', medium: '中', high: '高' }[f.weather_sensitivity]}
          color={{ low: '#10B981', medium: '#F59E0B', high: '#EF4444' }[f.weather_sensitivity]}
        />
      </div>

      {f.address && (
        <div style={{
          marginTop: 8, padding: '7px 9px', background: '#F8FAFC',
          borderRadius: 8, fontSize: 10, color: SLATE_SUB,
          display: 'flex', alignItems: 'flex-start', gap: 5, fontWeight: 500,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z" stroke={SLATE_SUB} strokeWidth="1.8" />
            <circle cx="12" cy="10" r="3" stroke={SLATE_SUB} strokeWidth="1.8" />
          </svg>
          <span style={{ flex: 1, lineHeight: 1.4 }}>{f.address}</span>
        </div>
      )}

      {(ins.constraints.length > 0 || ins.visitor_tips.length > 0) && (
        <div style={{
          marginTop: 10, padding: '8px 10px',
          background: 'rgba(82,183,136,0.06)',
          borderLeft: `2px solid ${FOREST_LIGHT}`,
          borderRadius: '4px 8px 8px 4px',
          fontSize: 10.5, lineHeight: 1.55,
        }}>
          <div style={{
            fontSize: 9, color: FOREST, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', marginBottom: 4,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 8, background: FOREST, color: '#fff', padding: '1px 4px', borderRadius: 2 }}>LLM</span>
            來自 {poi.sources.length} 個來源的洞察
          </div>
          {ins.constraints[0] && (
            <div style={{ display: 'flex', gap: 4, color: '#B45309', marginTop: 2 }}>
              <span>⚠</span><span>{ins.constraints[0]}</span>
            </div>
          )}
          {ins.visitor_tips[0] && (
            <div style={{ display: 'flex', gap: 4, color: FOREST, marginTop: 2 }}>
              <span>💡</span><span>{ins.visitor_tips[0]}</span>
            </div>
          )}
          {ins.recent_status && (
            <div style={{ display: 'flex', gap: 4, color: SLATE_SUB, marginTop: 2 }}>
              <span>📍</span><span>{ins.recent_status}</span>
            </div>
          )}
        </div>
      )}

      {poi.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
          {poi.tags.slice(0, 5).map(t => (
            <span key={t} style={{
              fontSize: 10, color: SLATE_SUB, fontWeight: 600,
              background: '#F1F5F9', padding: '3px 8px', borderRadius: 999,
            }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}
