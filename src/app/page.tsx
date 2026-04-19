import Link from "next/link"
import { MapPin, Users, CloudSun, ShieldCheck, ArrowRight, Compass } from "lucide-react"
import JoinModal from "@/components/JoinModal"

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA]">
      {/* ── Navbar ── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB]">
              <Compass className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold text-[#1E293B]">Navigator</span>
          </div>
          <nav className="flex items-center gap-3">
            <JoinModal />
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-[#1E293B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
            >
              Dashboard
            </Link>
            <Link
              href="/group/new"
              className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8]"
            >
              建立行程
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden pt-16">
        {/* Background gradient blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 20% 40%, rgba(37,99,235,0.08) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 80% 70%, rgba(249,115,22,0.08) 0%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5 text-sm font-medium text-[#2563EB]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2563EB] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2563EB]" />
            </span>
            AI 旅遊決策引擎，現已開放
          </div>

          {/* Headline */}
          <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight text-[#1E293B] md:text-6xl lg:text-7xl">
            多人旅遊，
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #2563EB 0%, #3B82F6 50%, #F97316 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              不再吵架
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-[#64748B]">
            智慧蒐集每位成員的偏好，用投票機制找出大家都滿意的行程——
            從景點、餐廳到住宿，一鍵搞定。
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/group/new"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-[#1D4ED8] hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5 sm:w-auto"
            >
              建立行程
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/dashboard"
              className="group flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-8 py-4 text-base font-semibold text-[#1E293B] transition-all hover:border-[#2563EB] hover:text-[#2563EB] hover:-translate-y-0.5 sm:w-auto"
            >
              進入 Dashboard
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <JoinModal large />
          </div>

          {/* Social proof */}
          <p className="mt-8 text-sm text-[#94A3B8]">
            已有 <span className="font-semibold text-[#64748B]">1,200+</span> 個旅遊群組使用
          </p>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="flex h-6 w-4 items-start justify-center rounded-full border-2 border-[#CBD5E1] pt-1">
            <div className="h-1.5 w-0.5 rounded-full bg-[#CBD5E1]" />
          </div>
        </div>
      </section>

      {/* ── Feature Cards ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-14 text-center">
          <h2 className="mb-3 text-3xl font-bold text-[#1E293B]">為什麼選擇 Navigator？</h2>
          <p className="text-[#64748B]">三大核心功能，解決群組出遊最頭痛的問題</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Card 1 */}
          <div className="group relative overflow-hidden rounded-2xl bg-white p-8 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
              <Users className="h-6 w-6 text-[#2563EB]" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-[#1E293B]">多人決策引擎</h3>
            <p className="text-sm leading-relaxed text-[#64748B]">
              每位成員滑動投票，AI 即時計算最大公約數，找出所有人都能接受的行程。
            </p>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(circle at 70% 30%, rgba(37,99,235,0.04) 0%, transparent 60%)",
              }}
            />
          </div>

          {/* Card 2 */}
          <div className="group relative overflow-hidden rounded-2xl bg-white p-8 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50">
              <CloudSun className="h-6 w-6 text-[#F97316]" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-[#1E293B]">即時天氣應變</h3>
            <p className="text-sm leading-relaxed text-[#64748B]">
              整合即時天氣預報，遇到下雨自動推薦室內備選方案，行程不因天氣泡湯。
            </p>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(circle at 70% 30%, rgba(249,115,22,0.04) 0%, transparent 60%)",
              }}
            />
          </div>

          {/* Card 3 */}
          <div className="group relative overflow-hidden rounded-2xl bg-white p-8 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
              <ShieldCheck className="h-6 w-6 text-emerald-500" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-[#1E293B]">景點品質保證</h3>
            <p className="text-sm leading-relaxed text-[#64748B]">
              從 Reels、Google Maps 自動抓取真實評價，過濾踩雷景點，只推薦值得去的地方。
            </p>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(circle at 70% 30%, rgba(16,185,129,0.04) 0%, transparent 60%)",
              }}
            />
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div
          className="relative overflow-hidden rounded-3xl px-10 py-16 text-center"
          style={{
            background: "linear-gradient(135deg, #1D4ED8 0%, #2563EB 50%, #3B82F6 100%)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 60% 80% at 80% 20%, rgba(255,255,255,0.08) 0%, transparent 60%)",
            }}
          />
          <MapPin className="mx-auto mb-4 h-10 w-10 text-white/60" />
          <h2 className="mb-3 text-3xl font-bold text-white">準備好了嗎？</h2>
          <p className="mb-8 text-blue-100">建立你的第一個旅遊群組，讓所有人都期待這趟旅程</p>
          <Link
            href="/group/new"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-[#2563EB] shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5"
          >
            立即建立行程
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-100 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 text-center sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#2563EB]">
              <Compass className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-semibold text-[#1E293B]">Navigator</span>
          </div>
          <p className="text-sm text-[#94A3B8]">© 2026 Navigator. 讓每趟旅程都值得。</p>
        </div>
      </footer>
    </div>
  )
}
