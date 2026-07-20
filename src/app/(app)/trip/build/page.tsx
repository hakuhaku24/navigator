"use client"

// FFR13：Build Itinerary from Verified POIs（自驗證庫選點成行程）
// UC-TI-002 Basic Flow：
//   1. 使用者於驗證庫將景點加入行程（/explore，見 CartToggleButton）
//   2. 使用者點選「組成行程」（本頁）
//   3. 系統依地理鄰近、停留時間與景點間距安排時段（generateDraftDays，純規則排序，非 LLM）
//   4. 系統產生逐日行程並顯示於行程頁（/trip/[id]）
// Exceptional Flow 2.1：尚未選定任何景點 → 提示先於驗證庫選點（見下方空狀態）
// Alternative Flow 3.1（以 L3 補足 buffer）：本版尚未實作，見下方 TODO 註記

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, X, Sparkles, MapPin, Clock, ArrowRight, Search } from "lucide-react"
import PoiArt from "@/components/PoiArt"
import { useItineraryCartStore } from "@/store/itinerary-cart"
import { fromPOIKnowledge, generateDraftDays, saveDraft } from "@/lib/draft-itinerary"

const LEVEL_COLORS: Record<number, string> = {
  0: "#EF4444", 1: "#F97316", 2: "#3B82F6", 3: "#52B788",
}

function fmtMin(min: number): string {
  if (min < 60) return `${min} 分`
  const h = Math.round(min / 30) / 2
  return `${h} 小時`
}

function newTripId(): string {
  return `trip-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export default function BuildItineraryPage() {
  const router = useRouter()
  const items = useItineraryCartStore((s) => s.items)
  const remove = useItineraryCartStore((s) => s.remove)
  const clear = useItineraryCartStore((s) => s.clear)

  const selected = useMemo(() => Object.values(items), [items])
  const regions = useMemo(() => [...new Set(selected.map((p) => p.region))], [selected])

  const [tripName, setTripName] = useState("")
  const [generating, setGenerating] = useState(false)

  function handleBuild() {
    if (selected.length === 0) return
    setGenerating(true)
    try {
      // score 用可信度：分數只決定每區「從哪個點開始串」，其餘由地理最近鄰決定
      // （見 draft-itinerary.ts generateDraftDays 內部邏輯，非 LLM）
      const scored = selected.map((p) => ({ poi: fromPOIKnowledge(p), score: p.reliabilityScore }))
      const days = generateDraftDays(scored)
      const tripId = newTripId()
      saveDraft(tripId, {
        tripName: tripName.trim() || `${regions.join("・")}行程`,
        destination: regions.join("・"),
        days,
        generatedAt: new Date().toISOString(),
      })
      router.push(`/trip/${tripId}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#faf9f5]">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#faf9f5]/95 backdrop-blur-sm border-b border-slate-100 px-4 pt-4 pb-3">
        <div className="max-w-2xl mx-auto">
          <nav className="mb-2 flex items-center gap-1 text-sm text-[#64748B]">
            <Link href="/explore" className="flex items-center gap-1 hover:text-[#1B4332] transition-colors">
              <ChevronLeft className="h-4 w-4" /> 驗證景點庫
            </Link>
          </nav>
          <h1 className="text-[20px] font-bold text-[#1E293B] tracking-tight">組成行程</h1>
          <p className="text-[11px] text-[#94A3B8] mt-0.5">
            已選 {selected.length} 個景點{regions.length > 0 && ` · ${regions.join("・")}`}
          </p>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 max-w-2xl mx-auto w-full pb-32">
        {selected.length === 0 ? (
          // Exceptional Flow 2.1：尚未選定任何景點
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <Search className="h-6 w-6 text-slate-300" />
            </div>
            <p className="text-[#64748B] font-medium text-[14px]">還沒有選任何景點</p>
            <p className="text-[#94A3B8] text-[12px] mt-1 mb-4">先到驗證景點庫挑選想去的地方</p>
            <Link
              href="/explore"
              className="rounded-xl bg-[#1B4332] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#2D6A4F] transition-colors"
            >
              前往驗證景點庫
            </Link>
          </div>
        ) : (
          <>
            {/* 行程名稱 */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-[#475569] mb-1.5 block">行程名稱（選填）</label>
              <input
                type="text"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                placeholder={`${regions.join("・")}行程`}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-[#1E293B] placeholder:text-[#CBD5E1] focus:outline-none focus:border-[#52B788]"
              />
            </div>

            {/* 已選景點列表 */}
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">已選景點</span>
              <button
                onClick={clear}
                className="text-[11px] font-medium text-[#94A3B8] hover:text-red-500 transition-colors"
              >
                清空
              </button>
            </div>
            <div className="space-y-2">
              {selected.map((poi) => (
                <div key={poi.id} className="flex items-center gap-3 rounded-xl bg-white border border-slate-100 px-3 py-2.5 shadow-sm">
                  <PoiArt
                    text={poi.category}
                    region={poi.region}
                    className="h-11 w-11 shrink-0 rounded-lg"
                    emojiClassName="text-lg"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: LEVEL_COLORS[poi.level] }}
                      />
                      <p className="text-[13px] font-semibold text-[#1E293B] truncate">{poi.name}</p>
                    </div>
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">
                      {poi.region} · {poi.category}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-[#94A3B8] shrink-0">
                    <Clock className="h-3 w-3" />
                    {fmtMin(poi.durationMin)}
                  </div>
                  <button
                    onClick={() => remove(poi.id)}
                    className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[#94A3B8] hover:bg-red-50 hover:text-red-500 transition-colors"
                    aria-label="移除"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* 排序邏輯說明 */}
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#F0FDF4] border border-[#D8F3DC] p-3">
              <MapPin className="h-3.5 w-3.5 text-[#2D6A4F] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#1B4332] leading-relaxed">
                系統會依地理鄰近、停留時間自動排序、分天——同區景點排同一天，用最近鄰路線串接，不會跳來跳去。
              </p>
            </div>
          </>
        )}
      </div>

      {/* Footer CTA */}
      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-14 md:bottom-0 z-40 border-t border-slate-100 bg-white px-4 py-3">
          <button
            onClick={handleBuild}
            disabled={generating}
            className="mx-auto flex max-w-2xl w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold text-white transition-colors disabled:opacity-50"
            style={{ background: "#1B4332", boxShadow: "0 6px 16px -4px rgba(27,67,50,0.4)" }}
          >
            {generating ? (
              <div className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            組成行程
            {!generating && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  )
}
