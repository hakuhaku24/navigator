"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, X, Check, CloudRain, Home, AlertTriangle } from "lucide-react"
import { getIndoorPOIs, getPOIsForTinder, type POI } from "@/data/pois"

// ── Mock scenario ──────────────────────────────────────────────────────
// Day 2 afternoon: 85% rain, 3 outdoor POIs affected → find indoor backups
const REGION = "北海岸" as const

const OUTDOOR_AFFECTED = getPOIsForTinder(REGION)
  .filter((p) => !p.is_indoor && p.weather_sensitivity !== "低")
  .slice(0, 2)

const INDOOR_BACKUPS = getIndoorPOIs(REGION).filter((p) => p.level !== 0)

const MOCK_SWAPS = OUTDOOR_AFFECTED.map((outdoor, i) => ({
  original:    outdoor,
  replacement: INDOOR_BACKUPS[i % INDOOR_BACKUPS.length] ?? INDOOR_BACKUPS[0],
}))

// Static mock timeline (Day 2)
const DAY2_TIMELINE = [
  { time: "09:00", poiId: "NCA-002", affected: false },  // 野柳地質公園 – morning fine
  { time: "11:30", poiId: "NCA-004", affected: true  },  // 老梅綠石槽 – rain
  { time: "14:00", poiId: "NCA-006", affected: true  },  // 富貴角燈塔 – rain
  { time: "17:00", poiId: "NCA-011", affected: false },  // 龜吼漁港 – indoor, fine
]

const POIS_MAP = Object.fromEntries(
  [...getPOIsForTinder(REGION), ...getIndoorPOIs(REGION)].map((p) => [p.id, p])
)

// ── Level helpers ──────────────────────────────────────────────────────
const LEVEL_LABELS: Record<number, string> = {
  0: "絕對錨點", 1: "彈性錨點", 2: "條件變動", 3: "水位調節",
}
const LEVEL_COLORS: Record<number, string> = {
  0: "#EF4444", 1: "#F97316", 2: "#EAB308", 3: "#94A3B8",
}

function cardGradient(poi: POI) {
  if (poi.region === "陽明山") return "linear-gradient(135deg, #7db37e, #1f4d2e)"
  if (poi.region === "東北角") return "linear-gradient(135deg, #c9a15b, #3d2c1a)"
  return "linear-gradient(135deg, #6ab7d1, #0d2c3a)"
}

// ── Sub-components ─────────────────────────────────────────────────────

function WeatherBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl mx-4 mt-3 p-3 flex items-center gap-3"
      style={{
        background: "linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%)",
        boxShadow: "0 8px 20px -6px rgba(245,158,11,0.5)",
      }}
    >
      {/* Rain drops */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        {[20, 60, 100, 140, 180, 220, 260].map((x, i) => (
          <span key={i} className="absolute top-1 w-0.5 h-3 rounded-full bg-white"
            style={{ left: x, animation: `rainDrop ${1.2 + (i % 3) * 0.3}s ${i * 0.09}s linear infinite` }} />
        ))}
      </div>

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/25">
        <CloudRain className="h-5 w-5 text-white" />
      </div>
      <div className="flex-1 min-w-0 text-white">
        <p className="text-[13px] font-bold leading-snug">明天下午 · 降雨機率 85%</p>
        <p className="text-[11px] text-white/90 mt-0.5">2 個戶外景點建議調整</p>
      </div>
      <button
        onClick={onOpen}
        className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold text-amber-700 hover:bg-amber-50 transition-colors"
      >
        查看建議
      </button>
    </motion.div>
  )
}

function TimelineStop({ time, poi, affected, isLast }: {
  time: string; poi: POI | undefined; affected: boolean; isLast: boolean
}) {
  if (!poi) return null
  return (
    <div className="flex gap-3 pb-4">
      <div className="flex flex-col items-center shrink-0 w-8">
        <div className="w-2.5 h-2.5 rounded-full mt-3.5 shrink-0"
          style={{ background: affected ? "#F59E0B" : "#52B788", boxShadow: `0 0 0 3px ${affected ? "#FEF3C7" : "#D8F3DC"}` }} />
        {!isLast && <div className="flex-1 w-px mt-1 bg-slate-200" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-[#64748B] font-semibold tracking-wide">{time}</p>
        <div className={`mt-1 rounded-xl border p-2.5 flex items-center gap-2.5 bg-white ${
          affected ? "border-amber-200" : "border-slate-100"
        }`}>
          <div className="h-10 w-10 rounded-lg shrink-0" style={{ background: cardGradient(poi), opacity: affected ? 0.7 : 1 }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#1E293B] truncate">{poi.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5 text-white"
                style={{ background: LEVEL_COLORS[poi.level] }}>
                L{poi.level}
              </span>
              <span className="text-[10px] text-[#64748B]">{poi.is_indoor ? "室內" : "室外"}</span>
            </div>
          </div>
          {affected && (
            <span className="shrink-0 flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">
              <CloudRain className="h-3 w-3" /> 受影響
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function SwapCard({ swap, decision, onDecide }: {
  swap: { original: POI; replacement: POI }
  decision: "accept" | "keep" | null
  onDecide: (d: "accept" | "keep") => void
}) {
  const accepted = decision === "accept"
  const kept     = decision === "keep"

  return (
    <div className={`rounded-2xl border p-3 mb-3 bg-white transition-all ${
      accepted ? "border-[#52B788]" : kept ? "border-slate-200" : "border-slate-100"
    } shadow-sm`}>
      {/* Pair */}
      <div className="flex gap-2 items-stretch">
        {/* Original */}
        <div className={`flex-1 rounded-xl border p-2 ${accepted ? "opacity-50" : ""} bg-red-50/30 border-red-100`}>
          <div className="h-12 w-full rounded-lg mb-2 relative" style={{ background: cardGradient(swap.original) }}>
            <span className="absolute top-1 right-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold text-white bg-red-500/90">
              <AlertTriangle className="h-2.5 w-2.5" /> 受影響
            </span>
          </div>
          <p className="text-[11px] font-semibold text-[#1E293B] truncate">{swap.original.name}</p>
          <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5 text-white mt-1 inline-block"
            style={{ background: LEVEL_COLORS[swap.original.level] }}>
            L{swap.original.level}
          </span>
          <p className="text-[10px] text-[#64748B] mt-1 leading-tight line-clamp-2">
            {swap.original.weather_sensitivity === "極高" ? "極高天氣敏感度" : "高天氣敏感度"}，雨天體驗差
          </p>
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center justify-center px-1 gap-1">
          <div className={`h-6 w-6 rounded-full flex items-center justify-center transition-colors ${
            accepted ? "bg-[#52B788]" : "bg-[#D8F3DC]"
          }`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M13 6l6 6-6 6" stroke={accepted ? "#fff" : "#1B4332"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-[8px] font-bold text-[#94A3B8] tracking-wide">SWAP</span>
        </div>

        {/* Replacement */}
        <div className={`flex-1 rounded-xl border p-2 ${kept ? "opacity-50" : ""} bg-green-50/30 border-green-100 ${accepted ? "ring-1 ring-[#52B788]" : ""}`}>
          <div className="h-12 w-full rounded-lg mb-2 relative" style={{ background: cardGradient(swap.replacement) }}>
            <span className="absolute top-1 right-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold text-white bg-[#52B788]/90">
              <Home className="h-2.5 w-2.5" /> 室內
            </span>
          </div>
          <p className="text-[11px] font-semibold text-[#1E293B] truncate">{swap.replacement.name}</p>
          <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5 text-white mt-1 inline-block"
            style={{ background: LEVEL_COLORS[swap.replacement.level] }}>
            L{swap.replacement.level}
          </span>
          <p className="text-[10px] text-[#64748B] mt-1 leading-tight line-clamp-2">
            {swap.replacement.semantic_description.slice(0, 40)}...
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onDecide("accept")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold transition-all ${
            accepted
              ? "bg-[#52B788] text-white"
              : "bg-white border border-[#D8F3DC] text-[#1B4332] hover:bg-[#D8F3DC]"
          }`}
        >
          <Check className="h-3.5 w-3.5" /> 接受替換
        </button>
        <button
          onClick={() => onDecide("keep")}
          className={`flex-1 rounded-lg py-2 text-[12px] font-semibold transition-all ${
            kept
              ? "bg-slate-200 text-[#1E293B]"
              : "bg-white border border-slate-200 text-[#64748B] hover:bg-slate-50"
          }`}
        >
          保留原景點
        </button>
      </div>
    </div>
  )
}

function BottomSheet({ open, onClose, onAcceptAll, decisions, setDecisions }: {
  open: boolean
  onClose: () => void
  onAcceptAll: () => void
  decisions: Record<number, "accept" | "keep" | null>
  setDecisions: React.Dispatch<React.SetStateAction<Record<number, "accept" | "keep" | null>>>
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/45"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="relative bg-[#faf9f5] rounded-t-3xl max-h-[88%] flex flex-col"
            style={{ boxShadow: "0 -20px 60px rgba(0,0,0,0.2)" }}
          >
            {/* Grabber */}
            <div className="flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="h-1 w-9 rounded-full bg-slate-300" />
            </div>

            {/* Header */}
            <div className="px-5 pb-3 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #FBBF24, #F59E0B)" }}>
                    <CloudRain className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-bold text-[#1E293B]">天氣應變建議</h2>
                    <p className="text-[11px] text-[#64748B]">Day 2 · 下午 14:00–18:00</p>
                  </div>
                </div>
                <button onClick={onClose}
                  className="h-8 w-8 rounded-full border border-slate-200 bg-white flex items-center justify-center">
                  <X className="h-4 w-4 text-[#64748B]" />
                </button>
              </div>

              {/* Weather card */}
              <div className="mt-3 rounded-xl bg-white border border-slate-100 p-2.5 flex items-center gap-3 shadow-sm">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-sky-300 to-sky-500 flex items-center justify-center shrink-0">
                  <CloudRain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-[#1E293B]">85% 降雨 · 18°C</p>
                  <p className="text-[11px] text-[#64748B]">中央氣象署 · 北海岸區</p>
                </div>
                <span className="ml-auto rounded-lg bg-[#D8F3DC] text-[#1B4332] text-[10px] font-bold px-2 py-1">
                  自動偵測
                </span>
              </div>
            </div>

            {/* Swap cards */}
            <div className="flex-1 overflow-y-auto px-4">
              {MOCK_SWAPS.map((swap, i) => (
                <SwapCard
                  key={i} swap={swap}
                  decision={decisions[i] ?? null}
                  onDecide={(d) => setDecisions((prev) => ({ ...prev, [i]: d }))}
                />
              ))}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex gap-3">
              <button onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-3 text-[13px] font-semibold text-[#64748B] hover:bg-slate-50 transition-colors">
                手動調整
              </button>
              <button
                onClick={onAcceptAll}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold text-white transition-colors"
                style={{ background: "#1B4332", boxShadow: "0 6px 16px -4px rgba(27,67,50,0.4)" }}
              >
                <Check className="h-4 w-4" /> 全部接受建議
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

function SuccessScreen({ count, tripId }: { count: number; tripId: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 py-12 bg-[#faf9f5]">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 18, stiffness: 260 }}
        className="h-20 w-20 rounded-2xl flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, #52B788, #2D6A4F)",
          boxShadow: "0 12px 30px -8px rgba(82,183,136,0.55)",
        }}
      >
        <Check className="h-10 w-10 text-white" strokeWidth={3} />
      </motion.div>

      <div className="text-center">
        <h2 className="text-[20px] font-bold text-[#1E293B]">行程已更新</h2>
        <p className="text-[13px] text-[#64748B] mt-2 leading-relaxed">
          {count} 個景點已替換為室內備案<br />Day 2 下午改走室內路線
        </p>
      </div>

      <Link
        href={`/trip/${tripId}`}
        className="rounded-xl bg-[#1B4332] px-8 py-3.5 text-[14px] font-semibold text-white"
      >
        查看更新後行程
      </Link>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────
export default function WeatherPage() {
  const params  = useParams()
  const router  = useRouter()
  const tripId  = params.id as string

  const [sheetOpen,  setSheetOpen]  = useState(false)
  const [decisions,  setDecisions]  = useState<Record<number, "accept" | "keep" | null>>({})
  const [applied,    setApplied]    = useState(false)

  function acceptAll() {
    const all: Record<number, "accept" | "keep" | null> = {}
    MOCK_SWAPS.forEach((_, i) => { all[i] = "accept" })
    setDecisions(all)
    setTimeout(() => { setApplied(true); setSheetOpen(false) }, 400)
  }

  const acceptCount = Object.values(decisions).filter((d) => d === "accept").length

  if (applied) {
    return (
      <div className="flex-1 flex flex-col min-h-screen">
        <SuccessScreen count={acceptCount} tripId={tripId} />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#faf9f5] relative overflow-hidden">
      {/* Top bar */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <nav className="flex items-center gap-1 text-sm text-[#64748B] mb-3">
          <button onClick={() => router.back()} className="flex items-center gap-1 hover:text-[#1B4332]">
            <ChevronLeft className="h-4 w-4" /> 行程
          </button>
        </nav>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#64748B]">行程 · 2天1夜</p>
            <h1 className="text-[20px] font-bold text-[#1E293B] tracking-tight">北海岸放空團</h1>
          </div>
        </div>
      </div>

      {/* Weather banner */}
      <WeatherBanner onOpen={() => setSheetOpen(true)} />

      {/* Day tabs */}
      <div className="px-4 mt-3 flex gap-2 shrink-0">
        {["Day 1 · 週六", "Day 2 · 週日"].map((label, i) => (
          <div key={i} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold ${
            i === 1
              ? "bg-[#1B4332] text-white"
              : "bg-white border border-slate-200 text-[#64748B]"
          }`}>
            {label}
            {i === 1 && <CloudRain className="h-3 w-3" />}
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8">
        {DAY2_TIMELINE.map((stop, i) => (
          <TimelineStop
            key={stop.poiId}
            time={stop.time}
            poi={POIS_MAP[stop.poiId]}
            affected={stop.affected}
            isLast={i === DAY2_TIMELINE.length - 1}
          />
        ))}
      </div>

      {/* Bottom sheet */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onAcceptAll={acceptAll}
        decisions={decisions}
        setDecisions={setDecisions}
      />

      {/* Rain animation style */}
      <style>{`
        @keyframes rainDrop {
          0%   { transform: translateY(-8px); opacity: 0; }
          50%  { opacity: 1; }
          100% { transform: translateY(8px); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
