"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Compass,
  ChevronRight,
  ChevronLeft,
  Check,
  Copy,
  ArrowRight,
  Minus,
  Plus,
  CalendarDays,
  Users,
  MapPin,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────
type Destination = "northeast" | "north" | "yangming" | null

interface FormData {
  name: string
  destination: Destination
  startDate: string
  endDate: string
  headcount: number
}

// ── Step components ────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between text-sm text-[#64748B]">
        <span>步驟 {step} / {total}</span>
        <span>{Math.round((step / total) * 100)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#2563EB] transition-all duration-500 ease-out"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
      <div className="mt-4 flex gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all ${
              i + 1 < step
                ? "bg-[#2563EB] text-white"
                : i + 1 === step
                ? "border-2 border-[#2563EB] bg-white text-[#2563EB]"
                : "border-2 border-slate-200 bg-white text-slate-300"
            }`}
          >
            {i + 1 < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Destination cards data ─────────────────────────────
const DESTINATIONS = [
  {
    id: "northeast" as const,
    emoji: "🌊",
    name: "東北海岸",
    desc: "礁石海岸與湛藍太平洋，適合喜歡自然景觀的旅人",
    tags: ["福隆沙灘", "鼻頭角", "龍洞攀岩"],
    color: "from-cyan-400 to-blue-500",
    lightBg: "bg-cyan-50",
    badge: "自然 · 海景",
  },
  {
    id: "north" as const,
    emoji: "🏖️",
    name: "北海岸",
    desc: "奇岩地質與燈塔白沙，台灣最壯觀的海岸線",
    tags: ["野柳地質", "白沙灣", "富貴角燈塔"],
    color: "from-emerald-400 to-teal-500",
    lightBg: "bg-emerald-50",
    badge: "地質 · 海岸",
  },
  {
    id: "yangming" as const,
    emoji: "🌸",
    name: "陽明山",
    desc: "火山地形、芒草與花季，台北近郊的山林秘境",
    tags: ["竹子湖", "擎天崗", "七星山"],
    color: "from-purple-400 to-pink-400",
    lightBg: "bg-purple-50",
    badge: "山林 · 生態",
  },
]

// ── Generate invite code ───────────────────────────────
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

// ── Main Page ──────────────────────────────────────────
export default function NewGroupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [copied, setCopied] = useState(false)
  const [inviteCode] = useState(generateInviteCode)
  const [groupId] = useState(() => Math.random().toString(36).slice(2, 10))

  const [form, setForm] = useState<FormData>({
    name: "",
    destination: null,
    startDate: "",
    endDate: "",
    headcount: 4,
  })

  const TOTAL_STEPS = 3

  const canNext =
    step === 1
      ? form.name.trim().length >= 2
      : step === 2
      ? form.destination !== null
      : form.startDate !== "" && form.endDate !== ""

  const handleNext = () => {
    if (!canNext) return
    if (step < TOTAL_STEPS) setStep((s) => s + 1)
    else setStep(4) // completion
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const selectedDest = DESTINATIONS.find((d) => d.id === form.destination)

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
      {/* Navbar */}
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB]">
              <Compass className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold text-[#1E293B]">Navigator</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
        {/* ── Completion Screen ── */}
        {step === 4 ? (
          <div className="text-center">
            {/* Success icon */}
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2563EB]">
                <Check className="h-7 w-7 text-white" strokeWidth={3} />
              </div>
            </div>

            <h1 className="mb-2 text-2xl font-bold text-[#1E293B]">群組建立成功！</h1>
            <p className="mb-8 text-[#64748B]">
              把邀請碼傳給你的旅伴，讓大家一起加入
            </p>

            {/* Group summary */}
            <div className="mb-8 rounded-2xl border border-slate-100 bg-white p-6 text-left shadow-card">
              <div className="mb-4 flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-xl ${selectedDest?.color ?? "from-blue-400 to-blue-600"}`}
                >
                  {selectedDest?.emoji ?? "✈️"}
                </div>
                <div>
                  <p className="font-semibold text-[#1E293B]">{form.name}</p>
                  <p className="text-sm text-[#64748B]">{selectedDest?.name} · {form.headcount} 人</p>
                </div>
              </div>
              <div className="flex gap-4 text-sm text-[#64748B]">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-4 w-4" />
                  {form.startDate} → {form.endDate}
                </span>
              </div>
            </div>

            {/* Invite code */}
            <div className="mb-6 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 p-6">
              <p className="mb-2 text-sm font-medium text-[#64748B]">邀請碼</p>
              <div className="mb-4 flex items-center justify-center gap-3">
                <span className="font-mono text-4xl font-bold tracking-[0.3em] text-[#2563EB]">
                  {inviteCode}
                </span>
              </div>
              <button
                onClick={handleCopy}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                  copied
                    ? "bg-emerald-500 text-white"
                    : "bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    已複製！
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    複製邀請碼
                  </>
                )}
              </button>
            </div>

            <button
              onClick={() => router.push(`/group/${groupId}/join`)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E293B] py-3.5 text-sm font-semibold text-white transition-all hover:bg-[#0F172A]"
            >
              前往行程頁面
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            {/* Step header */}
            <div className="mb-2">
              <h1 className="text-2xl font-bold text-[#1E293B]">建立旅遊群組</h1>
              <p className="mt-1 text-sm text-[#64748B]">幾個步驟，快速設定你的旅程</p>
            </div>

            <StepIndicator step={step} total={TOTAL_STEPS} />

            {/* ── Step 1: Group Name ── */}
            {step === 1 && (
              <div>
                <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-8 shadow-card">
                  <h2 className="mb-1 text-lg font-semibold text-[#1E293B]">幫你的群組取個名字</h2>
                  <p className="mb-6 text-sm text-[#64748B]">讓旅伴一眼就知道是哪個行程</p>

                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="例如：2026 北海岸閃電行"
                    maxLength={40}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3.5 text-base text-[#1E293B] outline-none transition-all placeholder:text-slate-300 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleNext()}
                  />
                  <div className="mt-2 flex justify-end">
                    <span className="text-xs text-[#94A3B8]">{form.name.length} / 40</span>
                  </div>
                </div>

                {/* Suggestions */}
                <div className="mb-6">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#94A3B8]">快速選擇</p>
                  <div className="flex flex-wrap gap-2">
                    {["2026 夏日海岸行", "周末陽明山健行", "北海岸一日遊", "四人浪漫小旅行"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setForm((f) => ({ ...f, name: s }))}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-[#64748B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: Destination ── */}
            {step === 2 && (
              <div className="mb-6">
                <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
                  <h2 className="mb-1 text-lg font-semibold text-[#1E293B]">選擇旅遊圈</h2>
                  <p className="text-sm text-[#64748B]">選一個出發方向，後續可以再細調景點</p>
                </div>

                <div className="flex flex-col gap-4">
                  {DESTINATIONS.map((dest) => {
                    const selected = form.destination === dest.id
                    return (
                      <button
                        key={dest.id}
                        onClick={() => setForm((f) => ({ ...f, destination: dest.id }))}
                        className={`relative overflow-hidden rounded-2xl border-2 bg-white p-6 text-left transition-all duration-200 ${
                          selected
                            ? "border-[#2563EB] shadow-lg shadow-blue-500/15"
                            : "border-transparent shadow-card hover:border-slate-200 hover:shadow-card-hover"
                        }`}
                      >
                        {/* Selected check */}
                        {selected && (
                          <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-[#2563EB]">
                            <Check className="h-3.5 w-3.5 text-white" />
                          </div>
                        )}

                        <div className="flex items-start gap-4">
                          {/* Emoji circle */}
                          <div
                            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl ${dest.color}`}
                          >
                            {dest.emoji}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="font-semibold text-[#1E293B]">{dest.name}</span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${dest.lightBg} text-[#64748B]`}>
                                {dest.badge}
                              </span>
                            </div>
                            <p className="mb-3 text-sm leading-relaxed text-[#64748B]">{dest.desc}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {dest.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-[#64748B]"
                                >
                                  <MapPin className="h-3 w-3" />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Step 3: Date + Headcount ── */}
            {step === 3 && (
              <div className="flex flex-col gap-4">
                {/* Date inputs */}
                <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
                  <div className="mb-4 flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-[#2563EB]" />
                    <h2 className="font-semibold text-[#1E293B]">出遊日期</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[#64748B]">出發日</label>
                      <input
                        type="date"
                        value={form.startDate}
                        onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1E293B] outline-none transition-all focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[#64748B]">回程日</label>
                      <input
                        type="date"
                        value={form.endDate}
                        min={form.startDate}
                        onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1E293B] outline-none transition-all focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                      />
                    </div>
                  </div>
                </div>

                {/* Headcount */}
                <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
                  <div className="mb-5 flex items-center gap-2">
                    <Users className="h-5 w-5 text-[#2563EB]" />
                    <h2 className="font-semibold text-[#1E293B]">預計人數</h2>
                  </div>
                  <div className="flex items-center justify-center gap-6">
                    <button
                      onClick={() => setForm((f) => ({ ...f, headcount: Math.max(2, f.headcount - 1) }))}
                      disabled={form.headcount <= 2}
                      className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-200 text-slate-400 transition-all hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-30"
                    >
                      <Minus className="h-5 w-5" />
                    </button>

                    <div className="text-center">
                      <div className="text-6xl font-bold text-[#1E293B] leading-none">{form.headcount}</div>
                      <div className="mt-1 text-sm text-[#64748B]">人</div>
                    </div>

                    <button
                      onClick={() => setForm((f) => ({ ...f, headcount: Math.min(6, f.headcount + 1) }))}
                      disabled={form.headcount >= 6}
                      className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-200 text-slate-400 transition-all hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-30"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Number buttons */}
                  <div className="mt-5 flex justify-center gap-2">
                    {[2, 3, 4, 5, 6].map((n) => (
                      <button
                        key={n}
                        onClick={() => setForm((f) => ({ ...f, headcount: n }))}
                        className={`h-9 w-9 rounded-lg text-sm font-semibold transition-all ${
                          form.headcount === n
                            ? "bg-[#2563EB] text-white shadow-md shadow-blue-500/30"
                            : "bg-slate-100 text-[#64748B] hover:bg-slate-200"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Navigation Buttons ── */}
            <div className="mt-6 flex gap-3">
              {step > 1 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-[#64748B] transition-all hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一步
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={!canNext}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white transition-all hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {step === TOTAL_STEPS ? "建立群組" : "下一步"}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
