"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Sparkles, Search, Heart, Settings } from "lucide-react"

const NAV_ITEMS = [
  { href: "/dashboard", icon: Home, label: "行程" },
  { href: "/ai-plan", icon: Sparkles, label: "AI規劃" },
  { href: "/explore", icon: Search, label: "探索" },
  { href: "/collection", icon: Heart, label: "收藏" },
  { href: "/settings", icon: Settings, label: "設定" },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex md:hidden bg-white border-t border-slate-100">
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || pathname.startsWith(href + "/")
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 pb-safe pt-2 pb-2 text-[10px] transition-colors min-h-[56px] justify-center ${
              active ? "text-[#1B4332]" : "text-[#94A3B8]"
            }`}
          >
            <Icon className={`h-5 w-5 ${active ? "stroke-[2]" : "stroke-[1.5]"}`} />
            <span className={active ? "font-semibold" : ""}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
