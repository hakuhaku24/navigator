import { Settings } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#D8F3DC]">
        <Settings className="h-8 w-8 text-[#1B4332]" />
      </div>
      <h1 className="text-xl font-bold text-[#1E293B]">設定</h1>
      <p className="text-sm text-[#64748B] max-w-xs">管理帳號資訊、通知偏好與隱私設定。即將推出！</p>
    </div>
  )
}
