"use client"

import Link from "next/link"
import Image from "next/image"
import { Plus, FileText, PenSquare, CalendarCheck, Clock, MapPin, Calendar, Users, LayoutGrid, Vote, BarChart2, CloudRain, Zap } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────
type TripStatus = "planning" | "active" | "booked" | "done"

interface Trip {
  id: string
  name: string
  destination: string
  startDate: string
  endDate: string
  days: number
  poiCount: number
  status: TripStatus
  memberCount: number
  coverSeed: string
}

// ── Mock Data ──────────────────────────────────────────────────────────
const MOCK_TRIPS: Trip[] = [
  {
    id: "trip-1",
    name: "東京經典5日遊",
    destination: "東京都台東",
    startDate: "2026-05-10",
    endDate: "2026-05-14",
    days: 5,
    poiCount: 19,
    status: "active",
    memberCount: 4,
    coverSeed: "tokyo-shibuya",
  },
  {
    id: "trip-2",
    name: "首爾繽紛5日遊",
    destination: "首爾",
    startDate: "2026-06-01",
    endDate: "2026-06-05",
    days: 5,
    poiCount: 16,
    status: "planning",
    memberCount: 5,
    coverSeed: "seoul-city",
  },
  {
    id: "trip-3",
    name: "台北經典5日遊",
    destination: "台北市",
    startDate: "2026-04-15",
    endDate: "2026-04-19",
    days: 5,
    poiCount: 18,
    status: "active",
    memberCount: 3,
    coverSeed: "taipei-101",
  },
  {
    id: "trip-4",
    name: "北海岸一日遊",
    destination: "新北市",
    startDate: "2026-04-26",
    endDate: "2026-04-26",
    days: 1,
    poiCount: 0,
    status: "planning",
    memberCount: 6,
    coverSeed: "ocean-coast",
  },
  {
    id: "trip-5",
    name: "陽明山賞花之旅",
    destination: "台北市陽明山",
    startDate: "2026-03-14",
    endDate: "2026-03-15",
    days: 2,
    poiCount: 8,
    status: "done",
    memberCount: 4,
    coverSeed: "mountain-flowers",
  },
]

// ── Helpers ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<TripStatus, { label: string; className: string }> = {
  active:   { label: "進行中", className: "bg-[#52B788] text-white" },
  planning: { label: "規劃中", className: "bg-amber-400 text-white" },
  booked:   { label: "已預訂", className: "bg-sky-400 text-white" },
  done:     { label: "已完成", className: "bg-slate-400 text-white" },
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  const fmt = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`
  return `${fmt(s)} - ${fmt(e)}`
}

// ── Stats Bar ──────────────────────────────────────────────────────────
function StatsBar({ trips }: { trips: Trip[] }) {
  const active   = trips.filter((t) => t.status === "active").length
  const planning = trips.filter((t) => t.status === "planning").length
  const booked   = trips.filter((t) => t.status === "booked").length
  const done     = trips.filter((t) => t.status === "done").length
  const total    = trips.length || 1

  const stats = [
    { label: "進行中", value: active,   icon: FileText,      color: "text-[#1B4332]", bar: "bg-[#52B788]",   bg: "bg-[#D8F3DC]" },
    { label: "規劃中", value: planning, icon: PenSquare,     color: "text-amber-600",  bar: "bg-amber-400",   bg: "bg-amber-50" },
    { label: "已預訂", value: booked,   icon: CalendarCheck, color: "text-sky-600",    bar: "bg-sky-400",     bg: "bg-sky-50" },
    { label: "已完成", value: done,     icon: Clock,         color: "text-slate-500",  bar: "bg-slate-400",   bg: "bg-slate-100" },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, color, bar, bg }) => (
        <div key={label} className="rounded-2xl bg-white p-5 shadow-card">
          <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div className="mb-1 text-3xl font-bold text-[#1E293B]">{value}</div>
          <div className="mb-3 text-sm text-[#64748B]">{label}</div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-500 ${bar}`}
              style={{ width: `${Math.min((value / total) * 100, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Trip Card ──────────────────────────────────────────────────────────
function TripCard({ trip }: { trip: Trip }) {
  const { label, className } = STATUS_CONFIG[trip.status]

  return (
    <Link
      href={`/trip/${trip.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
    >
      {/* Cover image */}
      <div className="relative h-44 w-full overflow-hidden bg-slate-200">
        <Image
          src={`https://picsum.photos/seed/${trip.coverSeed}/400/176`}
          alt={trip.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* Status badge */}
        <div className="absolute right-3 top-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
            {label}
          </span>
        </div>

        {/* POI count badge */}
        {trip.poiCount > 0 && (
          <div className="absolute left-3 bottom-3 flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
            <MapPin className="h-3 w-3" />
            {trip.poiCount} 個景點
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="mb-2 font-semibold text-[#1E293B] line-clamp-1">{trip.name}</h3>

        <div className="mt-auto space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 font-medium">
              {trip.days} 天
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>{trip.memberCount} 位成員</span>
          </div>

          {trip.poiCount === 0 && (
            <p className="text-xs text-[#94A3B8] italic">還沒新增景點</p>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── Empty State ────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-20 text-center">
      <div className="mb-4 text-6xl">🦊</div>
      <h3 className="mb-2 text-lg font-semibold text-[#1E293B]">你的森林探險還缺一個起點</h3>
      <p className="mb-6 text-sm text-[#64748B]">點擊上方按鈕開始規劃你的第一個旅程吧！</p>
      <Link
        href="/group/new"
        className="flex items-center gap-2 rounded-xl bg-[#1B4332] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#2D6A4F]"
      >
        <Plus className="h-4 w-4" />
        建立行程
      </Link>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const trips = MOCK_TRIPS

  return (
    <div className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1E293B]">我的行程</h1>
        <p className="mt-1 text-sm text-[#64748B]">管理你的旅遊計畫，探索新的目的地</p>
      </div>

      {/* Demo shortcuts */}
      <div className="mb-8 rounded-2xl bg-[#1B4332] p-5 text-white">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="h-4 w-4 text-[#52B788]" />
          <p className="text-[13px] font-bold tracking-tight">功能快速體驗</p>
        </div>
        <p className="text-[11px] text-white/60 mb-4">北海岸放空團 Demo · 點擊直達各功能頁</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { href: "/trip/trip-1/explore",  icon: LayoutGrid, label: "格狀篩選", sub: "快速過濾",  accent: "#52B788" },
            { href: "/trip/trip-1/vote",     icon: Vote,       label: "Swipe 投票", sub: "必去/喜歡", accent: "#60A5FA" },
            { href: "/trip/trip-1/results",  icon: BarChart2,  label: "投票結果", sub: "排行榜",    accent: "#FBBF24" },
            { href: "/trip/trip-1/weather",  icon: CloudRain,  label: "天氣應變", sub: "智能備案",  accent: "#F87171" },
          ].map(({ href, icon: Icon, label, sub, accent }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors p-3 text-center"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: accent + "30" }}
              >
                <Icon className="h-4 w-4" style={{ color: accent }} />
              </div>
              <div>
                <p className="text-[10px] font-bold leading-tight">{label}</p>
                <p className="text-[9px] text-white/50 mt-0.5">{sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8">
        <StatsBar trips={trips} />
      </div>

      {/* Trip grid */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-[#1E293B]">所有行程</h2>
        <Link
          href="/group/new"
          className="flex items-center gap-1.5 rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#2D6A4F]"
        >
          <Plus className="h-4 w-4" />
          新建行程
        </Link>
      </div>

      {trips.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  )
}
