"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, Home, Sparkles, Search, Heart, Settings, LogOut } from "lucide-react"

const NAV_ITEMS = [
  { href: "/dashboard", icon: Home, label: "我的行程" },
  { href: "/ai-plan", icon: Sparkles, label: "AI 規劃" },
  { href: "/explore", icon: Search, label: "探索景點" },
  { href: "/collection", icon: Heart, label: "收藏清單" },
  { href: "/settings", icon: Settings, label: "設定" },
]

export default function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col min-h-screen bg-[#1B4332] text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
          <Compass className="h-4 w-4 text-white" />
        </div>
        <span className="text-base font-semibold tracking-tight">Navigator</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "bg-white/20 text-white"
                  : "text-white/65 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#52B788] text-xs font-bold text-white">
            U
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">使用者</p>
            <p className="text-xs text-white/45 truncate">user@email.com</p>
          </div>
          <button
            className="shrink-0 p-1.5 rounded-lg text-white/45 hover:text-white hover:bg-white/10 transition-all"
            aria-label="登出"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
