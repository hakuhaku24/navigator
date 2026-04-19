"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { X, Hash } from "lucide-react"

export default function JoinModal({ large }: { large?: boolean }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const router = useRouter()

  const handleJoin = () => {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 4) return
    router.push(`/group/${trimmed}/join`)
    setOpen(false)
    setCode("")
  }

  return (
    <>
      {large ? (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#2563EB] bg-white px-8 py-4 text-base font-semibold text-[#2563EB] transition-all hover:bg-blue-50 hover:-translate-y-0.5 sm:w-auto"
        >
          <Hash className="h-4 w-4" />
          輸入邀請碼加入
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#1E293B] transition-colors hover:bg-slate-50"
        >
          加入行程
        </button>
      )}

      {/* Modal Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-modal">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
              <Hash className="h-6 w-6 text-[#2563EB]" />
            </div>

            <h2 className="mb-1 text-xl font-bold text-[#1E293B]">加入旅遊群組</h2>
            <p className="mb-6 text-sm text-[#64748B]">請輸入朋友傳給你的邀請碼</p>

            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="例如：ABC12345"
              maxLength={12}
              className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-xl font-bold uppercase tracking-widest text-[#1E293B] outline-none transition-all placeholder:text-slate-300 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              autoFocus
            />

            <button
              onClick={handleJoin}
              disabled={code.trim().length < 4}
              className="w-full rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white transition-all hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-40"
            >
              確認加入
            </button>
          </div>
        </div>
      )}
    </>
  )
}
