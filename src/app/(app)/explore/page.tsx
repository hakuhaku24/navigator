"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, X, Clock, Shield, BookOpen, MapPin, ExternalLink } from "lucide-react"
import { POI_KB, type POIKnowledge } from "@/data/poi-kb"

// ── Constants ──────────────────────────────────────────────────────────────
const LEVEL_COLORS: Record<number, string> = {
  0: "#EF4444", 1: "#F97316", 2: "#3B82F6", 3: "#52B788",
}
const LEVEL_LABELS: Record<number, string> = {
  0: "絕對錨點", 1: "彈性錨點", 2: "條件變動", 3: "水位調節",
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
const SOURCE_LABEL: Record<string, string> = {
  google_places: "Google", osm: "OSM", blog_post: "部落格",
}
const SOURCE_COLOR: Record<string, string> = {
  google_places: "#4285F4", osm: "#FF6B35", blog_post: "#52B788",
}

// Derived stats
const AVG_RELIABILITY = Math.round(
  (POI_KB.reduce((s, p) => s + p.reliabilityScore, 0) / POI_KB.length) * 100
)
const TRI_SOURCE_COUNT = POI_KB.filter(p => p.sources.length >= 3).length

type Region        = "全部" | "北海岸" | "陽明山" | "東北角"
type WeatherFilter = "全部" | "低" | "中" | "高" | "極高"
type SourceFilter  = "全部" | "三源" | "雙源" | "單源"

function reliabilityColor(score: number): string {
  if (score >= 0.70) return "#10B981"
  if (score >= 0.45) return "#F59E0B"
  return "#EF4444"
}

function reliabilityLabel(score: number): string {
  if (score >= 0.70) return "高"
  if (score >= 0.45) return "中"
  return "低"
}

function fmtMin(min: number): string {
  if (min < 60) return `${min} 分`
  const h = Math.round(min / 30) / 2
  return `${h} 小時`
}

function fmtDate(d: string | null): string {
  if (!d) return "未知"
  // "2025-09-29" or "2025-9-29" → "2025/09"
  const m = d.match(/^(\d{4})-(\d{1,2})/)
  if (m) return `${m[1]}/${m[2].padStart(2, "0")}`
  return d
}

function cardGradient(region: POIKnowledge["region"]): string {
  const g: Record<POIKnowledge["region"], string> = {
    "北海岸": "linear-gradient(155deg,#6ab7d1,#2f7a96,#0d2c3a)",
    "陽明山": "linear-gradient(155deg,#7db37e,#4a8c52,#1f4d2e)",
    "東北角": "linear-gradient(155deg,#c9a15b,#7a5a33,#3d2c1a)",
  }
  return g[region]
}

const PICSUM_SEEDS: Record<string, string> = {
  "NCA-001":"dolphin","NCA-002":"rocks","NCA-003":"sculpture","NCA-004":"seaweed",
  "NCA-005":"street","NCA-006":"lighthouse","NCA-007":"coast","NCA-008":"beach",
  "NCA-009":"temple","NCA-010":"cave","NCA-011":"seafood","NCA-012":"greece",
  "NCA-013":"museum","NCA-014":"trail","NCA-015":"food",
  "YMS-001":"restaurant","YMS-002":"building","YMS-003":"forest","YMS-004":"grassland",
  "YMS-005":"volcano","YMS-006":"flowers","YMS-007":"nature","YMS-008":"lake",
  "YMS-009":"pond","YMS-010":"hotspring","YMS-011":"sulfur","YMS-012":"clock",
  "YMS-013":"coffee","YMS-014":"park","YMS-015":"viewpoint",
  "NEI-001":"hotel","NEI-002":"teahouse","NEI-003":"aquarium","NEI-004":"goldmine",
  "NEI-005":"tunnel","NEI-006":"hiking","NEI-007":"jiufen","NEI-008":"broom",
  "NEI-009":"lighthouse2","NEI-010":"rocks2","NEI-011":"mountain","NEI-012":"station",
  "NEI-013":"elephant","NEI-014":"fishing","NEI-015":"cafe",
}

function getPicsumUrl(poi: POIKnowledge): string {
  const seed = PICSUM_SEEDS[poi.id] ?? poi.id
  return `https://picsum.photos/seed/${seed}/800/600`
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white"
      style={{ background: SOURCE_COLOR[source] ?? "#64748B" }}
    >
      {SOURCE_LABEL[source] ?? source}
    </span>
  )
}

function ReliabilityBar({ score, size = "sm" }: { score: number; size?: "sm" | "md" }) {
  const color = reliabilityColor(score)
  const pct   = Math.round(score * 100)
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 rounded-full bg-slate-200 overflow-hidden ${size === "sm" ? "h-1.5" : "h-2"}`}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className={`font-bold tabular-nums ${size === "sm" ? "text-[10px]" : "text-[12px]"}`} style={{ color }}>
        {pct}%
      </span>
    </div>
  )
}

function POICard({ poi, onClick }: { poi: POIKnowledge; onClick: () => void }) {
  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: "0 12px 28px -8px rgba(15,23,42,0.16)" }}
      transition={{ duration: 0.18 }}
      onClick={onClick}
      className="cursor-pointer rounded-2xl bg-white overflow-hidden border border-slate-100 shadow-sm"
    >
      {/* Image */}
      <div className="relative overflow-hidden" style={{ height: 160 }}>
        <div className="absolute inset-0" style={{ background: cardGradient(poi.region) }} />
        <img
          src={poi.imageUrl || getPicsumUrl(poi)}
          alt={poi.name}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = getPicsumUrl(poi) }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />

        {/* Level badge */}
        <div
          className="absolute top-2 left-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold text-white z-10"
          style={{ background: LEVEL_COLORS[poi.level] }}
        >
          L{poi.level}
        </div>

        {/* Indoor badge */}
        {poi.isIndoor && (
          <div className="absolute top-2 right-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold bg-white/90 text-[#1B4332] z-10">
            室內
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3">
        <h3 className="font-semibold text-[#1E293B] text-[13px] leading-snug line-clamp-1 mb-0.5">
          {poi.name}
        </h3>
        <p className="text-[10px] text-[#94A3B8] mb-2">{poi.region} · {poi.category}</p>

        {/* Reliability bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-medium text-[#94A3B8]">可信度</span>
            <span className="text-[9px] font-medium text-[#94A3B8]">
              {poi.sources.length} 個來源
            </span>
          </div>
          <ReliabilityBar score={poi.reliabilityScore} size="sm" />
        </div>

        {/* Source badges + duration */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {poi.sources.map(s => <SourceBadge key={s} source={s} />)}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-[#94A3B8]">
            <Clock className="h-2.5 w-2.5" />
            <span>{fmtMin(poi.durationMin)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Detail Sheet ───────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[13px] w-5 shrink-0">{icon}</span>
      <span className="text-[11px] text-[#94A3B8] font-medium w-16 shrink-0">{label}</span>
      <span className="text-[12px] text-[#1E293B] font-medium">{value}</span>
    </div>
  )
}

function DetailSheet({ poi, onClose }: { poi: POIKnowledge; onClose: () => void }) {
  return (
    <AnimatePresence>
      {poi && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Hero */}
            <div className="relative shrink-0" style={{ height: 220 }}>
              <div className="absolute inset-0" style={{ background: cardGradient(poi.region) }} />
              <img
                src={poi.imageUrl || getPicsumUrl(poi)}
                alt={poi.name}
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = getPicsumUrl(poi) }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

              <button
                onClick={onClose}
                className="absolute top-4 right-4 h-8 w-8 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors"
              >
                <X className="h-4 w-4 text-white" />
              </button>

              <div className="absolute bottom-4 left-4 right-4">
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-bold text-white"
                    style={{ background: LEVEL_COLORS[poi.level] }}
                  >
                    L{poi.level} {LEVEL_LABELS[poi.level]}
                  </span>
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-white/95"
                    style={{ color: WEATHER_COLOR[poi.weatherSensitivity] }}
                  >
                    天氣影響 {poi.weatherSensitivity}
                  </span>
                  {poi.isIndoor && (
                    <span className="rounded-md px-2 py-0.5 text-[10px] font-bold bg-white/95 text-[#1B4332]">
                      室內
                    </span>
                  )}
                </div>
                <h2 className="text-[18px] font-bold text-white leading-snug">{poi.name}</h2>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">

              {/* Basic info */}
              <div className="px-5 py-4 space-y-2.5">
                <InfoRow icon="📍" label="地址" value={poi.address || `${poi.region} ${poi.category}`} />
                <InfoRow icon="⏱" label="預估停留" value={fmtMin(poi.durationMin)} />
                <InfoRow icon="⭐" label="評分" value={`${poi.rating} / 5.0`} />
                {poi.hours && <InfoRow icon="🕐" label="營業時間" value={poi.hours} />}
              </div>

              {/* Verification block */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-3.5 w-3.5 text-[#1B4332]" />
                  <h4 className="text-[11px] font-bold text-[#1B4332] uppercase tracking-wider">驗證資訊</h4>
                </div>

                {/* Reliability score */}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-[#475569]">可信度評分</span>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ background: reliabilityColor(poi.reliabilityScore) }}
                    >
                      {reliabilityLabel(poi.reliabilityScore)}可信
                    </span>
                  </div>
                  <ReliabilityBar score={poi.reliabilityScore} size="md" />
                  <p className="text-[10px] text-[#94A3B8] mt-2">
                    綜合 Google Places 時效性、OSM 地理資料、部落格三源驗證後計算
                  </p>
                </div>

                {/* Sources */}
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-[11px] text-[#64748B] font-medium">通過來源：</span>
                  {poi.sources.map(s => (
                    <div key={s} className="flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: SOURCE_COLOR[s] ?? "#64748B" }}
                      />
                      <span className="text-[11px] text-[#475569] font-medium">{SOURCE_LABEL[s] ?? s}</span>
                    </div>
                  ))}
                </div>
                {poi.latestBlogDate && (
                  <p className="text-[10px] text-[#94A3B8]">
                    最新部落格資料：{fmtDate(poi.latestBlogDate)}
                  </p>
                )}
              </div>

              {/* Level reasoning */}
              {poi.levelReasoning && (
                <div className="px-5 py-4">
                  <h4 className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-2">韌性分級理由</h4>
                  <div
                    className="rounded-xl p-3.5"
                    style={{ background: LEVEL_COLORS[poi.level] + "10", border: `1.5px solid ${LEVEL_COLORS[poi.level]}25` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-[10px] font-bold text-white px-2 py-0.5 rounded-md"
                        style={{ background: LEVEL_COLORS[poi.level] }}
                      >
                        L{poi.level} {LEVEL_LABELS[poi.level]}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#475569] leading-relaxed">{poi.levelReasoning}</p>
                  </div>
                </div>
              )}

              {/* Tourist description */}
              <div className="px-5 py-4">
                <h4 className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-2">AI 驗證描述</h4>
                <p className="text-[12px] text-[#475569] leading-relaxed">{poi.touristDescription}</p>
              </div>

              {/* Blog snippets */}
              {poi.blogPosts.length > 0 && (
                <div className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="h-3.5 w-3.5 text-[#52B788]" />
                    <h4 className="text-[11px] font-bold text-[#52B788] uppercase tracking-wider">旅客真實評論</h4>
                  </div>
                  <div className="space-y-2.5">
                    {poi.blogPosts.map((b, i) => (
                      <div key={i} className="rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] p-3">
                        <div className="flex items-center justify-between mb-1">
                          {b.url ? (
                            <a
                              href={b.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-semibold text-[#166534] line-clamp-1 flex-1 mr-2 hover:underline flex items-center gap-1"
                            >
                              {b.title}
                              <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-60" />
                            </a>
                          ) : (
                            <span className="text-[10px] font-semibold text-[#166534] line-clamp-1 flex-1 mr-2">
                              {b.title}
                            </span>
                          )}
                          {b.date && (
                            <span className="text-[9px] text-[#52B788] bg-white border border-[#BBF7D0] px-1.5 py-0.5 rounded-full shrink-0 font-medium">
                              {fmtDate(b.date)}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#166534] leading-relaxed">{b.snippet}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              <div className="px-5 py-4">
                <h4 className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-2">景點標籤</h4>
                <div className="flex flex-wrap gap-1.5">
                  {poi.tags.map((t) => (
                    <span key={t} className="text-[11px] px-2.5 py-1 rounded-full bg-[#D8F3DC] text-[#1B4332] font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div className="px-5 py-4">
                <h4 className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-2">位置</h4>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-[#64748B] font-mono">{poi.lat}, {poi.lng}</p>
                  <a
                    href={`https://maps.google.com/?q=${poi.lat},${poi.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1B4332] hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    地圖查看
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
                style={{ background: "#1B4332", boxShadow: "0 6px 16px -4px rgba(27,67,50,0.35)" }}
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

// ── Filter chip ────────────────────────────────────────────────────────────

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

// ── Page ───────────────────────────────────────────────────────────────────

export default function ExplorePage() {
  const [region,  setRegion]  = useState<Region>("全部")
  const [level,   setLevel]   = useState<number | "全部">("全部")
  const [weather, setWeather] = useState<WeatherFilter>("全部")
  const [source,  setSource]  = useState<SourceFilter>("全部")
  const [search,  setSearch]  = useState("")
  const [selected, setSelected] = useState<POIKnowledge | null>(null)

  const filtered = useMemo(() => {
    return POI_KB.filter((p) => {
      if (region  !== "全部" && p.region            !== region)  return false
      if (level   !== "全部" && p.level              !== level)   return false
      if (weather !== "全部" && p.weatherSensitivity !== weather) return false
      if (source === "三源" && p.sources.length < 3)  return false
      if (source === "雙源" && p.sources.length !== 2) return false
      if (source === "單源" && p.sources.length !== 1) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [region, level, weather, source, search])

  const regions:  Region[]            = ["全部", "北海岸", "陽明山", "東北角"]
  const levels:   (number | "全部")[] = ["全部", 0, 1, 2, 3]
  const weathers: WeatherFilter[]     = ["全部", "低", "中", "高", "極高"]
  const sources:  SourceFilter[]      = ["全部", "三源", "雙源", "單源"]

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#faf9f5]">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#faf9f5]/95 backdrop-blur-sm border-b border-slate-100 px-4 pt-4 pb-3">
        <div className="max-w-6xl mx-auto">

          {/* Title row */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-[20px] font-bold text-[#1E293B] tracking-tight">驗證景點庫</h1>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">
                {POI_KB.length} 個景點已驗證
                {filtered.length !== POI_KB.length && (
                  <span> · 篩選後 <span className="font-bold text-[#1B4332]">{filtered.length}</span> 個</span>
                )}
              </p>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="搜尋..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2 text-[12px] text-[#1E293B] placeholder:text-[#CBD5E1] focus:outline-none focus:border-[#52B788] w-32"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-2.5 w-2.5 text-[#94A3B8]" />
                </button>
              )}
            </div>
          </div>

          {/* Stats chips */}
          <div className="flex gap-2 mb-3">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
              <span className="text-[10px] font-semibold text-[#475569]">平均可信度 {AVG_RELIABILITY}%</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1">
              <Shield className="h-2.5 w-2.5 text-[#4285F4]" />
              <span className="text-[10px] font-semibold text-[#475569]">{TRI_SOURCE_COUNT} 個三源核驗</span>
            </div>
          </div>

          {/* Filter rows */}
          <div className="space-y-1.5">
            {/* Region + Level */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              {regions.map(r => (
                <Chip key={r} active={region === r} onClick={() => setRegion(r)}>{r}</Chip>
              ))}
              <div className="w-px bg-slate-200 shrink-0 mx-0.5 self-stretch" />
              {levels.map(l => (
                <Chip key={String(l)} active={level === l} onClick={() => setLevel(l)}>
                  {l === "全部" ? "全部層級" : `L${l}`}
                </Chip>
              ))}
            </div>

            {/* Weather + Source */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              <span className="text-[10px] font-medium text-[#94A3B8] self-center mr-0.5 shrink-0">天氣</span>
              {weathers.map(w => (
                <Chip key={w} active={weather === w} onClick={() => setWeather(w)}>{w}</Chip>
              ))}
              <div className="w-px bg-slate-200 shrink-0 mx-0.5 self-stretch" />
              <span className="text-[10px] font-medium text-[#94A3B8] self-center mr-0.5 shrink-0">來源</span>
              {sources.map(s => (
                <Chip key={s} active={source === s} onClick={() => setSource(s)}>{s}</Chip>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 py-4 max-w-6xl mx-auto w-full">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <Search className="h-6 w-6 text-slate-300" />
            </div>
            <p className="text-[#64748B] font-medium text-[14px]">找不到符合條件的景點</p>
            <button
              onClick={() => { setRegion("全部"); setLevel("全部"); setWeather("全部"); setSource("全部"); setSearch("") }}
              className="mt-2 text-[13px] text-[#1B4332] font-semibold hover:underline"
            >
              清除所有篩選
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((poi) => (
              <POICard key={poi.id} poi={poi} onClick={() => setSelected(poi)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Detail Sheet ─────────────────────────────────────────────────── */}
      {selected && (
        <DetailSheet poi={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
