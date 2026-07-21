import Link from "next/link"
import { MapPin, Layers, CloudSun, ShieldCheck, ArrowRight, Compass } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#faf9f5]">
      {/* ── Navbar ── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1B4332]">
              <Compass className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold text-[#1E293B]">Navigator</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="/explore"
              className="whitespace-nowrap rounded-lg bg-[#1B4332] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2D6A4F]"
            >
              探索景點
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
              "radial-gradient(ellipse 70% 50% at 20% 40%, rgba(82,183,136,0.10) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 80% 70%, rgba(217,119,6,0.06) 0%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#B7E4C7] bg-[#D8F3DC]/60 px-4 py-1.5 text-sm font-medium text-[#2D6A4F]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#52B788] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#52B788]" />
            </span>
            AI 旅遊決策引擎，現已開放
          </div>

          {/* Headline */}
          <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight text-[#1E293B] md:text-6xl lg:text-7xl">
            景點資訊，
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #1B4332 0%, #2D6A4F 45%, #52B788 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              不再靠賭
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-[#64748B]">
            每個景點都經多來源交叉驗證、標示可信度——
            行程遇到天氣突發狀況，AI 立即推薦備選方案。
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/explore"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#1B4332] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[#1B4332]/25 transition-all hover:bg-[#2D6A4F] hover:shadow-xl hover:shadow-[#1B4332]/30 hover:-translate-y-0.5 sm:w-auto"
            >
              開始探索景點
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          {/* Social proof */}
          <p className="mt-8 text-sm text-[#94A3B8]">
            已有 <span className="font-semibold text-[#64748B]">45+</span> 個三源驗證景點
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
          <p className="text-[#64748B]">三大核心功能，解決旅遊規劃最頭痛的問題</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Card 1 */}
          <div className="group relative overflow-hidden rounded-2xl bg-white p-8 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#D8F3DC]">
              <Layers className="h-6 w-6 text-[#2D6A4F]" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-[#1E293B]">分級韌性設計</h3>
            <p className="text-sm leading-relaxed text-[#64748B]">
              每個景點標示 L0–L3 等級，非去不可的行程原地不動，其餘依情況彈性調整。
            </p>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(circle at 70% 30%, rgba(82,183,136,0.06) 0%, transparent 60%)",
              }}
            />
          </div>

          {/* Card 2 */}
          <div className="group relative overflow-hidden rounded-2xl bg-white p-8 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
              <CloudSun className="h-6 w-6 text-[#D97706]" />
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
                  "radial-gradient(circle at 70% 30%, rgba(217,119,6,0.05) 0%, transparent 60%)",
              }}
            />
          </div>

          {/* Card 3 */}
          <div className="group relative overflow-hidden rounded-2xl bg-white p-8 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50">
              <ShieldCheck className="h-6 w-6 text-[#0891B2]" />
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
                  "radial-gradient(circle at 70% 30%, rgba(8,145,178,0.05) 0%, transparent 60%)",
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
            background: "linear-gradient(135deg, #1B4332 0%, #2D6A4F 60%, #40916C 100%)",
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
          <p className="mb-8 text-[#D8F3DC]">從驗證景點庫開始，規劃一趟值得信任的旅程</p>
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-[#1B4332] shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5"
          >
            立即探索景點
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-100 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 text-center sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#1B4332]">
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
