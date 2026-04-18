"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  Compass,
  CalendarDays,
  Users,
  MapPin,
  Check,
  ChevronRight,
  Sparkles,
} from "lucide-react"

// ── Mock data ──────────────────────────────────────────
interface MockMember {
  id: string
  name: string
  initials: string
  color: string
}

interface MockGroup {
  id: string
  name: string
  destination: string
  destinationEmoji: string
  badge: string
  startDate: string
  endDate: string
  headcount: number
  members: MockMember[]
  createdBy: string
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-cyan-500",
]

function getMockGroup(id: string): MockGroup {
  // Deterministic mock based on id
  const names = ["2026 北海岸閃電行", "陽明山週末漫遊", "東北海岸探險記", "暑假海岸公路旅"]
  const dests = [
    { name: "北海岸", emoji: "🏖️", badge: "地質 · 海岸" },
    { name: "陽明山", emoji: "🌸", badge: "山林 · 生態" },
    { name: "東北海岸", emoji: "🌊", badge: "自然 · 海景" },
    { name: "北海岸", emoji: "🏖️", badge: "地質 · 海岸" },
  ]
  const idx = id.charCodeAt(0) % 4

  const memberPool: MockMember[] = [
    { id: "1", name: "Jerry", initials: "J", color: AVATAR_COLORS[0] },
    { id: "2", name: "Emily", initials: "E", color: AVATAR_COLORS[1] },
    { id: "3", name: "Kevin", initials: "K", color: AVATAR_COLORS[2] },
    { id: "4", name: "Sara", initials: "S", color: AVATAR_COLORS[3] },
    { id: "5", name: "Tom", initials: "T", color: AVATAR_COLORS[4] },
  ]

  return {
    id,
    name: names[idx],
    destination: dests[idx].name,
    destinationEmoji: dests[idx].emoji,
    badge: dests[idx].badge,
    startDate: "2026-07-12",
    endDate: "2026-07-14",
    headcount: 5,
    members: memberPool.slice(0, 3),
    createdBy: "Jerry",
  }
}

// ── Avatar component ───────────────────────────────────
function Avatar({ member, size = "md" }: { member: MockMember; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-14 w-14 text-lg" : size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm"
  return (
    <div className={`${sizeClass} ${member.color} flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-sm ring-2 ring-white`}>
      {member.initials}
    </div>
  )
}

// ── Placeholder slot ───────────────────────────────────
function EmptySlot({ label }: { label: string }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-slate-200 bg-white text-xs text-slate-300 ring-2 ring-white">
      {label}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────
export default function JoinGroupPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [joined, setJoined] = useState(false)
  const [loading, setLoading] = useState(false)

  const group = getMockGroup(params.id ?? "demo")

  const emptySlots = Math.max(0, group.headcount - group.members.length)

  const handleJoin = async () => {
    setLoading(true)
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 900))
    setLoading(false)
    setJoined(true)
  }

  const dayDiff = Math.ceil(
    (new Date(group.endDate).getTime() - new Date(group.startDate).getTime()) / 86400000
  )

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
      {/* Navbar */}
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex h-16 max-w-xl items-center px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB]">
              <Compass className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold text-[#1E293B]">Navigator</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-6 py-10">
        {joined ? (
          /* ── Join Success ── */
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2563EB]">
                <Check className="h-7 w-7 text-white" strokeWidth={3} />
              </div>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-[#1E293B]">成功加入旅程！</h1>
            <p className="mb-8 text-[#64748B]">
              你已加入「{group.name}」，開始一起規劃吧 🎉
            </p>

            {/* Updated member list */}
            <div className="mb-8 rounded-2xl bg-white p-6 shadow-card">
              <p className="mb-4 text-sm font-medium text-[#64748B]">目前成員</p>
              <div className="flex items-center justify-center gap-2">
                {group.members.map((m) => (
                  <div key={m.id} className="text-center">
                    <Avatar member={m} size="md" />
                    <p className="mt-1 text-xs text-[#64748B]">{m.name}</p>
                  </div>
                ))}
                {/* "You" avatar */}
                <div className="text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F97316] font-bold text-white shadow-sm ring-2 ring-white ring-offset-2 ring-offset-[#F97316]/20">
                    我
                  </div>
                  <p className="mt-1 text-xs font-medium text-[#F97316]">你</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push(`/group/${group.id}`)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3.5 text-sm font-semibold text-white transition-all hover:bg-[#1D4ED8]"
            >
              <Sparkles className="h-4 w-4" />
              開始規劃行程
            </button>
          </div>
        ) : (
          /* ── Join Form ── */
          <>
            {/* Invite header */}
            <div className="mb-6 text-center">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl">
                ✈️
              </div>
              <p className="text-sm text-[#64748B]">你收到了一份旅遊邀請</p>
            </div>

            {/* Group Info Card */}
            <div className="mb-5 overflow-hidden rounded-2xl bg-white shadow-card">
              {/* Gradient header */}
              <div
                className="flex h-24 items-end p-5"
                style={{
                  background:
                    "linear-gradient(135deg, #1D4ED8 0%, #2563EB 60%, #3B82F6 100%)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-2xl backdrop-blur-sm">
                    {group.destinationEmoji}
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-white">{group.name}</h1>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white/90">
                        {group.badge}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="p-5">
                <div className="grid grid-cols-3 divide-x divide-slate-100">
                  <div className="pr-4 text-center">
                    <MapPin className="mx-auto mb-1 h-4 w-4 text-[#2563EB]" />
                    <div className="text-xs font-medium text-[#1E293B]">{group.destination}</div>
                    <div className="text-xs text-[#94A3B8]">目的地</div>
                  </div>
                  <div className="px-4 text-center">
                    <CalendarDays className="mx-auto mb-1 h-4 w-4 text-[#2563EB]" />
                    <div className="text-xs font-medium text-[#1E293B]">{dayDiff} 天 {dayDiff - 1} 夜</div>
                    <div className="text-xs text-[#94A3B8]">
                      {group.startDate.slice(5).replace("-", "/")}–{group.endDate.slice(5).replace("-", "/")}
                    </div>
                  </div>
                  <div className="pl-4 text-center">
                    <Users className="mx-auto mb-1 h-4 w-4 text-[#2563EB]" />
                    <div className="text-xs font-medium text-[#1E293B]">{group.members.length} / {group.headcount}</div>
                    <div className="text-xs text-[#94A3B8]">已加入</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Member avatars */}
            <div className="mb-5 rounded-2xl bg-white p-5 shadow-card">
              <p className="mb-4 text-sm font-semibold text-[#1E293B]">旅伴成員</p>

              <div className="flex items-center gap-2">
                {/* Existing members */}
                {group.members.map((m) => (
                  <div key={m.id} className="text-center">
                    <Avatar member={m} />
                    <p className="mt-1 text-xs text-[#64748B]">{m.name}</p>
                  </div>
                ))}

                {/* Empty slots */}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div key={`empty-${i}`} className="text-center">
                    <EmptySlot label={`+${i + 1}`} />
                    <p className="mt-1 text-xs text-slate-300">待加入</p>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-xs text-[#94A3B8]">
                由 <span className="font-medium text-[#64748B]">{group.createdBy}</span> 建立 ·
                還有 {emptySlots} 個名額
              </p>
            </div>

            {/* Perks */}
            <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#2563EB]">加入後你可以</p>
              <ul className="space-y-1.5">
                {[
                  "對景點投票，影響最終行程",
                  "即時看到所有人的偏好",
                  "接收行程更新通知",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-[#64748B]">
                    <Check className="h-3.5 w-3.5 shrink-0 text-[#2563EB]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Join Button */}
            <button
              onClick={handleJoin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-4 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-[#1D4ED8] hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  加入中...
                </>
              ) : (
                <>
                  加入旅程
                  <ChevronRight className="h-5 w-5" />
                </>
              )}
            </button>

            <p className="mt-3 text-center text-xs text-[#94A3B8]">
              加入即表示你同意一起規劃這趟旅程 ✨
            </p>
          </>
        )}
      </main>
    </div>
  )
}
