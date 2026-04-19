"use client"

import { useState } from "react"
import { Sparkles, MapPin, Calendar, Tag, Wallet, Wind, ArrowRight, Check } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3

interface PlanForm {
  destination: string
  days: number
  interests: string[]
  budget: "economy" | "mid" | "luxury" | null
  style: "relaxed" | "balanced" | "packed" | null
}

// ── Constants ──────────────────────────────────────────────────────────
const POPULAR_CITIES = ["東京", "首爾", "曼谷", "台北", "大阪", "巴黎", "北海道", "峇里島"]

const INTERESTS = [
  { id: "food",     emoji: "🍜", label: "美食" },
  { id: "culture",  emoji: "🏛", label: "文化" },
  { id: "nature",   emoji: "🌿", label: "自然" },
  { id: "shopping", emoji: "🛍", label: "購物" },
  { id: "nightlife",emoji: "🌙", label: "夜生活" },
  { id: "history",  emoji: "📜", label: "歷史" },
  { id: "adventure",emoji: "🧗", label: "冒險" },
  { id: "relax",    emoji: "☕", label: "放鬆" },
]

const BUDGET_OPTIONS = [
  { id: "economy", label: "經濟實惠", sub: "省錢優先",   icon: "💰" },
  { id: "mid",     label: "適中",     sub: "舒適平衡",   icon: "💳" },
  { id: "luxury",  label: "豪華",     sub: "盡情享受",   icon: "💎" },
] as const

const STYLE_OPTIONS = [
  { id: "relaxed",  label: "悠閒慢遊", sub: "輕鬆自在",   icon: "🌸" },
  { id: "balanced", label: "適中悠爽", sub: "平衡探索",   icon: "⚖️" },
  { id: "packed",   label: "緊湊充實", sub: "高效覽勝",   icon: "⚡" },
] as const

const STEP_INFO = [
  { step: 1, title: "選擇目的地", desc: "告訴 AI 你想去哪裡、或是誰建議我們推薦起點" },
  { step: 2, title: "設定偏好",   desc: "告訴我你偏好哪些旅遊類型，幫我們了解你的旅遊輪廓" },
  { step: 3, title: "生成行程",   desc: "決定天數與預算，AI 將為你規劃最佳化行程" },
]

// ── Step Guide (left panel) ────────────────────────────────────────────
function StepGuide({ current }: { current: Step }) {
  return (
    <div className="hidden md:flex flex-col justify-center gap-6 px-10 py-12">
      <div className="mb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 mb-4">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white">量身打造你的專屬旅程</h2>
        <p className="mt-2 text-sm text-white/60">告訴 AI 你的旅遊偏好，讓智慧系統幫你規劃完美的行程</p>
      </div>
      <div className="space-y-5">
        {STEP_INFO.map(({ step, title, desc }) => {
          const done    = current > step
          const active  = current === step
          return (
            <div key={step} className={`flex gap-4 transition-opacity ${active || done ? "opacity-100" : "opacity-35"}`}>
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all ${
                done   ? "bg-[#52B788] text-white"
                : active ? "bg-white text-[#1B4332]"
                : "bg-white/20 text-white"
              }`}>
                {done ? <Check className="h-4 w-4" /> : `0${step}`}
              </div>
              <div>
                <p className={`text-sm font-semibold ${active ? "text-white" : "text-white/70"}`}>{title}</p>
                {active && <p className="mt-0.5 text-xs text-white/50 leading-relaxed">{desc}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────
export default function AIPlanPage() {
  const [step, setStep] = useState<Step>(1)
  const [generating, setGenerating] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState<PlanForm>({
    destination: "",
    days: 3,
    interests: [],
    budget: null,
    style: null,
  })

  const toggleInterest = (id: string) =>
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(id)
        ? f.interests.filter((i) => i !== id)
        : [...f.interests, id],
    }))

  const canProceed =
    step === 1 ? form.destination.trim().length > 0
    : step === 2 ? form.interests.length > 0
    : form.budget !== null && form.style !== null

  const handleNext = () => {
    if (!canProceed) return
    if (step < 3) { setStep((s) => (s + 1) as Step); return }
    setGenerating(true)
    setTimeout(() => { setGenerating(false); setDone(true) }, 2500)
  }

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#D8F3DC]">
          <Check className="h-10 w-10 text-[#1B4332]" strokeWidth={2.5} />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#1E293B]">行程草稿已生成！</h2>
          <p className="mt-2 text-[#64748B]">AI 已為你的 {form.destination} {form.days} 日之旅規劃完成</p>
        </div>
        <button
          onClick={() => { setDone(false); setStep(1); setForm({ destination: "", days: 3, interests: [], budget: null, style: null }) }}
          className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-[#64748B] hover:bg-slate-50 transition-all"
        >
          重新規劃
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row">
      {/* Left guide panel */}
      <div className="hidden md:flex md:w-64 lg:w-72 shrink-0 bg-[#1B4332]">
        <StepGuide current={step} />
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col px-6 py-8 md:px-10 max-w-2xl mx-auto w-full">
        {/* Mobile progress */}
        <div className="mb-6 md:hidden">
          <div className="flex justify-between text-xs text-[#64748B] mb-1.5">
            <span>步驟 {step} / 3</span><span>{Math.round((step / 3) * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-[#1B4332] transition-all duration-500" style={{ width: `${(step / 3) * 100}%` }} />
          </div>
        </div>

        <div className="mb-2">
          <h1 className="text-xl font-bold text-[#1E293B]">
            {step === 1 ? "你想去哪裡？" : step === 2 ? "你喜歡什麼類型的旅遊？" : "行程詳細設定"}
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            {STEP_INFO[step - 1].desc}
          </p>
        </div>

        <div className="mt-6 flex-1 space-y-6">

          {/* Step 1: Destination */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#1E293B]">
                  <MapPin className="inline h-4 w-4 mr-1 text-[#52B788]" />
                  目的地 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  placeholder="輸入城市、國家或地區..."
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-[#1E293B] outline-none placeholder:text-slate-300 focus:border-[#52B788] focus:ring-2 focus:ring-[#52B788]/20 transition-all"
                  autoFocus
                />
              </div>
              <div>
                <p className="mb-2.5 text-xs font-medium text-[#94A3B8] uppercase tracking-wide">熱門：</p>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_CITIES.map((city) => (
                    <button
                      key={city}
                      onClick={() => setForm((f) => ({ ...f, destination: city }))}
                      className={`rounded-full border px-3.5 py-1.5 text-sm transition-all ${
                        form.destination === city
                          ? "border-[#1B4332] bg-[#1B4332] text-white"
                          : "border-slate-200 bg-white text-[#64748B] hover:border-[#52B788] hover:text-[#1B4332]"
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#1E293B]">
                  <Calendar className="h-4 w-4 text-[#52B788]" />
                  旅遊天數 <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 7].map((d) => (
                    <button
                      key={d}
                      onClick={() => setForm((f) => ({ ...f, days: d }))}
                      className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-all ${
                        form.days === d
                          ? "border-[#1B4332] bg-[#1B4332] text-white shadow-sm"
                          : "border-slate-200 bg-white text-[#64748B] hover:border-[#52B788]"
                      }`}
                    >
                      {d}天
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Interests */}
          {step === 2 && (
            <div>
              <label className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[#1E293B]">
                <Tag className="h-4 w-4 text-[#52B788]" />
                興趣標籤 <span className="text-xs text-[#94A3B8] font-normal ml-1">（可多選）</span>
              </label>
              <div className="grid grid-cols-4 gap-2.5">
                {INTERESTS.map(({ id, emoji, label }) => {
                  const selected = form.interests.includes(id)
                  return (
                    <button
                      key={id}
                      onClick={() => toggleInterest(id)}
                      className={`flex flex-col items-center gap-1.5 rounded-2xl border py-4 text-xs font-medium transition-all ${
                        selected
                          ? "border-[#1B4332] bg-[#1B4332] text-white shadow-sm"
                          : "border-slate-200 bg-white text-[#64748B] hover:border-[#52B788] hover:bg-[#D8F3DC]"
                      }`}
                    >
                      <span className="text-xl">{emoji}</span>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 3: Budget + Style */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <label className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[#1E293B]">
                  <Wallet className="h-4 w-4 text-[#52B788]" />
                  預算範圍 <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {BUDGET_OPTIONS.map(({ id, label, sub, icon }) => (
                    <button
                      key={id}
                      onClick={() => setForm((f) => ({ ...f, budget: id }))}
                      className={`flex flex-col items-center gap-2 rounded-2xl border py-5 text-sm font-medium transition-all ${
                        form.budget === id
                          ? "border-[#1B4332] bg-[#1B4332] text-white shadow-sm"
                          : "border-slate-200 bg-white text-[#64748B] hover:border-[#52B788]"
                      }`}
                    >
                      <span className="text-2xl">{icon}</span>
                      <span className="font-semibold">{label}</span>
                      <span className={`text-xs ${form.budget === id ? "text-white/70" : "text-[#94A3B8]"}`}>{sub}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[#1E293B]">
                  <Wind className="h-4 w-4 text-[#52B788]" />
                  旅遊風格 <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {STYLE_OPTIONS.map(({ id, label, sub, icon }) => (
                    <button
                      key={id}
                      onClick={() => setForm((f) => ({ ...f, style: id }))}
                      className={`flex flex-col items-center gap-2 rounded-2xl border py-5 text-sm font-medium transition-all ${
                        form.style === id
                          ? "border-[#1B4332] bg-[#1B4332] text-white shadow-sm"
                          : "border-slate-200 bg-white text-[#64748B] hover:border-[#52B788]"
                      }`}
                    >
                      <span className="text-2xl">{icon}</span>
                      <span className="font-semibold">{label}</span>
                      <span className={`text-xs ${form.style === id ? "text-white/70" : "text-[#94A3B8]"}`}>{sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="mt-8 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-[#64748B] transition-all hover:bg-slate-50"
            >
              上一步
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canProceed || generating}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1B4332] py-3 text-sm font-semibold text-white transition-all hover:bg-[#2D6A4F] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                AI 規劃中...
              </>
            ) : step === 3 ? (
              <>
                <Sparkles className="h-4 w-4" />
                開始 AI 規劃行程
              </>
            ) : (
              <>
                下一步
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
