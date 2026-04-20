"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, X, MapPin, Clock, Star, ExternalLink, ChevronDown } from "lucide-react"
import { POIS, type POI } from "@/data/pois"

// ── Constants ──────────────────────────────────────────────────────────
const LEVEL_COLORS: Record<number, string> = {
  0: "#EF4444", 1: "#F97316", 2: "#3B82F6", 3: "#52B788",
}
const LEVEL_LABELS: Record<number, string> = {
  0: "錨點", 1: "彈性", 2: "可調", 3: "水位",
}
const LEVEL_DESC: Record<number, string> = {
  0: "非去不可，系統禁止自動替換（如預訂好的餐廳）",
  1: "主要目的地，盡量保留但可平移時段",
  2: "沿路順遊，天氣一變就可換",
  3: "填空 buffer，最容易被 swap 掉",
}
const WEATHER_COLOR: Record<string, string> = {
  "低": "#10B981", "中": "#F59E0B", "高": "#EF4444", "極高": "#DC2626",
}
const WEATHER_BAR: Record<string, number> = {
  "低": 25, "中": 50, "高": 75, "極高": 100,
}

type Region = "全部" | "北海岸" | "陽明山" | "東北角"
type WeatherFilter = "全部" | "低" | "中" | "高" | "極高"

function cardGradient(region: POI["region"]): string {
  const g: Record<POI["region"], string> = {
    "北海岸": "linear-gradient(155deg,#6ab7d1,#2f7a96,#0d2c3a)",
    "陽明山": "linear-gradient(155deg,#7db37e,#4a8c52,#1f4d2e)",
    "東北角": "linear-gradient(155deg,#c9a15b,#7a5a33,#3d2c1a)",
  }
  return g[region]
}

function fmtMin(min: number): string {
  if (min < 60) return `${min} 分鐘`
  const h = Math.round(min / 30) / 2
  return `${h} 小時`
}

// ── POI Card ───────────────────────────────────────────────────────────
function POICard({ poi, onClick }: { poi: POI; onClick: () => void }) {
  return (
    <motion.div
      whileHover={{ y: -4, boxShadow: "0 12px 32px -8px rgba(15,23,42,0.18)" }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="cursor-pointer rounded-2xl bg-white overflow-hidden border border-slate-100 shadow-sm"
    >
      {/* Image */}
      <div className="relative overflow-hidden" style={{ height: 180 }}>
        {poi.image_url ? (
          <img
            src={poi.image_url}
            alt={poi.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none"
              e.currentTarget.nextElementSibling?.removeAttribute("hidden")
            }}
          />
        ) : null}
        <div
          className="absolute inset-0"
          hidden={!!poi.image_url}
          style={{ background: cardGradient(poi.region) }}
        />
        {/* Fallback always behind in case image fails */}
        <div
          className="absolute inset-0 -z-0"
          style={{ background: cardGradient(poi.region) }}
        />

        {/* Level badge */}
        <div
          className="absolute top-2.5 left-2.5 rounded-md px-2 py-0.5 text-[10px] font-bold text-white z-10"
          style={{ background: LEVEL_COLORS[poi.level] }}
        >
          L{poi.level} {LEVEL_LABELS[poi.level]}
        </div>

        {/* Weather badge */}
        <div
          className="absolute top-2.5 right-2.5 rounded-md px-2 py-0.5 text-[10px] font-bold bg-white/95 z-10"
          style={{ color: WEATHER_COLOR[poi.weather_sensitivity] }}
        >
          🌧 {poi.weather_sensitivity}
        </div>
      </div>

      {/* Info */}
      <div className="p-3.5">
        <h3 className="font-semibold text-[#1E293B] text-[14px] leading-snug line-clamp-2 mb-1">
          {poi.name}
        </h3>
        <p className="text-[11px] text-[#94A3B8] mb-2">{poi.region} · {poi.category}</p>

        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[12px] text-amber-500">⭐</span>
          <span className="text-[12px] font-semibold text-[#1E293B]">{poi.rating}</span>
        </div>

        <div className="flex flex-wrap gap-1 mb-2">
          {poi.tags.slice(0, 2).map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[#D8F3DC] text-[#1B4332] font-medium">
              {t}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-[#64748B]">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{fmtMin(poi.duration_min)}</span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────
function POIModal({ poi, onClose }: { poi: POI; onClose: () => void }) {
  return (
    <AnimatePresence>
      {poi && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Hero image */}
            <div className="relative shrink-0" style={{ height: 240 }}>
              {poi.image_url ? (
                <img src={poi.image_url} alt={poi.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full" style={{ background: cardGradient(poi.region) }} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

              {/* Close */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 h-8 w-8 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors"
              >
                <X className="h-4 w-4 text-white" />
              </button>

              {/* Name + badges */}
              <div className="absolute bottom-4 left-4 right-4">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-bold text-white"
                    style={{ background: LEVEL_COLORS[poi.level] }}
                  >
                    L{poi.level} {LEVEL_LABELS[poi.level]}
                  </span>
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-white/95"
                    style={{ color: WEATHER_COLOR[poi.weather_sensitivity] }}
                  >
                    🌧 {poi.weather_sensitivity}
                  </span>
                  {poi.is_indoor && (
                    <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-white/95 text-[#1B4332]">
                      🏠 室內
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-white leading-snug">{poi.name}</h2>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Basic info */}
              <div className="px-5 py-4 border-b border-slate-100 space-y-2.5">
                <InfoRow icon="📍" label="區域" value={poi.region} />
                <InfoRow icon="🗂" label="分類" value={poi.category} />
                <InfoRow icon="⭐" label="評分" value={`${poi.rating} / 5.0`} />
                <InfoRow icon="⏱" label="預估停留" value={fmtMin(poi.duration_min)} />
                <InfoRow icon={poi.is_indoor ? "🏠" : "🌿"} label="環境" value={poi.is_indoor ? `室內 · ${poi.indoor_type}` : "室外"} />
              </div>

              {/* Level resilience block */}
              <div className="px-5 py-4 border-b border-slate-100">
                <h4 className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-3">韌性分級</h4>
                <div
                  className="rounded-xl p-4"
                  style={{ background: LEVEL_COLORS[poi.level] + "12", border: `1.5px solid ${LEVEL_COLORS[poi.level]}30` }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="rounded-lg px-2.5 py-1 text-[12px] font-bold text-white"
                      style={{ background: LEVEL_COLORS[poi.level] }}
                    >
                      Level {poi.level} — {LEVEL_LABELS[poi.level]}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#64748B] mb-3">{LEVEL_DESC[poi.level]}</p>

                  {/* Weather bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#64748B] font-medium w-16 shrink-0">天氣影響</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${WEATHER_BAR[poi.weather_sensitivity]}%`,
                          background: WEATHER_COLOR[poi.weather_sensitivity],
                        }}
                      />
                    </div>
                    <span
                      className="text-[11px] font-bold w-6 text-right"
                      style={{ color: WEATHER_COLOR[poi.weather_sensitivity] }}
                    >
                      {poi.weather_sensitivity}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="px-5 py-4 border-b border-slate-100">
                <h4 className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-3">景點標籤</h4>
                <div className="flex flex-wrap gap-1.5">
                  {poi.tags.map((t) => (
                    <span key={t} className="text-[11px] px-2.5 py-1 rounded-full bg-[#D8F3DC] text-[#1B4332] font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Backup strategy */}
              <div className="px-5 py-4 border-b border-slate-100">
                <h4 className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-3">備案策略</h4>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                  <p className="text-[12px] text-amber-800 leading-relaxed">
                    ⚠️ {poi.backup_strategy}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div className="px-5 py-4 border-b border-slate-100">
                <h4 className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-3">景點描述</h4>
                <p className="text-[13px] text-[#475569] leading-relaxed">{poi.semantic_description}</p>
              </div>

              {/* Location */}
              <div className="px-5 py-4">
                <h4 className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-3">位置</h4>
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-[#64748B] font-mono">
                    {poi.lat}, {poi.lng}
                  </p>
                  <a
                    href={`https://maps.google.com/?q=${poi.lat},${poi.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1B4332] hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    在地圖上查看
                  </a>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-5 py-4 border-t border-slate-100 flex gap-3 bg-white">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-[13px] font-semibold text-[#64748B] hover:bg-slate-50 transition-colors"
              >
                關閉
              </button>
              <button
                className="flex-[2] rounded-xl py-3 text-[13px] font-semibold text-white transition-colors hover:opacity-90"
                style={{ background: "#1B4332", boxShadow: "0 6px 16px -4px rgba(27,67,50,0.4)" }}
              >
                加入行程候選
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[14px] w-5 shrink-0">{icon}</span>
      <span className="text-[12px] text-[#94A3B8] font-medium w-16 shrink-0">{label}</span>
      <span className="text-[13px] text-[#1E293B] font-medium">{value}</span>
    </div>
  )
}

// ── Filter chip ────────────────────────────────────────────────────────
function Chip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-all"
      style={{
        background: active ? "#1B4332" : "#fff",
        color: active ? "#fff" : "#64748B",
        border: active ? "none" : "1px solid #E2E8F0",
      }}
    >
      {children}
    </button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────
export default function ExplorePage() {
  const [region, setRegion] = useState<Region>("全部")
  const [level, setLevel] = useState<number | "全部">("全部")
  const [weather, setWeather] = useState<WeatherFilter>("全部")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<POI | null>(null)

  const filtered = useMemo(() => {
    return POIS.filter((p) => {
      if (region !== "全部" && p.region !== region) return false
      if (level !== "全部" && p.level !== level) return false
      if (weather !== "全部" && p.weather_sensitivity !== weather) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [region, level, weather, search])

  const regions: Region[] = ["全部", "北海岸", "陽明山", "東北角"]
  const levels: (number | "全部")[] = ["全部", 0, 1, 2, 3]
  const levelChipLabel = (l: number | "全部") =>
    l === "全部" ? "全部" : `L${l} ${LEVEL_LABELS[l as number]}`
  const weathers: WeatherFilter[] = ["全部", "低", "中", "高", "極高"]

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#faf9f5]">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#faf9f5]/95 backdrop-blur-sm border-b border-slate-100 px-4 pt-5 pb-3">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-bold text-[#1E293B] tracking-tight">景點池總覽</h1>
              <p className="text-[12px] text-[#94A3B8] mt-0.5">
                共 {POIS.length} 個景點
                {filtered.length !== POIS.length && (
                  <span> · 篩選後顯示 <span className="font-bold text-[#1B4332]">{filtered.length}</span> 個</span>
                )}
              </p>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="搜尋景點..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-[12px] text-[#1E293B] placeholder:text-[#CBD5E1] focus:outline-none focus:border-[#52B788] w-40"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X className="h-3 w-3 text-[#94A3B8]" />
                </button>
              )}
            </div>
          </div>

          {/* Filter rows */}
          <div className="space-y-2">
            {/* Region */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              {regions.map((r) => (
                <Chip key={r} active={region === r} onClick={() => setRegion(r)}>{r}</Chip>
              ))}
              <div className="w-px shrink-0" />
              {/* Level chips inline */}
              {levels.map((l) => (
                <Chip
                  key={String(l)}
                  active={level === l}
                  onClick={() => setLevel(l)}
                >
                  {levelChipLabel(l)}
                </Chip>
              ))}
            </div>

            {/* Weather */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              <span className="text-[11px] font-medium text-[#94A3B8] self-center mr-1 shrink-0">天氣影響</span>
              {weathers.map((w) => (
                <Chip key={w} active={weather === w} onClick={() => setWeather(w)}>{w}</Chip>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 px-4 py-5 max-w-6xl mx-auto w-full">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <Search className="h-7 w-7 text-slate-300" />
            </div>
            <p className="text-[#64748B] font-medium">找不到符合條件的景點</p>
            <button
              onClick={() => { setRegion("全部"); setLevel("全部"); setWeather("全部"); setSearch("") }}
              className="mt-3 text-[13px] text-[#1B4332] font-semibold hover:underline"
            >
              清除所有篩選
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((poi) => (
              <POICard key={poi.id} poi={poi} onClick={() => setSelected(poi)} />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {selected && (
        <POIModal poi={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
