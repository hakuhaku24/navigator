"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Crown, Star, Heart, X, ChevronRight } from "lucide-react"
import { POIS, type POI } from "@/data/pois"

// ── Types ──────────────────────────────────────────────────────────────
type VoteType = "like" | "dislike" | "must-go" | "veto"

interface VoteRecord {
  poiId: string
  region: string
  vote: VoteType
}

interface ScoredPOI {
  poi: POI
  vote: VoteType
  score: number
  vetoed: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────
const LEVEL_LABELS: Record<number, string> = {
  0: "絕對錨點", 1: "彈性錨點", 2: "條件變動", 3: "水位調節",
}
const LEVEL_COLORS: Record<number, string> = {
  0: "#EF4444", 1: "#F97316", 2: "#EAB308", 3: "#94A3B8",
}

function calcScore(vote: VoteType): number {
  if (vote === "must-go") return 5
  if (vote === "like")    return 1
  if (vote === "dislike") return -1
  return -Infinity
}

function loadVotes(): VoteRecord[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem("navigator_votes") ?? "[]") as VoteRecord[]
  } catch {
    return []
  }
}

// ── Components ──────────────────────────────────────────────────────────

function VoteChip({ vote }: { vote: VoteType }) {
  const configs = {
    "must-go": { icon: <Star className="h-3 w-3 fill-amber-500 text-amber-500" />, label: "必去",   bg: "bg-amber-50",  text: "text-amber-700" },
    "like":    { icon: <Heart className="h-3 w-3 fill-blue-500 text-blue-500" />,   label: "喜歡",   bg: "bg-blue-50",   text: "text-blue-700" },
    "dislike": { icon: <X className="h-3 w-3 text-slate-500" />,                    label: "略過",   bg: "bg-slate-100", text: "text-slate-600" },
    "veto":    { icon: <X className="h-3 w-3 text-red-500" strokeWidth={3} />,      label: "VETO",   bg: "bg-red-50",    text: "text-red-700" },
  }
  const { icon, label, bg, text } = configs[vote]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${bg} ${text}`}>
      {icon} {label}
    </span>
  )
}

function LevelBadge({ level }: { level: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold text-white"
      style={{ background: LEVEL_COLORS[level] }}
    >
      L{level} {LEVEL_LABELS[level]}
    </span>
  )
}

function ResultRow({ item, rank, isTop }: { item: ScoredPOI; rank?: number; isTop?: boolean }) {
  const { poi, vote, score, vetoed } = item
  return (
    <div className={`relative flex items-center gap-3 rounded-xl p-3 border transition-all ${
      vetoed
        ? "bg-red-50/40 border-l-[3px] border-red-300 border-r-transparent border-y-transparent"
        : isTop
          ? "bg-white border-l-[3px] border-[#1B4332] border-r-slate-100 border-y-slate-100 shadow-sm"
          : "bg-white border-slate-100"
    }`}>
      {/* Crown badge */}
      {isTop && (
        <div className="absolute -top-2.5 right-3 flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white shadow">
          <Crown className="h-2.5 w-2.5" /> 最高共識
        </div>
      )}

      {/* Rank */}
      {rank && !vetoed && (
        <div className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${
          isTop ? "bg-[#1B4332] text-white" : "bg-[#D8F3DC] text-[#1B4332]"
        }`}>{rank}</div>
      )}

      {/* Thumbnail */}
      <div className={`h-12 w-12 shrink-0 rounded-lg ${vetoed ? "opacity-40 grayscale" : ""}`}
        style={{
          background: `linear-gradient(155deg, ${poi.region === "北海岸" ? "#6ab7d1,#2f7a96,#0d2c3a" : poi.region === "陽明山" ? "#7db37e,#4a8c52,#1f4d2e" : "#c9a15b,#7a5a33,#3d2c1a"})`,
        }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-semibold truncate ${vetoed ? "line-through text-[#94A3B8]" : "text-[#1E293B]"}`}>
          {poi.name}
          {vetoed && <span className="ml-1.5 text-[9px] font-bold bg-red-100 text-red-700 rounded px-1 py-0.5 no-underline align-middle">已否決</span>}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <LevelBadge level={poi.level} />
          <VoteChip vote={vote} />
        </div>
      </div>

      {/* Score */}
      {!vetoed && (
        <div className="shrink-0 flex flex-col items-center gap-0.5">
          <div className={`h-9 w-9 rounded-full flex items-center justify-center text-[15px] font-bold ${
            isTop
              ? "bg-gradient-to-br from-[#52B788] to-[#2D6A4F] text-white shadow-md"
              : "bg-[#D8F3DC] text-[#1B4332]"
          }`}>
            {score > 0 ? "+" : ""}{score}
          </div>
          <span className="text-[9px] text-[#94A3B8] font-medium">分</span>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────
export default function ResultsPage() {
  const params = useParams()
  const tripId = params.id as string

  const [threshold, setThreshold] = useState(3)
  const [results, setResults] = useState<ScoredPOI[]>([])

  useEffect(() => {
    const rawVotes = loadVotes()
    if (rawVotes.length === 0) return

    const scored: ScoredPOI[] = rawVotes.map((v) => {
      const poi = POIS.find((p) => p.id === v.poiId)
      if (!poi) return null
      const score = calcScore(v.vote)
      return { poi, vote: v.vote, score, vetoed: v.vote === "veto" }
    }).filter(Boolean) as ScoredPOI[]

    scored.sort((a, b) => {
      if (a.vetoed && !b.vetoed) return 1
      if (!a.vetoed && b.vetoed) return -1
      return b.score - a.score
    })

    setResults(scored)
  }, [])

  const alive   = results.filter((r) => !r.vetoed)
  const above   = alive.filter((r) => r.score >= threshold)
  const below   = alive.filter((r) => r.score < threshold)
  const vetoed  = results.filter((r) => r.vetoed)

  const THRESHOLDS = [1, 3, 5]

  if (results.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="h-16 w-16 rounded-full bg-[#D8F3DC] flex items-center justify-center">
          <Star className="h-8 w-8 text-[#1B4332]" />
        </div>
        <h1 className="text-xl font-bold text-[#1E293B]">尚無投票結果</h1>
        <p className="text-sm text-[#64748B]">請先完成景點投票</p>
        <Link href={`/trip/${tripId}/vote`}
          className="rounded-xl bg-[#1B4332] px-6 py-3 text-sm font-semibold text-white">
          開始投票
        </Link>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#faf9f5]">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[#faf9f5]/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-100">
        <nav className="flex items-center gap-1 text-sm text-[#64748B] mb-2">
          <Link href={`/trip/${tripId}`} className="flex items-center gap-1 hover:text-[#1B4332]">
            <ChevronLeft className="h-4 w-4" /> 行程
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-[#1E293B] font-medium">投票結果</span>
        </nav>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#64748B]">北海岸放空團 · Day 1</p>
            <h1 className="text-[22px] font-bold text-[#1E293B] tracking-tight">投票結果</h1>
          </div>
          <span className="rounded-full bg-[#D8F3DC] text-[#1B4332] px-3 py-1 text-[12px] font-semibold">
            {alive.length} 個候選
          </span>
        </div>

        {/* Completed banner */}
        <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-[#D8F3DC] px-3 py-2 text-[12px] text-[#1B4332] font-medium">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1B4332] text-white text-[9px] font-bold">✓</span>
          你已完成投票 · 共 {results.length} 個景點
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-28">

        {/* Veto warning */}
        {vetoed.length > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
            <X className="h-4 w-4 text-red-500 shrink-0" strokeWidth={2.5} />
            <p className="text-[12px] text-red-700">
              <span className="font-semibold">{vetoed[0].poi.name}</span>
              {vetoed.length > 1 ? ` 等 ${vetoed.length} 個景點` : ""} 被否決，已移除
            </p>
          </div>
        )}

        {/* Above threshold */}
        {above.length > 0 && (
          <section className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="h-4 w-4 text-[#1B4332]" />
              <span className="text-[11px] font-bold text-[#1B4332] uppercase tracking-wider">納入草稿行程</span>
              <span className="rounded-full bg-[#1B4332] text-white text-[10px] font-bold px-2 py-0.5">{above.length}</span>
            </div>
            <div className="space-y-2.5">
              {above.map((item, i) => (
                <ResultRow key={item.poi.id} item={item} rank={i + 1} isTop={i === 0} />
              ))}
            </div>
          </section>
        )}

        {/* Threshold selector */}
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-3">
          <div>
            <p className="text-[12px] font-bold text-amber-800">門檻 ≥ {threshold} 分</p>
            <p className="text-[10px] text-amber-700/80">低於此線不進入草稿</p>
          </div>
          <div className="ml-auto flex gap-1.5">
            {THRESHOLDS.map((t) => (
              <button key={t} onClick={() => setThreshold(t)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  threshold === t ? "bg-amber-600 text-white" : "bg-white border border-amber-200 text-amber-700"
                }`}>
                {t === 1 ? "寬" : t === 3 ? "標準" : "嚴"}
              </button>
            ))}
          </div>
        </div>

        {/* Below threshold */}
        {below.length > 0 && (
          <section className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">備選池</span>
              <span className="rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5">{below.length}</span>
            </div>
            <div className="space-y-2 opacity-70">
              {below.map((item, i) => (
                <ResultRow key={item.poi.id} item={item} rank={above.length + i + 1} />
              ))}
            </div>
          </section>
        )}

        {/* Vetoed */}
        {vetoed.length > 0 && (
          <section className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider">已否決</span>
              <span className="rounded-full bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5">{vetoed.length}</span>
            </div>
            <div className="space-y-2">
              {vetoed.map((item) => (
                <ResultRow key={item.poi.id} item={item} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 inset-x-0 px-4 pb-6 pt-3 bg-gradient-to-t from-[#faf9f5] via-[#faf9f5]/90 to-transparent md:relative md:bg-none md:pt-0">
        <Link
          href={`/trip/${tripId}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1B4332] py-3.5 text-[14px] font-semibold text-white shadow-lg"
          style={{ boxShadow: "0 8px 20px -6px rgba(27,67,50,0.45)" }}
        >
          <Star className="h-4 w-4" />
          生成草稿行程
        </Link>
      </div>
    </div>
  )
}
