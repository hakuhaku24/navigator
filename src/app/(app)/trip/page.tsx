"use client"

// 底部導覽／側欄「行程」的落點：有已建立的行程就直接看，沒有才進組成行程頁。
// 沒有這層，每次點導覽都會回到 /trip/build 重新開始（行程名稱、已儲存狀態都不會保留）。

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getLastTripId, loadDraft } from "@/lib/draft-itinerary"

export default function TripEntryPage() {
  const router = useRouter()

  useEffect(() => {
    const lastTripId = getLastTripId()
    if (lastTripId && loadDraft(lastTripId)) {
      router.replace(`/trip/${lastTripId}`)
    } else {
      router.replace("/trip/build")
    }
  }, [router])

  return (
    <div className="flex-1 flex items-center justify-center min-h-screen bg-[#faf9f5]">
      <div className="h-6 w-6 rounded-full border-2 border-slate-200 border-t-[#1B4332] animate-spin" />
    </div>
  )
}
