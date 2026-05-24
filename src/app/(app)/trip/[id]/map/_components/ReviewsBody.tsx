"use client"

import React from "react"
import { FOREST_LIGHT, SLATE, SLATE_SUB, SLATE_BORDER } from "./tokens"
import { REVIEW_AVATARS, type Review } from "@/lib/map/data"

interface Props {
  reviews: Review[]
  rating?: { avg: string; count: number }
}

export default function ReviewsBody({ reviews, rating }: Props) {
  if (reviews.length === 0 || !rating) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: SLATE_SUB, fontSize: 12 }}>
        尚無使用者評價，加入收藏成為第一位！
      </div>
    )
  }

  const dist = [5, 4, 3, 2, 1].map(s => ({
    stars: s, count: reviews.filter(r => r.stars === s).length,
  }))
  const maxC = Math.max(...dist.map(d => d.count), 1)

  return (
    <div style={{ padding: '0 14px 16px' }}>
      <div style={{
        display: 'flex', gap: 14, padding: '8px 12px',
        background: '#FFFBEB', border: '1px solid #FCD34D',
        borderRadius: 10, marginBottom: 12,
      }}>
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#B45309', letterSpacing: -1, lineHeight: 1 }}>{rating.avg}</div>
          <div style={{ fontSize: 14, color: '#EAB308', marginTop: 2, lineHeight: 1 }}>
            {'★'.repeat(Math.round(parseFloat(rating.avg)))}
            <span style={{ color: '#FDE68A' }}>{'★'.repeat(5 - Math.round(parseFloat(rating.avg)))}</span>
          </div>
          <div style={{ fontSize: 9, color: '#92400E', marginTop: 3, fontWeight: 600 }}>{rating.count} 則評價</div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center' }}>
          {dist.map(d => (
            <div key={d.stars} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, color: '#92400E', fontWeight: 600 }}>
              <span style={{ width: 8 }}>{d.stars}</span>
              <span style={{ color: '#EAB308' }}>★</span>
              <div style={{ flex: 1, height: 4, borderRadius: 999, background: '#FEF3C7', overflow: 'hidden' }}>
                <div style={{ width: `${(d.count / maxC) * 100}%`, height: '100%', background: '#EAB308', borderRadius: 999 }} />
              </div>
              <span style={{ width: 10, textAlign: 'right' }}>{d.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {reviews.map((r, i) => {
          const u = REVIEW_AVATARS[r.user]
          return (
            <div key={i} style={{ border: `1px solid ${SLATE_BORDER}`, borderRadius: 10, padding: '9px 11px', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: u.color, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>{u.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: SLATE, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {u.name}
                    {r.verified && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: '#fff', background: FOREST_LIGHT, padding: '1px 4px', borderRadius: 2 }}>
                        已驗證
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, fontSize: 9.5, color: SLATE_SUB }}>
                    <span style={{ color: '#EAB308', fontSize: 10 }}>
                      {'★'.repeat(r.stars)}<span style={{ color: '#E5E7EB' }}>{'★'.repeat(5 - r.stars)}</span>
                    </span>
                    <span>·</span>
                    <span>{r.date}</span>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: SLATE, lineHeight: 1.55 }}>{r.text}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, fontSize: 9.5, color: SLATE_SUB, fontWeight: 600 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M7 11V21M7 11l5-7c1 0 2 1 2 3v3h6c1 0 2 1 2 2l-2 8c0 1-1 2-2 2H7"
                      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                  {r.helpful} 人覺得有用
                </span>
                <span style={{ marginLeft: 'auto', color: '#1B4332' }}>回覆</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
