"use client"

import React, { useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  type PanInfo,
} from "framer-motion"
import { ChevronLeft, Star, Heart, X, Check } from "lucide-react"
import { getPOIsForTinder, type POI } from "@/data/pois"

// ── Types ──────────────────────────────────────────────────────────────
type VoteType = "like" | "dislike" | "must-go" | "veto"
type Direction = "left" | "right" | "up" | "down"

interface VoteRecord {
  poiId: string
  region: string
  vote: VoteType
}

interface Quotas {
  mustGo: number   // max 2
  veto: number     // max 1
}

// ── Helpers ────────────────────────────────────────────────────────────
const LEVEL_COLORS: Record<number, string> = {
  0: "#EF4444", 1: "#F97316", 2: "#3B82F6", 3: "#52B788",
}
const LEVEL_LABELS: Record<number, string> = {
  0: "錨點", 1: "彈性", 2: "可調", 3: "水位",
}
const WEATHER_LABELS: Record<string, string> = {
  low: "低", medium: "中", high: "高", extreme: "極高",
}

function cardBackground(poi: POI): React.CSSProperties {
  const palettes: Record<POI["region"], string> = {
    "北海岸": "linear-gradient(155deg, #6ab7d1 0%, #2f7a96 50%, #0d2c3a 100%)",
    "陽明山": "linear-gradient(155deg, #7db37e 0%, #4a8c52 50%, #1f4d2e 100%)",
    "東北角": "linear-gradient(155deg, #c9a15b 0%, #7a5a33 50%, #3d2c1a 100%)",
  }
  if (poi.image_url) {
    return {
      backgroundImage: `url(${poi.image_url}), ${palettes[poi.region]}`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    }
  }
  return { background: palettes[poi.region] }
}

function formatDuration(min: number): string {
  if (min < 60) return `約 ${min} 分鐘`
  const h = Math.round(min / 30) / 2
  return `約 ${h} 小時`
}

function saveVotes(records: VoteRecord[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem("navigator_votes", JSON.stringify(records))
  }
}

// ── Swipe Card ─────────────────────────────────────────────────────────
interface SwipeCardProps {
  poi: POI
  isTop: boolean
  stackIndex: number
  onVote: (vote: VoteType) => void
  quotas: Quotas
}

function SwipeCard({ poi, isTop, stackIndex, onVote, quotas }: SwipeCardProps) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-300, 300], [-22, 22])
  const isExiting = useRef(false)

  const likeOp    = useTransform(x, [20, 120], [0, 1])
  const dislikeOp = useTransform(x, [-120, -20], [1, 0])
  const mustGoOp  = useTransform(y, [-120, -20], [1, 0])
  const vetoOp    = useTransform(y, [20, 120], [0, 1])

  async function flyOff(dir: Direction, vote: VoteType) {
    if (isExiting.current) return
    isExiting.current = true
    const targets: Record<Direction, { x: number; y: number }> = {
      right: { x: 900,  y: 0 },
      left:  { x: -900, y: 0 },
      up:    { x: 0,    y: -900 },
      down:  { x: 0,    y: 900 },
    }
    const { x: tx, y: ty } = targets[dir]
    await Promise.all([
      animate(x, tx, { duration: 0.3, ease: [0.4, 0, 1, 1] }),
      animate(y, ty, { duration: 0.3, ease: [0.4, 0, 1, 1] }),
    ])
    onVote(vote)
  }

  function handleDragEnd(_: PointerEvent, info: PanInfo) {
    if (isExiting.current) return
    const { offset } = info
    const V = Math.abs(offset.y) > Math.abs(offset.x)
    const THRESH = 100

    if (V) {
      if (offset.y < -THRESH) {
        if (quotas.mustGo > 0) flyOff("up", "must-go")
        else { snapBack(); }
      } else if (offset.y > THRESH) {
        if (quotas.veto > 0) flyOff("down", "veto")
        else { snapBack(); }
      } else {
        snapBack()
      }
    } else {
      if (offset.x > THRESH)       flyOff("right", "like")
      else if (offset.x < -THRESH) flyOff("left",  "dislike")
      else snapBack()
    }
  }

  function snapBack() {
    animate(x, 0, { type: "spring", stiffness: 400, damping: 30 })
    animate(y, 0, { type: "spring", stiffness: 400, damping: 30 })
  }

  const scale    = 1 - stackIndex * 0.05
  const offsetY  = stackIndex * 14
  const opacity  = 1 - stackIndex * 0.15

  return (
    <motion.div
      key={poi.id}
      drag={isTop}
      dragConstraints={false}
      dragElastic={0.85}
      onDragEnd={isTop ? handleDragEnd : undefined}
      style={isTop ? { x, y, rotate } : undefined}
      animate={{ scale, y: offsetY, opacity }}
      transition={{ duration: 0.25 }}
      className="absolute select-none touch-none"
      tabIndex={isTop ? 0 : -1}
    >
      <div
        className="relative overflow-hidden rounded-[22px]"
        style={{
          width: 310,
          height: 436,
          ...cardBackground(poi),
          boxShadow: isTop
            ? "0 24px 48px -12px rgba(15,23,42,0.38), 0 8px 16px -8px rgba(15,23,42,0.2)"
            : "0 8px 24px -8px rgba(15,23,42,0.15)",
        }}
      >
        {/* Photo shimmer overlay */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.18) 0%, transparent 55%)" }} />

        {/* Top-right: Level badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
          style={{ background: LEVEL_COLORS[poi.level] + "f0", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}>
          <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
          L{poi.level} · {LEVEL_LABELS[poi.level]}
        </div>

        {/* Top-left: Indoor or weather badge */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {poi.is_indoor && (
            <div className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#1B4332]">
              🏠 室內
            </div>
          )}
          {poi.weather_sensitivity && (
            <div className="rounded-full bg-black/50 backdrop-blur-sm px-2.5 py-1 text-[11px] font-semibold text-white">
              🌧 {WEATHER_LABELS[poi.weather_sensitivity] ?? poi.weather_sensitivity}
            </div>
          )}
        </div>

        {/* Bottom gradient */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(180deg, transparent 38%, rgba(0,0,0,0.82) 100%)" }} />

        {/* Info */}
        <div className="absolute left-4 right-4 bottom-4 text-white">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[11px] text-white/65 font-medium tracking-wide">{poi.region} · {poi.category}</p>
            {poi.rating != null && (
              <span className="text-[11px] text-amber-300 font-semibold">⭐ {poi.rating}</span>
            )}
          </div>
          <h2 className="text-[21px] font-bold leading-tight mb-1.5 tracking-tight">{poi.name}</h2>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {poi.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full border border-white/50 px-2.5 py-0.5 text-[11px] font-medium">
                {tag}
              </span>
            ))}
            {poi.duration_min != null && (
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-medium">
                ⏱ {formatDuration(poi.duration_min)}
              </span>
            )}
          </div>
          <p className="text-[12px] text-white/80 italic leading-snug line-clamp-2">
            "{poi.semantic_description.slice(0, 60)}..."
          </p>
        </div>

        {/* FEEDBACK overlays — top card only */}
        {isTop && (
          <>
            <motion.div style={{ opacity: likeOp }} className="absolute inset-0 pointer-events-none rounded-[22px] bg-blue-500/25 flex items-start justify-end p-5">
              <div className="rounded-xl border-2 border-blue-400 bg-blue-500/20 px-3 py-2 flex items-center gap-2 rotate-12 backdrop-blur-sm">
                <Heart className="h-7 w-7 text-white fill-white" />
                <span className="text-xl font-black text-white tracking-widest">LIKE</span>
              </div>
            </motion.div>

            <motion.div style={{ opacity: dislikeOp }} className="absolute inset-0 pointer-events-none rounded-[22px] bg-slate-500/25 flex items-start justify-start p-5">
              <div className="rounded-xl border-2 border-slate-300 bg-slate-500/20 px-3 py-2 flex items-center gap-2 -rotate-12 backdrop-blur-sm">
                <X className="h-7 w-7 text-white" />
                <span className="text-xl font-black text-white tracking-widest">SKIP</span>
              </div>
            </motion.div>

            <motion.div style={{ opacity: mustGoOp }} className="absolute inset-0 pointer-events-none rounded-[22px] bg-amber-400/25 flex items-center justify-center">
              <div className="rounded-xl border-2 border-amber-300 bg-amber-500/20 px-4 py-2.5 flex items-center gap-2 backdrop-blur-sm">
                <Star className="h-8 w-8 text-white fill-white" />
                <span className="text-xl font-black text-white tracking-widest">MUST GO</span>
              </div>
            </motion.div>

            <motion.div style={{ opacity: vetoOp }} className="absolute inset-0 pointer-events-none rounded-[22px] bg-red-500/25 flex items-end justify-center pb-8">
              <div className="rounded-xl border-2 border-red-400 bg-red-500/20 px-4 py-2.5 flex items-center gap-2 backdrop-blur-sm">
                <X className="h-8 w-8 text-white" strokeWidth={3} />
                <span className="text-xl font-black text-white tracking-widest">VETO</span>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  )
}

// ── Complete Screen ─────────────────────────────────────────────────────
function CompleteScreen({ votes, pois, tripId }: {
  votes: VoteRecord[]
  pois: POI[]
  tripId: string
}) {
  const scored = pois
    .filter((p) => votes.find((v) => v.poiId === p.id && v.vote !== "veto"))
    .map((p) => {
      const vote = votes.find((v) => v.poiId === p.id)!
      const score = vote.vote === "must-go" ? 5 : vote.vote === "like" ? 1 : -1
      return { poi: p, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  return (
    <div className="flex-1 flex flex-col items-center px-6 py-8 bg-[#faf9f5]">
      {/* Check animation */}
      <div className="mb-6 mt-4">
        <svg width="88" height="88" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r="40" fill="none" stroke="#52B788" strokeWidth="4"
            strokeDasharray="251" strokeDashoffset="0" />
          <circle cx="44" cy="44" r="40" fill="#D8F3DC" fillOpacity="0.5" />
          <path d="M28 46l10 10 22-22" stroke="#1B4332" strokeWidth="5" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-[#1E293B] mb-1">投票完成！</h2>
      <p className="text-sm text-[#64748B] mb-6">共投了 {votes.length} 個景點</p>

      {/* Top 5 preview */}
      <div className="w-full max-w-sm space-y-2 mb-8">
        <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-widest text-center mb-3">你的前 5 名</p>
        {scored.map(({ poi, score }, i) => (
          <div key={poi.id} className="flex items-center gap-3 rounded-xl bg-white border border-slate-100 p-3 shadow-sm">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
              i === 0 ? "bg-[#1B4332] text-white" : "bg-[#D8F3DC] text-[#1B4332]"
            }`}>{i + 1}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#1E293B] truncate">{poi.name}</p>
              <p className="text-[10px] text-[#94A3B8]">L{poi.level} {LEVEL_LABELS[poi.level]}</p>
            </div>
            <span className="shrink-0 rounded-lg bg-[#D8F3DC] text-[#1B4332] text-[13px] font-bold px-2.5 py-1">
              {score > 0 ? "+" : ""}{score}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <Link
          href={`/trip/${tripId}/results`}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#1B4332] py-3.5 text-sm font-semibold text-white"
        >
          查看完整結果
        </Link>
        <Link
          href={`/trip/${tripId}`}
          className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-medium text-[#64748B]"
        >
          返回行程
        </Link>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────
export default function VotePage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.id as string

  const allPOIs = getPOIsForTinder("北海岸")
  const [cards, setCards] = useState<POI[]>(allPOIs)
  const [votes, setVotes] = useState<VoteRecord[]>([])
  const [quotas, setQuotas] = useState<Quotas>({ mustGo: 2, veto: 1 })
  const [done, setDone] = useState(false)

  const totalCount = allPOIs.length
  const votedCount = totalCount - cards.length

  function handleVote(vote: VoteType) {
    const poi = cards[0]
    const record: VoteRecord = { poiId: poi.id, region: poi.region, vote }
    const newVotes = [...votes, record]
    setVotes(newVotes)

    if (vote === "must-go") setQuotas((q) => ({ ...q, mustGo: q.mustGo - 1 }))
    if (vote === "veto")    setQuotas((q) => ({ ...q, veto: q.veto - 1 }))

    const remaining = cards.slice(1)
    setCards(remaining)

    if (remaining.length === 0) {
      saveVotes(newVotes)
      setDone(true)
    }
  }

  function handleButtonVote(vote: VoteType) {
    if (cards.length === 0) return
    if (vote === "must-go" && quotas.mustGo === 0) return
    if (vote === "veto"    && quotas.veto === 0)    return
    handleVote(vote)
  }

  if (done) {
    return (
      <div className="flex-1 flex flex-col min-h-screen">
        <CompleteScreen votes={votes} pois={allPOIs} tripId={tripId} />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#faf9f5]">
      {/* Top bar */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-[#64748B]">
            <ChevronLeft className="h-4 w-4" />
            返回
          </button>
          <div className="flex items-center gap-2">
            {/* Must-go quota */}
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1 ${
              quotas.mustGo > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"
            }`}>
              <Star className="h-3 w-3" /> ×{quotas.mustGo}
            </span>
            {/* Veto quota */}
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1 ${
              quotas.veto > 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-400"
            }`}>
              <X className="h-3 w-3" /> ×{quotas.veto}
            </span>
            {/* Remaining chip */}
            <span className="rounded-full bg-[#1B4332] text-white px-3 py-1 text-[11px] font-semibold whitespace-nowrap">
              還剩 {cards.length} 張
            </span>
          </div>
        </div>

        {/* Group name */}
        <div className="mb-3">
          <p className="text-[11px] text-[#64748B] font-medium">投票中 · 北海岸候選池</p>
          <h1 className="text-[17px] font-bold text-[#1E293B]">北海岸放空團</h1>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${totalCount > 0 ? (votedCount / totalCount) * 100 : 0}%`,
              background: "linear-gradient(90deg, #52B788, #2D6A4F)",
            }}
          />
        </div>
      </div>

      {/* Card stack */}
      <div className="flex-1 flex items-center justify-center relative" style={{ minHeight: 480 }}>
        {cards.length === 0 ? (
          <p className="text-sm text-[#94A3B8]">所有景點都投完了！</p>
        ) : (
          [...cards].reverse().slice(0, 3).reverse().map((poi, i) => {
            const stackIndex = Math.min(cards.indexOf(poi), 2)
            const isTop = poi.id === cards[0].id
            return (
              <SwipeCard
                key={poi.id}
                poi={poi}
                isTop={isTop}
                stackIndex={stackIndex}
                onVote={handleVote}
                quotas={quotas}
              />
            )
          })
        )}
      </div>

      {/* Action buttons + gesture hint */}
      <div className="shrink-0 px-6 pb-8 pt-2">
        <div className="flex items-center justify-center gap-5 mb-4">
          {/* Veto */}
          <button
            onClick={() => handleButtonVote("veto")}
            disabled={quotas.veto === 0 || cards.length === 0}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 bg-white transition-all active:scale-95 disabled:opacity-30"
            style={{ borderColor: "#EF4444" }}
            title={`VETO 否決（剩 ${quotas.veto} 次）`}
          >
            <X className="h-6 w-6" style={{ color: "#EF4444" }} strokeWidth={2.5} />
          </button>

          {/* Must-go */}
          <button
            onClick={() => handleButtonVote("must-go")}
            disabled={quotas.mustGo === 0 || cards.length === 0}
            className="flex h-16 w-16 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-30"
            style={{
              background: "#EAB308",
              boxShadow: "0 10px 24px -6px rgba(234,179,8,0.55), 0 3px 6px rgba(0,0,0,0.12)",
            }}
            title={`MUST-GO +5（剩 ${quotas.mustGo} 次）`}
          >
            <Star className="h-7 w-7 text-white fill-white" />
          </button>

          {/* Like */}
          <button
            onClick={() => handleButtonVote("like")}
            disabled={cards.length === 0}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 bg-white transition-all active:scale-95 disabled:opacity-30"
            style={{ borderColor: "#3B82F6" }}
            title="LIKE +1"
          >
            <Heart className="h-6 w-6" style={{ color: "#3B82F6" }} />
          </button>
        </div>

        {/* Gesture hint */}
        <div className="flex items-center justify-center gap-3 text-[11px] text-[#94A3B8] font-medium">
          <span>← 略過</span>
          <span>↑ 必去</span>
          <span>→ 喜歡</span>
          <span>↓ 否決</span>
        </div>
      </div>
    </div>
  )
}
