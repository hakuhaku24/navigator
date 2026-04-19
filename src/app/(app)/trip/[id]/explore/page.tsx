"use client"

import React, { useState, useRef, useMemo, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { motion, useMotionValue, useTransform, animate } from "framer-motion"
import { ChevronLeft, Heart, X, Check, Zap } from "lucide-react"
import { POIS, type POI } from "@/data/pois"

// ── Types ──────────────────────────────────────────────────────────────
type CardState = "idle" | "liked" | "removed"

interface PoolCard {
  uid: string
  poi: POI
}

// ── Constants ──────────────────────────────────────────────────────────
const MAX_ROUNDS = 6
const PER_ROUND = 6

const LEVEL_COLORS: Record<number, string> = {
  0: "#EF4444", 1: "#F97316", 2: "#3B82F6", 3: "#52B788",
}
const LEVEL_LABELS: Record<number, string> = {
  0: "錨點", 1: "彈性", 2: "可調", 3: "水位",
}
const WEATHER_COLOR: Record<string, string> = {
  "低": "#10B981", "中": "#F59E0B", "高": "#EF4444", "極高": "#EF4444",
}

function cardBg(poi: POI): string {
  if (poi.image_url) return poi.image_url
  const g: Record<POI["region"], string> = {
    "北海岸": "linear-gradient(155deg,#6ab7d1,#2f7a96,#0d2c3a)",
    "陽明山": "linear-gradient(155deg,#7db37e,#4a8c52,#1f4d2e)",
    "東北角": "linear-gradient(155deg,#c9a15b,#7a5a33,#3d2c1a)",
  }
  return g[poi.region]
}

function fmtMin(min: number): string {
  if (min < 60) return `${min} 分`
  const h = Math.round(min / 30) / 2
  return `${h} 小時`
}

// ── Grid Card ──────────────────────────────────────────────────────────
function GridCard({ poi, state, onDecide }: {
  poi: POI
  state: CardState
  onDecide: (d: "like" | "remove") => void
}) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-150, 150], [-10, 10])
  const likeOp = useTransform(x, [20, 80], [0, 1])
  const removeOp = useTransform(x, [-80, -20], [1, 0])
  const dragging = useRef(false)
  const startX = useRef(0)

  const bg = cardBg(poi)
  const isUrl = poi.image_url !== ""

  if (state === "removed") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border-[1.5px] border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1.5"
      >
        <div className="h-7 w-7 rounded-full border border-slate-200 flex items-center justify-center">
          <X className="h-3 w-3 text-slate-300" strokeWidth={2.5} />
        </div>
        <span className="text-[10px] font-semibold text-slate-300 tracking-wide">已移除</span>
      </motion.div>
    )
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (state !== "idle") return
    dragging.current = true
    startX.current = e.clientX
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    x.set(e.clientX - startX.current)
  }
  function handlePointerUp() {
    if (!dragging.current) return
    dragging.current = false
    const cur = x.get()
    if (cur > 60) {
      onDecide("like")
    } else if (cur < -60) {
      onDecide("remove")
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 })
    }
  }

  return (
    <motion.div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative rounded-xl overflow-hidden flex flex-col cursor-grab active:cursor-grabbing select-none touch-none"
      animate={state === "liked" ? { scale: [1, 1.04, 1] } : {}}
      transition={{ duration: 0.3 }}
      style={{
        x,
        rotate,
        border: state === "liked" ? "1.5px solid #52B788" : "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 2px 8px -2px rgba(15,23,42,0.08)",
        background: "#fff",
      }}
    >
      {/* Image area — 55% */}
      <div
        className="relative shrink-0"
        style={{
          height: "55%",
          background: isUrl ? undefined : bg,
          ...(isUrl ? {
            backgroundImage: `url(${bg}), linear-gradient(155deg,#6ab7d1,#2f7a96,#0d2c3a)`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          } : {}),
        }}
      >
        {/* Level badge */}
        <div
          className="absolute top-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold text-white"
          style={{ background: LEVEL_COLORS[poi.level] + "f0" }}
        >
          L{poi.level}
        </div>

        {/* Weather badge */}
        <div
          className="absolute top-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold bg-white/95"
          style={{ color: WEATHER_COLOR[poi.weather_sensitivity] ?? "#64748B" }}
        >
          🌧{poi.weather_sensitivity}
        </div>

        {/* Indoor badge */}
        {poi.is_indoor && (
          <div className="absolute bottom-1.5 left-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[8px] font-semibold text-white">
            🏠
          </div>
        )}

        {/* Like overlay */}
        <motion.div
          style={{ opacity: state === "liked" ? 0.5 : likeOp }}
          className="absolute inset-0 bg-[#52B788] flex items-center justify-center pointer-events-none"
        >
          <div className="h-9 w-9 rounded-full bg-white flex items-center justify-center shadow-lg">
            <Heart className="h-4 w-4 text-[#52B788] fill-[#52B788]" />
          </div>
        </motion.div>

        {/* Remove overlay */}
        <motion.div
          style={{ opacity: removeOp }}
          className="absolute inset-0 bg-red-500/40 flex items-center justify-center pointer-events-none"
        >
          <X className="h-8 w-8 text-white" strokeWidth={3} />
        </motion.div>
      </div>

      {/* Text area */}
      <div className="flex flex-col gap-1 px-2 py-1.5 flex-1 min-h-0">
        <p className="text-[11.5px] font-bold text-[#1E293B] truncate leading-tight">{poi.name}</p>
        <div className="flex flex-wrap gap-1 overflow-hidden" style={{ maxHeight: 15 }}>
          {poi.tags.slice(0, 2).map((t) => (
            <span key={t} className="text-[8.5px] px-1.5 py-px rounded bg-[#D8F3DC] text-[#1B4332] font-semibold whitespace-nowrap leading-tight">
              {t}
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-1 text-[9px] text-[#94A3B8] font-medium">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="#94A3B8" strokeWidth="2"/>
            <path d="M12 7v5l3 2" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          約 {fmtMin(poi.duration_min)}
        </div>
      </div>

      {/* Liked permanent overlay indicator */}
      {state === "liked" && (
        <div className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full bg-[#52B788] flex items-center justify-center shadow">
          <Heart className="h-2.5 w-2.5 text-white fill-white" />
        </div>
      )}
    </motion.div>
  )
}

// ── Round Summary ──────────────────────────────────────────────────────
function RoundSummary({ round, liked, removed, totalLiked, isLast, canFinish, onNext, onFinish }: {
  round: number; liked: number; removed: number; totalLiked: number
  isLast: boolean; canFinish: boolean
  onNext: () => void; onFinish: () => void
}) {
  return (
    <div className="flex-1 flex flex-col items-center px-6 py-8 bg-[#faf9f5]">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="h-14 w-14 rounded-2xl flex items-center justify-center text-white text-xl font-black mb-4"
        style={{ background: "linear-gradient(135deg, #52B788, #2D6A4F)", boxShadow: "0 10px 24px -6px rgba(82,183,136,0.5)" }}
      >
        {round}
      </motion.div>

      <h2 className="text-lg font-bold text-[#1E293B] mb-1">第 {round} 輪完成</h2>
      <p className="text-[12px] text-[#94A3B8] mb-6">{isLast ? "已達最多輪數" : "要看下一批嗎？"}</p>

      {/* Tally */}
      <div className="flex gap-3 w-full mb-4">
        {[
          { color: "#52B788", bg: "#D8F3DC", value: liked, label: "保留", icon: <Heart className="h-3 w-3" /> },
          { color: "#EF4444", bg: "#FEE2E2", value: removed, label: "刪除", icon: <X className="h-3 w-3" /> },
        ].map(({ color, bg, value, label, icon }) => (
          <div key={label} className="flex-1 rounded-xl flex flex-col items-center justify-center py-4 text-center"
            style={{ background: bg, color }}>
            <div className="flex items-center gap-1 text-[12px] font-bold mb-1">{icon}{label}</div>
            <div className="text-3xl font-black leading-none" style={{ letterSpacing: -1 }}>{value}</div>
            <div className="text-[10px] font-medium mt-1 opacity-70">張</div>
          </div>
        ))}
      </div>

      {/* Running total */}
      <div className="w-full rounded-xl bg-white border border-slate-100 px-4 py-3 flex items-center gap-3 mb-3">
        <p className="flex-1 text-[12px] text-[#64748B] font-medium">目前累計保留景點</p>
        <span className="text-xl font-black text-[#1B4332]">{totalLiked}</span>
        <span className="text-[11px] text-[#94A3B8]">張</span>
      </div>

      {!canFinish && (
        <div className="w-full rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-700 font-medium mb-3">
          還需保留 {3 - totalLiked} 張才能產生行程
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3 w-full">
        {!isLast && (
          <button onClick={onNext}
            className="w-full rounded-xl bg-[#1B4332] text-white py-3.5 text-[14px] font-bold"
            style={{ boxShadow: "0 8px 20px -6px rgba(27,67,50,0.4)" }}>
            下一批景點 →
          </button>
        )}
        <button onClick={onFinish} disabled={!canFinish}
          className="w-full rounded-xl py-3.5 text-[14px] font-bold flex items-center justify-center gap-2 transition-all"
          style={{
            background: canFinish ? (isLast ? "#1B4332" : "#fff") : "#F1F5F9",
            color: canFinish ? (isLast ? "#fff" : "#1B4332") : "#94A3B8",
            border: canFinish && !isLast ? "1.5px solid #1B4332" : "none",
            cursor: canFinish ? "pointer" : "not-allowed",
          }}>
          夠了，產生行程 <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Final Screen ───────────────────────────────────────────────────────
function FinalScreen({ likedPois, tripId }: { likedPois: POI[]; tripId: string }) {
  const totalMin = likedPois.reduce((s, p) => s + p.duration_min, 0)
  const byLevel = ([0, 1, 2, 3] as const).map((l) => ({
    level: l, count: likedPois.filter((p) => p.level === l).length,
  })).filter((x) => x.count > 0)

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#faf9f5]">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[#faf9f5]/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-100">
        <nav className="flex items-center gap-1 text-sm text-[#64748B] mb-2">
          <Link href={`/trip/${tripId}`} className="flex items-center gap-1 hover:text-[#1B4332]">
            <ChevronLeft className="h-4 w-4" /> 行程
          </Link>
        </nav>
        <h1 className="text-[22px] font-bold text-[#1E293B] tracking-tight">篩選完成！</h1>
        <p className="text-[12px] text-[#64748B] mt-0.5">
          共保留 <span className="font-bold text-[#1B4332]">{likedPois.length}</span> 個景點 · 預計停留 {Math.floor(totalMin / 60)} 小時 {totalMin % 60} 分
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-28">
        {/* Level distribution bar */}
        {byLevel.length > 0 && (
          <div className="mt-4 mb-2">
            <div className="h-2 rounded-full overflow-hidden bg-slate-200 flex">
              {byLevel.map((x) => (
                <div key={x.level} style={{ flex: x.count, background: LEVEL_COLORS[x.level] }} />
              ))}
            </div>
            <div className="flex gap-3 mt-1.5 flex-wrap">
              {byLevel.map((x) => (
                <div key={x.level} className="flex items-center gap-1 text-[9.5px] text-[#94A3B8]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_COLORS[x.level] }} />
                  L{x.level} {LEVEL_LABELS[x.level]} × {x.count}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Liked list */}
        <div className="mt-3 space-y-2">
          {likedPois.map((poi, i) => (
            <div key={poi.id} className="flex items-center gap-3 rounded-xl bg-white border border-slate-100 p-3 shadow-sm">
              <div className="h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                style={{ background: i === 0 ? "#1B4332" : "#D8F3DC", color: i === 0 ? "#fff" : "#1B4332" }}>
                {i + 1}
              </div>
              <div
                className="h-9 w-9 rounded-lg shrink-0"
                style={{
                  background: poi.image_url
                    ? `url(${poi.image_url}) center/cover, ${cardBg(poi)}`
                    : cardBg(poi),
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#1E293B] truncate">{poi.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] font-bold rounded px-1 py-px text-white"
                    style={{ background: LEVEL_COLORS[poi.level] }}>
                    L{poi.level}
                  </span>
                  <span className="text-[10px] text-[#94A3B8]">{fmtMin(poi.duration_min)}</span>
                </div>
              </div>
              <Heart className="h-4 w-4 shrink-0 text-[#52B788] fill-[#52B788]" />
            </div>
          ))}
        </div>
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 inset-x-0 px-4 pb-6 pt-3 bg-gradient-to-t from-[#faf9f5] via-[#faf9f5]/90 to-transparent">
        <Link
          href={`/trip/${tripId}/vote`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1B4332] py-3.5 text-[14px] font-semibold text-white shadow-lg"
          style={{ boxShadow: "0 8px 20px -6px rgba(27,67,50,0.45)" }}
        >
          <Zap className="h-4 w-4" />
          進入 Swipe 投票
        </Link>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────
export default function ExplorePage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.id as string

  // Build pool: all non-L0 POIs across all regions, up to 36
  const pool: PoolCard[] = useMemo(() => {
    const eligible = POIS.filter((p) => p.level !== 0)
    const out: PoolCard[] = []
    for (let i = 0; i < MAX_ROUNDS * PER_ROUND; i++) {
      const poi = eligible[i % eligible.length]
      out.push({ uid: `${poi.id}-${i}`, poi })
    }
    return out
  }, [])

  const [round, setRound] = useState(1)
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({})
  const [phase, setPhase] = useState<"filter" | "summary" | "final">("filter")

  const currentSlice = pool.slice((round - 1) * PER_ROUND, round * PER_ROUND)

  const totalLiked = Object.values(cardStates).filter((s) => s === "liked").length
  const totalRemoved = Object.values(cardStates).filter((s) => s === "removed").length
  const roundLiked = currentSlice.filter((c) => cardStates[c.uid] === "liked").length
  const roundRemoved = currentSlice.filter((c) => cardStates[c.uid] === "removed").length
  const canFinish = totalLiked >= 3
  const isLast = round >= MAX_ROUNDS

  // Check if all 6 cards in current round are decided
  useEffect(() => {
    if (phase !== "filter") return
    const decided = currentSlice.filter((c) => cardStates[c.uid]).length
    if (decided === PER_ROUND) {
      const timer = setTimeout(() => setPhase("summary"), 400)
      return () => clearTimeout(timer)
    }
  }, [cardStates, currentSlice, phase])

  function handleDecide(uid: string, decision: "like" | "remove") {
    setCardStates((prev) => ({ ...prev, [uid]: decision === "like" ? "liked" : "removed" }))
  }

  function handleNext() {
    if (isLast) {
      setPhase("final")
    } else {
      setRound((r) => r + 1)
      setPhase("filter")
    }
  }

  function handleFinish() {
    if (canFinish) setPhase("final")
  }

  const likedPois = pool
    .filter((c) => cardStates[c.uid] === "liked")
    .map((c) => c.poi)

  if (phase === "final") {
    return (
      <div className="flex-1 flex flex-col min-h-screen">
        <FinalScreen likedPois={likedPois} tripId={tripId} />
      </div>
    )
  }

  if (phase === "summary") {
    return (
      <div className="flex-1 flex flex-col min-h-screen bg-[#faf9f5]">
        {/* Back nav */}
        <div className="px-4 pt-4 shrink-0">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-[#64748B]">
            <ChevronLeft className="h-4 w-4" /> 返回
          </button>
        </div>
        <RoundSummary
          round={round}
          liked={roundLiked}
          removed={roundRemoved}
          totalLiked={totalLiked}
          isLast={isLast}
          canFinish={canFinish}
          onNext={handleNext}
          onFinish={handleFinish}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#faf9f5] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-[#64748B]">
            <ChevronLeft className="h-4 w-4" /> 返回
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#D8F3DC] text-[#1B4332] px-2.5 py-1 text-[11px] font-bold flex items-center gap-1">
              <Heart className="h-3 w-3" /> {totalLiked}
            </span>
            <span className="rounded-full bg-red-100 text-red-500 px-2.5 py-1 text-[11px] font-bold flex items-center gap-1">
              <X className="h-3 w-3" /> {totalRemoved}
            </span>
          </div>
        </div>

        <div className="flex items-baseline gap-1.5 mb-2">
          <p className="text-[15px] font-bold text-[#1E293B]">第 {round} 輪</p>
          <p className="text-[10px] text-[#94A3B8] font-medium">/ {MAX_ROUNDS} · 右滑保留，左滑移除</p>
        </div>

        {/* Round progress dots */}
        <div className="flex gap-1.5">
          {Array.from({ length: MAX_ROUNDS }).map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full transition-all"
              style={{ background: i + 1 < round ? "#1B4332" : i + 1 === round ? "#52B788" : "#E2E8F0" }}
            />
          ))}
        </div>
      </div>

      {/* 2×3 Grid */}
      <div
        className="flex-1 px-3 py-1 min-h-0"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "repeat(3, 1fr)",
          gap: 7,
        }}
      >
        {currentSlice.map((card) => (
          <GridCard
            key={card.uid}
            poi={card.poi}
            state={cardStates[card.uid] ?? "idle"}
            onDecide={(d) => handleDecide(card.uid, d)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 pb-5 pt-2 flex gap-2 border-t border-slate-100 bg-[#faf9f5]">
        <button
          onClick={() => setPhase("summary")}
          className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[11.5px] font-semibold text-[#64748B] whitespace-nowrap"
        >
          下一批 →
        </button>
        <button
          onClick={handleFinish}
          disabled={!canFinish}
          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11.5px] font-bold whitespace-nowrap transition-all"
          style={{
            flex: 1.4,
            background: canFinish ? "#1B4332" : "#E2E8F0",
            color: canFinish ? "#fff" : "#94A3B8",
            cursor: canFinish ? "pointer" : "not-allowed",
            boxShadow: canFinish ? "0 6px 16px -4px rgba(27,67,50,0.4)" : "none",
          }}
        >
          夠了，產生行程
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
