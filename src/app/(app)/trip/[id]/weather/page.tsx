"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, X, Check, CloudRain, Home, AlertTriangle, ShieldX, Sparkles } from "lucide-react"
import { POIS, type POI } from "@/data/pois"
import PoiArt from "@/components/PoiArt"
// 型別 only：編譯後整段消掉，不會把 server 端程式打包進 client bundle
import type { ContingencyResponse } from "@/app/api/contingency/route"
import type {
  ContingencyCandidate,
  ContingencyPlan,
  WeatherEvent,
} from "../../../../../../agents/contingency-handler/src/types"

// ── Demo 行程（靜態）────────────────────────────────────────────────────
// 行程本身仍是靜態 demo 資料（「使用者自驗證庫選點成行程」FFR13 尚未實作），
// 但天氣偵測、期望值分析、候選篩選與推薦全部走 /api/contingency 真實管線。
const DAY2_TIMELINE = [
  { time: "09:00", poiId: "NCA-002" },  // 野柳地質公園
  { time: "11:30", poiId: "NCA-004" },  // 老梅綠石槽
  { time: "14:00", poiId: "NCA-006" },  // 富貴角燈塔
  { time: "17:00", poiId: "NCA-011" },  // 龜吼漁港
]

// 應變評估對象：Day 2 受天氣影響最重的戶外景點（高敏感、L2）
const PRIMARY_AFFECTED_ID = "NCA-004"

const POIS_MAP: Record<string, POI> = Object.fromEntries(POIS.map((p) => [p.id, p]))
const TIMELINE_IDS = new Set(DAY2_TIMELINE.map((s) => s.poiId))

// 天氣事件下，行程中哪些點算「受影響」：戶外且非低敏感
function isAffected(poi: POI | undefined): boolean {
  if (!poi) return false
  return !poi.is_indoor && poi.weather_sensitivity !== "低"
}

// ── Level helpers ──────────────────────────────────────────────────────
const LEVEL_LABELS: Record<number, string> = {
  0: "絕對錨點", 1: "彈性錨點", 2: "條件變動", 3: "水位調節",
}
const LEVEL_COLORS: Record<number, string> = {
  0: "#EF4444", 1: "#F97316", 2: "#EAB308", 3: "#94A3B8",
}

type Swap = { original: POI; replacement: POI; candidate: ContingencyCandidate }

// 把 plan 的推薦候選配對到行程中受影響的景點：
// original = 行程裡受影響的戶外點（依時間序），replacement = 管線排序後的候選
function buildSwaps(plan: ContingencyPlan): Swap[] {
  const affected = DAY2_TIMELINE
    .map((s) => POIS_MAP[s.poiId])
    .filter((p): p is POI => isAffected(p))
  const candidates = plan.recommended_contingencies
    .filter((c) => !TIMELINE_IDS.has(c.poi_id))       // 已在行程內的不重複推薦
    .filter((c) => POIS_MAP[c.poi_id])                 // 靜態資料查得到才能渲染
  return affected
    .map((original, i) => {
      const candidate = candidates[i]
      if (!candidate) return null
      return { original, replacement: POIS_MAP[candidate.poi_id], candidate }
    })
    .filter((s): s is Swap => s !== null)
}

// ── Sub-components ─────────────────────────────────────────────────────

function WeatherBanner({ event, affectedCount, onOpen }: {
  event: WeatherEvent; affectedCount: number; onOpen: () => void
}) {
  const rainPct = Math.round(event.rainfall_probability * 100)
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
        <p className="text-[13px] font-bold leading-snug">降雨機率 {rainPct}% · {event.temperature_celsius}°C</p>
        <p className="text-[11px] text-white/90 mt-0.5">{affectedCount} 個戶外景點建議調整</p>
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
          <PoiArt
            region={poi.region}
            text={poi.category}
            emojiClassName="text-lg"
            className={`h-10 w-10 rounded-lg shrink-0 ${affected ? "opacity-70" : ""}`}
          />
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
  swap: Swap
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
          <PoiArt region={swap.original.region} text={swap.original.category} emojiClassName="text-xl" className="h-12 w-full rounded-lg mb-2">
            <span className="absolute top-1 right-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold text-white bg-red-500/90">
              <AlertTriangle className="h-2.5 w-2.5" /> 受影響
            </span>
          </PoiArt>
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
          <PoiArt region={swap.replacement.region} text={swap.replacement.category} emojiClassName="text-xl" className="h-12 w-full rounded-lg mb-2">
            <span className="absolute top-1 right-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold text-white bg-[#52B788]/90">
              <Home className="h-2.5 w-2.5" /> {swap.candidate.space_type === "indoor" ? "室內" : "半戶外"}
            </span>
          </PoiArt>
          <p className="text-[11px] font-semibold text-[#1E293B] truncate">{swap.replacement.name}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5 text-white inline-block"
              style={{ background: LEVEL_COLORS[swap.replacement.level] }}>
              L{swap.replacement.level}
            </span>
            <span className="text-[9px] font-bold text-[#1B4332] bg-[#D8F3DC] rounded-full px-1.5 py-0.5">
              {swap.candidate.multi_criteria_score} 分
            </span>
            <span className="text-[9px] text-[#94A3B8]">{swap.candidate.distance_km} km</span>
          </div>
          <p className="text-[10px] text-[#64748B] mt-1 leading-tight line-clamp-2">
            {swap.candidate.suitability_reason}
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

// 反思審查淘汰清單 — strict-checker 的 disqualified_details 可視化
function DisqualifiedList({ details }: { details: ContingencyPlan["disqualified_details"] }) {
  const [open, setOpen] = useState(false)
  if (details.length === 0) return null
  return (
    <div className="mt-3 rounded-xl bg-white border border-slate-100 overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
        <ShieldX className="h-3.5 w-3.5 text-red-400 shrink-0" />
        <span className="text-[11px] font-bold text-[#475569] flex-1">
          反思審查淘汰 {details.length} 筆候選
        </span>
        <span className="text-[10px] text-[#94A3B8]">{open ? "收合" : "展開"}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 max-h-40 overflow-y-auto">
          {details.map((d) => (
            <div key={d.poi_id} className="flex items-start gap-2 py-1 border-t border-slate-50">
              <span className="text-[10px] font-semibold text-[#1E293B] shrink-0 w-24 truncate">
                {POIS_MAP[d.poi_id]?.name ?? d.poi_id}
              </span>
              <span className="text-[10px] text-[#94A3B8] leading-tight">{d.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BottomSheet({ open, onClose, onAcceptAll, plan, swaps, decisions, setDecisions }: {
  open: boolean
  onClose: () => void
  onAcceptAll: () => void
  plan: ContingencyPlan
  swaps: Swap[]
  decisions: Record<number, "accept" | "keep" | null>
  setDecisions: React.Dispatch<React.SetStateAction<Record<number, "accept" | "keep" | null>>>
}) {
  const event = plan.event as WeatherEvent
  const rainPct = Math.round(event.rainfall_probability * 100)
  const ev = plan.expected_value_analysis
  const isLive = event.data_source === "cwa"

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
                    <p className="text-[11px] text-[#64748B]">Day 2 · 北海岸</p>
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
                  <p className="text-[14px] font-bold text-[#1E293B]">{rainPct}% 降雨 · {event.temperature_celsius}°C</p>
                  <p className="text-[11px] text-[#64748B]">
                    {isLive ? "中央氣象署 · 即時偵測" : "模擬情境（demo 覆寫）"}
                  </p>
                </div>
                <span className={`ml-auto rounded-lg text-[10px] font-bold px-2 py-1 ${
                  isLive ? "bg-[#D8F3DC] text-[#1B4332]" : "bg-amber-100 text-amber-700"
                }`}>
                  {isLive ? "自動偵測" : "模擬"}
                </span>
              </div>

              {/* EV 分析 — expected-value-calculator 的真實輸出 */}
              {ev && (
                <div className="mt-2 rounded-xl bg-white border border-slate-100 p-2.5 shadow-sm">
                  <p className="text-[10px] font-bold text-[#475569] mb-1.5">期望值分析（該不該換）</p>
                  <div className="flex gap-3 text-center">
                    {[
                      { label: "原體驗值 L", value: ev.original_poi_score },
                      { label: "雨天期望值 EV", value: ev.expected_value_current },
                      { label: "落差", value: ev.score_drop },
                      { label: "觸發門檻", value: ev.contingency_threshold },
                    ].map((s) => (
                      <div key={s.label} className="flex-1">
                        <p className="text-[14px] font-bold text-[#1E293B]">{s.value}</p>
                        <p className="text-[9px] text-[#94A3B8] leading-tight">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* LLM 敘述 — 通過三道關卡後才由 LLM 表述 */}
              {plan.llm_narrative && (
                <div className="mt-2 rounded-xl bg-[#F0FDF4] border border-[#D8F3DC] p-2.5 flex gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-[#2D6A4F] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] text-[#1B4332] leading-relaxed">{plan.llm_narrative}</p>
                    <p className="text-[9px] text-[#94A3B8] mt-1">
                      {plan.llm_source === "fallback" ? "規則引擎生成" : `${plan.llm_source} 表述`} · 候選經 {plan.checked_candidate_count} 篩 {plan.qualified_candidate_count}
                    </p>
                  </div>
                </div>
              )}

              {/* 反思審查淘汰清單 */}
              <DisqualifiedList details={plan.disqualified_details} />
            </div>

            {/* Swap cards */}
            <div className="flex-1 overflow-y-auto px-4">
              {swaps.length > 0 ? swaps.map((swap, i) => (
                <SwapCard
                  key={swap.candidate.poi_id} swap={swap}
                  decision={decisions[i] ?? null}
                  onDecide={(d) => setDecisions((prev) => ({ ...prev, [i]: d }))}
                />
              )) : (
                <div className="rounded-2xl border border-slate-100 bg-white p-4 mb-3 text-center">
                  <p className="text-[13px] font-semibold text-[#1E293B]">{plan.strategy_description}</p>
                  <p className="text-[11px] text-[#94A3B8] mt-1">目前無合格替代景點，建議調整時段</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex gap-3">
              <button onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-3 text-[13px] font-semibold text-[#64748B] hover:bg-slate-50 transition-colors">
                手動調整
              </button>
              <button
                onClick={onAcceptAll}
                disabled={swaps.length === 0}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold text-white transition-colors disabled:opacity-40"
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
          {count} 個景點已替換為推薦備案<br />Day 2 下午改走室內路線
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

  const [plan,       setPlan]       = useState<ContingencyPlan | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState<string | null>(null)
  const [sheetOpen,  setSheetOpen]  = useState(false)
  const [decisions,  setDecisions]  = useState<Record<number, "accept" | "keep" | null>>({})
  const [applied,    setApplied]    = useState(false)

  useEffect(() => {
    let cancelled = false
    async function call(body: Record<string, unknown>): Promise<ContingencyResponse> {
      const res = await fetch("/api/contingency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as ContingencyResponse | { error: string }
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `HTTP ${res.status}`)
      }
      return data
    }
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        // 先走真實偵測（Nominatim 反查鄉鎮 → CWA 鄉鎮預報）
        let resp = await call({ poi_id: PRIMARY_AFFECTED_ID })
        // 當下天氣好、沒觸發 → 改用模擬大雨展示應變管線（回應會標記模擬情境）
        if (!resp.triggered) {
          resp = await call({
            poi_id: PRIMARY_AFFECTED_ID,
            rainfall_probability: 0.85,
            temperature_celsius: 18,
          })
        }
        if (!cancelled) setPlan(resp.plan ?? null)
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const swaps = plan ? buildSwaps(plan) : []
  const hasWeatherEvent = plan?.event.kind === "weather"
  const affectedCount = hasWeatherEvent
    ? DAY2_TIMELINE.filter((s) => isAffected(POIS_MAP[s.poiId])).length
    : 0

  function acceptAll() {
    const all: Record<number, "accept" | "keep" | null> = {}
    swaps.forEach((_, i) => { all[i] = "accept" })
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

      {/* Weather banner / loading / error */}
      {loading ? (
        <div className="mx-4 mt-3 rounded-2xl border border-slate-100 bg-white p-3 flex items-center gap-3">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#1B4332] animate-spin shrink-0" />
          <p className="text-[12px] text-[#94A3B8]">偵測天氣與分析應變中...</p>
        </div>
      ) : loadError ? (
        <div className="mx-4 mt-3 rounded-2xl border border-red-100 bg-red-50/50 p-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <div>
            <p className="text-[12px] font-semibold text-[#64748B]">應變分析失敗</p>
            <p className="text-[10px] text-[#94A3B8]">{loadError}</p>
          </div>
        </div>
      ) : plan && hasWeatherEvent ? (
        <WeatherBanner
          event={plan.event as WeatherEvent}
          affectedCount={affectedCount}
          onOpen={() => setSheetOpen(true)}
        />
      ) : (
        <div className="mx-4 mt-3 rounded-2xl border border-[#D8F3DC] bg-[#F0FDF4] p-3 flex items-center gap-3">
          <Check className="h-4 w-4 text-[#2D6A4F] shrink-0" />
          <p className="text-[12px] text-[#1B4332]">天氣狀況良好，行程無需調整</p>
        </div>
      )}

      {/* Day tabs */}
      <div className="px-4 mt-3 flex gap-2 shrink-0">
        {["Day 1 · 週六", "Day 2 · 週日"].map((label, i) => (
          <div key={i} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold ${
            i === 1
              ? "bg-[#1B4332] text-white"
              : "bg-white border border-slate-200 text-[#64748B]"
          }`}>
            {label}
            {i === 1 && hasWeatherEvent && <CloudRain className="h-3 w-3" />}
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
            affected={hasWeatherEvent && isAffected(POIS_MAP[stop.poiId])}
            isLast={i === DAY2_TIMELINE.length - 1}
          />
        ))}
      </div>

      {/* Bottom sheet */}
      {plan && (
        <BottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onAcceptAll={acceptAll}
          plan={plan}
          swaps={swaps}
          decisions={decisions}
          setDecisions={setDecisions}
        />
      )}

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
