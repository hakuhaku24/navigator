"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, X, Check, CloudRain, Home, AlertTriangle, ShieldX, Sparkles } from "lucide-react"
import { POIS, type POI } from "@/data/pois"
import PoiArt from "@/components/PoiArt"
import {
  loadDraft,
  saveDraft,
  applySwapsToDraft,
  toDraftPOI,
  type DraftItinerary,
  type DraftDay,
  type DraftPOI,
} from "@/lib/draft-itinerary"
// 型別 only：編譯後整段消掉，不會把 server 端程式打包進 client bundle
import type { ContingencyResponse } from "@/app/api/contingency/route"
import type {
  ContingencyCandidate,
  ContingencyPlan,
  WeatherEvent,
} from "../../../../../../agents/contingency-handler/src/types"

// ── 行程來源 ────────────────────────────────────────────────────────────
// 這頁評估的是使用者在 /trip/build 建立、存在 localStorage 的那份行程草稿
// （loadDraft(tripId)）——網址上的 tripId 決定看哪一份。天氣偵測、期望值
// 分析、候選篩選與推薦一律走 /api/contingency 的真實管線。
// 查不到草稿時（例如直接開 /trip/demo/weather）退回下面這組固定站點，讓
// 沒有草稿的情況也演得動；退回時畫面會明確標示「示範行程」。
const DEMO_STOP_IDS = ["NCA-002", "NCA-004", "NCA-006", "NCA-011"]

const POIS_MAP: Record<string, POI> = Object.fromEntries(POIS.map((p) => [p.id, p]))

// 草稿沒有存「幾點到幾點」，時間軸一律從 09:00 起算，依停留時間 + 站間交通
// 往後推。這是本頁唯一的時間假設；草稿缺座標算不出交通時間時以 30 分鐘計。
const DAY_START_MINUTES = 9 * 60
const DEFAULT_GAP_MINUTES = 30

function buildDemoDraft(): DraftItinerary {
  const pois = DEMO_STOP_IDS.map((id) => POIS_MAP[id])
    .filter((p): p is POI => Boolean(p))
    .map(toDraftPOI)
  return {
    tripName: "北海岸放空團",
    destination: "北海岸",
    days: [{ dayNum: 1, date: "示範行程", pois }],
    generatedAt: "demo", // 固定值：避免 SSR/CSR 產生不同時間戳
  }
}

function formatClock(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

// 使用者「全部接受建議」後的 原景點 id → 替換景點 id。
// 真實草稿的替換直接寫回草稿本身（applySwapsToDraft + saveDraft），
// 這個 localStorage slot 只服務「查不到草稿的示範行程」——不然示範情境
// 一重新整理就忘記剛剛接受的建議，畫面卻還說「行程已更新」。
const WEATHER_DEMO_SWAPS_KEY = "navigator_weather_demo_swaps"

function loadResolvedSwaps(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(WEATHER_DEMO_SWAPS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveResolvedSwaps(swaps: Record<string, string>): void {
  localStorage.setItem(WEATHER_DEMO_SWAPS_KEY, JSON.stringify(swaps))
}

// 天氣事件下，行程中哪些點算「受影響」：戶外且非低敏感。
// meta 來自靜態 45 筆（pois.ts）；查不到就無從判斷天氣屬性，一律**不**視為
// 受影響、也不會被自動替換——時間軸上會標示「天氣資料待補」，讓它顯性而不是
// 悄悄消失。TDX 大量匯入後會開始出現這種站點，屆時要改成讀 poi_catalog。
function isAffected(meta: POI | undefined): boolean {
  if (!meta) return false
  return !meta.is_indoor && meta.weather_sensitivity !== "低"
}

// 時間軸上的一站：draftPoi 負責顯示（一定有），meta 負責天氣判斷（可能沒有）
type Stop = {
  poiId: string
  time: string
  draftPoi: DraftPOI
  meta: POI | undefined
  affected: boolean
  swapped: boolean
}

// 某一天的草稿站點 → 時間軸。
// resolvedSwaps 只在示範行程模式下有值（真草稿的替換已經寫回草稿本身）。
// affected 只看景點屬性、不看當下有沒有天氣事件——要不要標紅由畫面決定。
function buildStops(day: DraftDay, resolvedSwaps: Record<string, string>): Stop[] {
  let clock = DAY_START_MINUTES
  return day.pois.map((p) => {
    const replacementMeta = resolvedSwaps[p.id] ? POIS_MAP[resolvedSwaps[p.id]] : undefined
    // 已接受替換的站點顯示替換後的景點；交通時間沿用原站點的估算（示範用途，
    // 真草稿走 applySwapsToDraft 會重算）
    const draftPoi = replacementMeta
      ? { ...toDraftPOI(replacementMeta), travelToNext: p.travelToNext }
      : p
    const meta = POIS_MAP[draftPoi.id]
    const time = formatClock(clock)
    clock += draftPoi.stayMinutes + (draftPoi.travelToNext?.minutes ?? DEFAULT_GAP_MINUTES)
    return {
      poiId: draftPoi.id,
      time,
      draftPoi,
      meta,
      affected: isAffected(meta),
      swapped: Boolean(replacementMeta),
    }
  })
}

// ── Level helpers ──────────────────────────────────────────────────────
const LEVEL_LABELS: Record<number, string> = {
  0: "絕對錨點", 1: "彈性錨點", 2: "條件變動", 3: "水位調節",
}
const LEVEL_COLORS: Record<number, string> = {
  0: "#EF4444", 1: "#F97316", 2: "#EAB308", 3: "#94A3B8",
}

// original/replacement 提供天氣屬性與區域配色（來自靜態 pois.ts）；
// 顯示名稱一律用 originalName / candidate.name——pois.ts 有 27/45 筆名稱與
// poi_catalog 不同（例：富貴角燈塔 vs 台灣最北點），混用會讓同一畫面出現兩個名字
type Swap = {
  original: POI
  originalName: string
  replacement: POI
  candidate: ContingencyCandidate
}

// 把 plan 的推薦候選配對到時間軸上受影響的站點：
// original = 行程裡受影響的戶外點（依時間序），replacement = 管線排序後的候選。
// 已接受替換的站點換成的景點通常不再 isAffected，就不會再被配對一次。
// original 一定查得到靜態資料——isAffected 本來就需要 meta 才會成立。
function buildSwaps(plan: ContingencyPlan, stops: Stop[]): Swap[] {
  const timelineIds = new Set(stops.map((s) => s.poiId))
  const affected = stops.filter((s) => s.affected && s.meta)
  const candidates = plan.recommended_contingencies
    .filter((c) => !timelineIds.has(c.poi_id))         // 已在行程內的不重複推薦
    .filter((c) => POIS_MAP[c.poi_id])                 // 靜態資料查得到才能渲染
  return affected
    .map((stop, i) => {
      const candidate = candidates[i]
      if (!candidate || !stop.meta) return null
      return {
        original: stop.meta,
        originalName: stop.draftPoi.name,
        replacement: POIS_MAP[candidate.poi_id],
        candidate,
      }
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

function TimelineStop({ stop, weatherActive, isLast }: {
  stop: Stop; weatherActive: boolean; isLast: boolean
}) {
  const { time, draftPoi, meta, swapped } = stop
  const affected = weatherActive && stop.affected
  // 草稿的 address 是 `${region} · ${category}`（見 draft-itinerary.toDraftPOI），
  // 靜態表查不到時用它來上色與選 emoji
  const [addrRegion, addrCategory] = draftPoi.address.split(" · ")
  const region = meta?.region ?? addrRegion
  const category = meta?.category ?? addrCategory ?? draftPoi.name
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
            region={region}
            text={category}
            emojiClassName="text-lg"
            className={`h-10 w-10 rounded-lg shrink-0 ${affected ? "opacity-70" : ""}`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#1E293B] truncate">{draftPoi.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5 text-white"
                style={{ background: LEVEL_COLORS[draftPoi.level] }}>
                L{draftPoi.level}
              </span>
              {meta ? (
                <span className="text-[10px] text-[#64748B]">{meta.is_indoor ? "室內" : "室外"}</span>
              ) : (
                // 應變資料庫查無此景點 → 講出來，不要讓它看起來「沒事」
                <span className="text-[10px] text-amber-600">天氣資料待補</span>
              )}
            </div>
          </div>
          {affected && (
            <span className="shrink-0 flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">
              <CloudRain className="h-3 w-3" /> 受影響
            </span>
          )}
          {!affected && swapped && (
            <span className="shrink-0 flex items-center gap-1 rounded-lg bg-[#D8F3DC] px-2 py-1 text-[10px] font-bold text-[#1B4332]">
              <Check className="h-3 w-3" /> 已替換
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-[#64748B] w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-[#52B788]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="text-[9px] font-semibold text-[#1E293B] w-6 text-right shrink-0">{Math.round(value)}</span>
    </div>
  )
}

// 候選景點的多準則評分細節 + 佐證來源 + 風險警示 — 後端算完就丟給前端，只是原本沒人渲染
function ScoreBreakdownDetail({ candidate }: { candidate: ContingencyCandidate }) {
  const b = candidate.score_breakdown
  return (
    <div className="mt-2 rounded-xl bg-slate-50 border border-slate-100 p-2.5 space-y-2">
      <div className="space-y-1.5">
        <ScoreBar label="天氣適配" value={b.weather_fit} />
        <ScoreBar label="距離" value={b.distance_score} />
        <ScoreBar label="可預約性" value={b.availability_score} />
        <ScoreBar label="人潮容量" value={b.crowd_capacity_score} />
        <ScoreBar label="偏好符合" value={b.group_preference_match} />
        <ScoreBar label="評分" value={b.rating_score} />
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-200">
        {candidate.is_verified && (
          <span className="text-[9px] font-semibold rounded-full px-2 py-0.5 bg-[#D8F3DC] text-[#1B4332]">已三源驗證</span>
        )}
        {candidate.has_recent_positive_reviews && (
          <span className="text-[9px] font-semibold rounded-full px-2 py-0.5 bg-sky-50 text-sky-700">近期評價正向</span>
        )}
        <span className="text-[9px] font-semibold rounded-full px-2 py-0.5 bg-slate-100 text-[#64748B]">
          資料 {candidate.last_info_update_age_days} 天前更新
        </span>
      </div>
      {candidate.risk_warnings && candidate.risk_warnings.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-200">
          {candidate.risk_warnings.map((w, i) => (
            <span key={i} className="flex items-center gap-1 text-[9px] font-semibold rounded-full px-2 py-0.5 bg-red-50 text-red-600">
              <AlertTriangle className="h-2.5 w-2.5" /> {w}
            </span>
          ))}
        </div>
      )}
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
  const [detailOpen, setDetailOpen] = useState(false)

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
          <p className="text-[11px] font-semibold text-[#1E293B] truncate">{swap.originalName}</p>
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
          {/* 用 candidate.name（來自 poi_catalog）而不是靜態表的名字 */}
          <p className="text-[11px] font-semibold text-[#1E293B] truncate">{swap.candidate.name}</p>
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

      {/* 評分依據 — 多準則評分細節、佐證來源、風險警示 */}
      <button
        onClick={() => setDetailOpen((v) => !v)}
        className="mt-2 w-full text-center text-[10px] font-semibold text-[#94A3B8] hover:text-[#1B4332] transition-colors"
      >
        {detailOpen ? "收合評分依據 ▴" : "查看評分依據 ▾"}
      </button>
      {detailOpen && <ScoreBreakdownDetail candidate={swap.candidate} />}
    </div>
  )
}

// 反思迴路自我修正記錄 — narrative_reflection.violation_log 可視化，
// 每輪被打回的具體違規原因（幻覺景點/已淘汰景點/格式），之前算完沒人渲染
function ReflectionLog({ reflection }: { reflection: NonNullable<ContingencyPlan["narrative_reflection"]> }) {
  const [open, setOpen] = useState(false)
  const rounds = reflection.violation_log
  if (!rounds || rounds.length === 0) return null
  return (
    <div className="mt-2 rounded-xl bg-white border border-slate-100 overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
        <Sparkles className="h-3.5 w-3.5 text-[#2D6A4F] shrink-0" />
        <span className="text-[11px] font-bold text-[#475569] flex-1">
          反思迴路自我修正記錄（{rounds.length} 輪）
        </span>
        <span className="text-[10px] text-[#94A3B8]">{open ? "收合" : "展開"}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 max-h-40 overflow-y-auto space-y-1.5">
          {rounds.map((r) => (
            <div key={r.attempt} className="border-t border-slate-50 pt-1.5">
              <p className="text-[10px] font-semibold text-[#1E293B]">第 {r.attempt} 次生成</p>
              <ul className="mt-0.5 space-y-0.5">
                {r.violations.map((v, i) => (
                  <li key={i} className="text-[10px] text-[#94A3B8] leading-tight">· {v}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
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

function BottomSheet({ open, onClose, onAcceptAll, plan, swaps, subtitle, decisions, setDecisions }: {
  open: boolean
  onClose: () => void
  onAcceptAll: () => void
  plan: ContingencyPlan
  swaps: Swap[]
  subtitle: string
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
                    <p className="text-[11px] text-[#64748B]">{subtitle}</p>
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
                      {plan.narrative_reflection && (
                        plan.narrative_reflection.accepted
                          ? ` · 反思審查通過（第 ${plan.narrative_reflection.attempts} 次生成）`
                          : " · 反思審查未通過，已退回規則保底"
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* 反思迴路自我修正記錄 */}
              {plan.narrative_reflection && <ReflectionLog reflection={plan.narrative_reflection} />}

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

function SuccessScreen({ count, tripId, dayLabel, savedToDraft }: {
  count: number; tripId: string; dayLabel: string; savedToDraft: boolean
}) {
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
          {count} 個景點已替換為推薦備案<br />
          {savedToDraft
            ? `${dayLabel} 已寫回你的行程`
            : `${dayLabel} 已更新（示範行程，未寫入真實草稿）`}
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

  const [draft,         setDraft]         = useState<DraftItinerary | null>(null)
  const [isDemo,        setIsDemo]        = useState(false)
  const [dayIndex,      setDayIndex]      = useState(0)
  const [plan,          setPlan]          = useState<ContingencyPlan | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [loadError,     setLoadError]     = useState<string | null>(null)
  const [sheetOpen,     setSheetOpen]     = useState(false)
  const [decisions,     setDecisions]     = useState<Record<number, "accept" | "keep" | null>>({})
  const [applied,       setApplied]       = useState(false)
  // 按下「全部接受」的當下就設 true。applied 要等 400ms 動畫才切畫面，
  // 這中間草稿已經換過站點，沒有這道閘門會白白再打一次應變管線（CWA + LLM）
  const [committed,     setCommitted]     = useState(false)
  // 先前接受過的替換（原景點 id → 替換景點 id）。只有示範行程模式會用到，
  // 真草稿的替換直接寫回草稿本身，見 WEATHER_DEMO_SWAPS_KEY 說明
  const [resolvedSwaps, setResolvedSwaps] = useState<Record<string, string>>({})

  // 讀行程草稿。localStorage 只有 client 有，所以必須等掛載後才讀
  // （直接在 render 讀會讓 server 與 client 產出不一致）。
  // 預設打開「第一個有受天氣影響站點的那天」——那才是這頁要談的那天。
  useEffect(() => {
    function syncFromStorage() {
      const real = loadDraft(tripId)
      const d = real ?? buildDemoDraft()
      setDraft(d)
      setIsDemo(real === null)
      if (real === null) setResolvedSwaps(loadResolvedSwaps())
      const idx = d.days.findIndex((day) => day.pois.some((p) => isAffected(POIS_MAP[p.id])))
      setDayIndex(idx >= 0 ? idx : 0)
    }
    syncFromStorage()
  }, [tripId])

  const day = draft?.days[dayIndex] ?? null
  const stops = useMemo(() => (day ? buildStops(day, resolvedSwaps) : []), [day, resolvedSwaps])

  // 拿去問應變管線的景點：時間軸上第一個受天氣影響的站點；全都不受影響時
  // 改用第一個「應變資料庫查得到」的站點（管線多半會回「無需應變」，這是對的）。
  // 兩者都沒有 → 這天沒有任何站點在資料庫裡，不呼叫 API，畫面直接說明原因。
  const probePoiId =
    stops.find((s) => s.affected)?.poiId ?? stops.find((s) => s.meta)?.poiId ?? null

  useEffect(() => {
    // probePoiId 為 null＝這天沒有任何站點在應變資料庫裡，沒東西可問。
    // 不動 loading／plan：畫面靠 noCatalogMatch 分支說明，不需要多一輪 render。
    if (!draft || applied || committed || !probePoiId) return
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
        let resp = await call({ poi_id: probePoiId })
        // 當下天氣好、沒觸發 → 改用模擬大雨展示應變管線（回應會標記模擬情境）
        if (!resp.triggered) {
          resp = await call({
            poi_id: probePoiId,
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
  }, [draft, probePoiId, applied, committed])

  const swaps = plan ? buildSwaps(plan, stops) : []
  const hasWeatherEvent = plan?.event.kind === "weather"
  const affectedCount = hasWeatherEvent ? stops.filter((s) => s.affected).length : 0
  const dayLabel = day ? `Day ${day.dayNum}` : ""
  // 這天一個站點都不在應變資料庫裡 → 管線沒東西可評估，要講清楚而不是空轉
  const noCatalogMatch = draft !== null && stops.length > 0 && probePoiId === null

  function acceptAll() {
    if (!draft || !day) return
    setCommitted(true)
    const all: Record<number, "accept" | "keep" | null> = {}
    swaps.forEach((_, i) => { all[i] = "accept" })
    setDecisions(all)

    const map: Record<string, { id: string; name: string }> = {}
    swaps.forEach((swap) => {
      map[swap.original.id] = { id: swap.replacement.id, name: swap.candidate.name }
    })

    if (isDemo) {
      // 沒有真實草稿可寫，存進示範情境自己的 slot（只需要 id）
      const merged = { ...resolvedSwaps }
      for (const [from, to] of Object.entries(map)) merged[from] = to.id
      saveResolvedSwaps(merged)
      setResolvedSwaps(merged)
    } else {
      // 寫回真實行程草稿——/trip/[id] 之後看到的就是替換後的行程
      const updated = applySwapsToDraft(draft, day.dayNum, map)
      saveDraft(tripId, updated)
      setDraft(updated)
    }

    setTimeout(() => { setApplied(true); setSheetOpen(false) }, 400)
  }

  const acceptCount = Object.values(decisions).filter((d) => d === "accept").length

  if (applied) {
    return (
      <div className="flex-1 flex flex-col min-h-screen">
        <SuccessScreen count={acceptCount} tripId={tripId} dayLabel={dayLabel} savedToDraft={!isDemo} />
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
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-[#64748B]">
              {draft ? `${draft.destination} · ${draft.days.length} 天` : "讀取行程中"}
            </p>
            <h1 className="text-[20px] font-bold text-[#1E293B] tracking-tight truncate">
              {draft?.tripName ?? "行程"}
            </h1>
          </div>
          {isDemo && (
            // 查不到草稿才會走到這裡，講明白免得以為在看自己的行程
            <span className="shrink-0 rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">
              示範行程
            </span>
          )}
        </div>
      </div>

      {/* Weather banner / loading / error */}
      {/* noCatalogMatch 排在 loading 前面：這種情況根本沒發出請求，
          loading 會維持初始值 true，先判斷才不會卡在轉圈圈 */}
      {noCatalogMatch ? (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-100 bg-amber-50/50 p-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <div>
            <p className="text-[12px] font-semibold text-[#64748B]">無法評估這天的天氣風險</p>
            <p className="text-[10px] text-[#94A3B8]">
              這天的景點都還沒進應變資料庫，沒有天氣屬性可以判斷
            </p>
          </div>
        </div>
      ) : loading ? (
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

      {/* Day tabs — 依草稿實際天數產生，可切換 */}
      {draft && draft.days.length > 0 && (
        <div className="px-4 mt-3 flex gap-2 shrink-0 overflow-x-auto">
          {draft.days.map((d, i) => {
            const dayAffected = d.pois.some((p) => isAffected(POIS_MAP[p.id]))
            const active = i === dayIndex
            return (
              <button
                key={d.dayNum}
                onClick={() => setDayIndex(i)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold shrink-0 transition-colors ${
                  active
                    ? "bg-[#1B4332] text-white"
                    : "bg-white border border-slate-200 text-[#64748B] hover:border-[#52B788]"
                }`}
              >
                Day {d.dayNum}
                {d.date && d.date !== "日期待定" && ` · ${d.date}`}
                {hasWeatherEvent && dayAffected && <CloudRain className="h-3 w-3" />}
              </button>
            )
          })}
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8">
        {stops.map((stop, i) => (
          <TimelineStop
            key={`${stop.poiId}-${i}`}
            stop={stop}
            weatherActive={Boolean(hasWeatherEvent)}
            isLast={i === stops.length - 1}
          />
        ))}
        {draft && stops.length === 0 && (
          <p className="text-[12px] text-[#94A3B8] text-center py-8">這天還沒有安排景點</p>
        )}
      </div>

      {/* Bottom sheet */}
      {plan && (
        <BottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onAcceptAll={acceptAll}
          plan={plan}
          swaps={swaps}
          subtitle={`${dayLabel} · ${draft?.destination ?? ""}`}
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
