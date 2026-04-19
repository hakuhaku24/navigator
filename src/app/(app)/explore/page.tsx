import { Search } from "lucide-react"

export default function ExplorePage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#D8F3DC]">
        <Search className="h-8 w-8 text-[#1B4332]" />
      </div>
      <h1 className="text-xl font-bold text-[#1E293B]">探索景點</h1>
      <p className="text-sm text-[#64748B] max-w-xs">瀏覽全球熱門景點，找到下一個讓你心動的目的地。即將推出！</p>
    </div>
  )
}
