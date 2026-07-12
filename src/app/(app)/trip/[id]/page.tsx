"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ChevronRight, Plus, MapPin, Clock, GripVertical, Navigation2, List, Vote, BarChart2, CloudRain, LayoutGrid, Sparkles } from "lucide-react"
import PoiArt from "@/components/PoiArt"
import DayRouteMap from "@/components/day-route-map"
import { loadDraft, type DraftDay as Day, type DraftItinerary } from "@/lib/draft-itinerary"

// ── Types ──────────────────────────────────────────────────────────────
type Level = 0 | 1 | 2 | 3
type Tab = "timeline" | "map" | "list"

// ── Mock Data ──────────────────────────────────────────────────────────
const MOCK_DAYS: Day[] = [
  {
    dayNum: 1, date: "5月10日",
    pois: [
      { id: "p1", name: "仲見世街", address: "東京都台東區淺草1-41", description: "日本最古老的商業街，購買人形燒與紀念品", level: 1, imageSeed: "nakamise-tokyo", lat: 35.7118, lng: 139.7966, stayMinutes: 60, travelToNext: { mode: "walk", minutes: 16 } },
      { id: "p2", name: "晴空塔", address: "東京都墨田區押上1-1-2", description: "東京地標，450公尺觀景台俯瞰全市", level: 1, imageSeed: "tokyo-skytree", lat: 35.7101, lng: 139.8107, stayMinutes: 90, travelToNext: { mode: "walk", minutes: 5 } },
      { id: "p3", name: "押上商圈", address: "東京都墨田區押上", description: "晴空塔下美食街，晚餐選擇多元", level: 2, imageSeed: "oshiage-market", lat: 35.7106, lng: 139.8129, stayMinutes: 60, travelToNext: { mode: "walk", minutes: 19 } },
      { id: "p4", name: "淺草寺", address: "東京都台東區淺草2-3-1", description: "東京最古老的佛教寺廟，雷門必拍照", level: 1, imageSeed: "sensoji-temple", lat: 35.7148, lng: 139.7967, stayMinutes: 60 },
    ],
  },
  {
    dayNum: 2, date: "5月11日",
    pois: [
      { id: "p5", name: "上野公園", address: "東京都台東區上野公園", description: "東京最大的公園，美術館與動物園聚集地", level: 2, imageSeed: "ueno-park", lat: 35.7156, lng: 139.7745, stayMinutes: 120, travelToNext: { mode: "transit", minutes: 20 } },
      { id: "p6", name: "秋葉原電器街", address: "東京都千代田區外神田", description: "動漫與電器聖地，從扭蛋到最新3C都有", level: 2, imageSeed: "akihabara-japan", lat: 35.7022, lng: 139.7741, stayMinutes: 90, travelToNext: { mode: "transit", minutes: 15 } },
      { id: "p7", name: "東京車站", address: "東京都千代田區丸之內1-9-1", description: "百年歷史紅磚車站，建築本身就是景點", level: 1, imageSeed: "tokyo-station", lat: 35.6812, lng: 139.7671, stayMinutes: 45, travelToNext: { mode: "walk", minutes: 10 } },
      { id: "p8", name: "銀座逛街", address: "東京都中央區銀座", description: "日本最頂級購物區，Hermès、Chanel旗艦店", level: 3, imageSeed: "ginza-tokyo", lat: 35.6717, lng: 139.7650, stayMinutes: 120 },
    ],
  },
  {
    dayNum: 3, date: "5月12日",
    pois: [
      { id: "p9", name: "新宿御苑", address: "東京都新宿區內藤町11", description: "都市中心的廣大日式庭園，四季景色各異", level: 2, imageSeed: "shinjuku-gyoen", lat: 35.6852, lng: 139.7100, stayMinutes: 90, travelToNext: { mode: "walk", minutes: 8 } },
      { id: "p10", name: "歌舞伎町", address: "東京都新宿區歌舞伎町", description: "東京不夜城，餐廳、娛樂場所林立", level: 2, imageSeed: "kabukicho-shinjuku", lat: 35.6949, lng: 139.7029, stayMinutes: 120, travelToNext: { mode: "transit", minutes: 12 } },
      { id: "p11", name: "澀谷忠犬廣場", address: "東京都澀谷區道玄坂2", description: "澀谷地標，八公狗銅像必拍打卡景點", level: 1, imageSeed: "shibuya-crossing", lat: 35.6590, lng: 139.7005, stayMinutes: 45, travelToNext: { mode: "walk", minutes: 5 } },
      { id: "p12", name: "澀谷Scramble廣場", address: "東京都澀谷區澀谷2-24-12", description: "澀谷最新地標，頂樓Sky Stage視野絕佳", level: 2, imageSeed: "shibuya-scramble", lat: 35.6584, lng: 139.7023, stayMinutes: 60 },
    ],
  },
  {
    dayNum: 4, date: "5月13日",
    pois: [
      { id: "p13", name: "明治神宮", address: "東京都澀谷區代代木神園町1-1", description: "供奉明治天皇的神社，森林步道十分靜謐", level: 1, imageSeed: "meiji-shrine", lat: 35.6764, lng: 139.6993, stayMinutes: 90, travelToNext: { mode: "walk", minutes: 5 } },
      { id: "p14", name: "原宿竹下通", address: "東京都澀谷區神宮前1-17-5", description: "年輕文化發源地，棉花糖可麗餅聖地", level: 2, imageSeed: "takeshita-street", lat: 35.6716, lng: 139.7031, stayMinutes: 60, travelToNext: { mode: "transit", minutes: 18 } },
      { id: "p15", name: "台場海濱公園", address: "東京都港區台場1-4", description: "可遠眺彩虹橋與自由女神像，夜景一流", level: 2, imageSeed: "odaiba-tokyo", lat: 35.6300, lng: 139.7736, stayMinutes: 90, travelToNext: { mode: "walk", minutes: 10 } },
      { id: "p16", name: "teamLab Borderless", address: "東京都江東區青海1-3-8", description: "沉浸式數位藝術展，打卡必去體驗", level: 1, imageSeed: "teamlab-digital-art", lat: 35.6263, lng: 139.7838, stayMinutes: 120 },
    ],
  },
  {
    dayNum: 5, date: "5月14日",
    pois: [
      { id: "p17", name: "築地場外市場", address: "東京都中央區築地4-16-2", description: "新鮮海鮮丼與玉子燒早餐，旅遊收尾最佳", level: 1, imageSeed: "tsukiji-market", lat: 35.6654, lng: 139.7707, stayMinutes: 90, travelToNext: { mode: "transit", minutes: 20 } },
      { id: "p18", name: "皇居外苑", address: "東京都千代田區皇居外苑1-1", description: "護城河環繞的二重橋，都市中的歷史遺跡", level: 2, imageSeed: "imperial-palace-tokyo", lat: 35.6825, lng: 139.7576, stayMinutes: 60, travelToNext: { mode: "transit", minutes: 10 } },
      { id: "p19", name: "羽田機場", address: "東京都大田區羽田空港", description: "搭機返台，結束東京之旅", level: 0, imageSeed: "haneda-airport", lat: 35.5494, lng: 139.7798, stayMinutes: 120 },
    ],
  },
]

// ── Level config ───────────────────────────────────────────────────────
const LEVEL_CONFIG: Record<Level, { color: string; label: string }> = {
  0: { color: "bg-red-500",    label: "L0" },
  1: { color: "bg-orange-400", label: "L1" },
  2: { color: "bg-yellow-400", label: "L2" },
  3: { color: "bg-slate-400",  label: "L3" },
}

// ── Travel connector ───────────────────────────────────────────────────
function TravelConnector({ mode, minutes }: { mode: "walk" | "transit"; minutes: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 my-1">
      <div className="h-px flex-1 bg-slate-200" />
      <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-[#64748B]">
        <Navigation2 className="h-3 w-3" />
        {mode === "walk" ? "步行" : "車程"} {minutes} 分鐘
      </div>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  )
}

// ── Timeline Tab ───────────────────────────────────────────────────────
function TimelineTab({ day }: { day: Day }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1B4332] text-sm font-bold text-white">
          {day.dayNum}
        </div>
        <div>
          <span className="font-semibold text-[#1E293B]">Day {day.dayNum}</span>
          <span className="ml-2 text-sm text-[#64748B]">{day.date}</span>
        </div>
      </div>

      <div className="space-y-0">
        {day.pois.map((poi, idx) => (
          <div key={poi.id}>
            <div className="flex gap-3 rounded-2xl bg-white p-4 shadow-card">
              {/* Drag handle */}
              <div className="flex items-center text-slate-300 cursor-grab active:cursor-grabbing mt-1">
                <GripVertical className="h-4 w-4" />
              </div>

              {/* Thumbnail */}
              <PoiArt
                text={poi.name}
                seed={poi.imageSeed}
                className="h-16 w-16 shrink-0 rounded-xl"
                emojiClassName="text-2xl"
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${LEVEL_CONFIG[poi.level].color}`} />
                  <h4 className="font-semibold text-[#1E293B] truncate">{poi.name}</h4>
                  <span className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${LEVEL_CONFIG[poi.level].color}`}>
                    {LEVEL_CONFIG[poi.level].label}
                  </span>
                </div>
                <p className="mb-1 flex items-center gap-1 text-xs text-[#94A3B8]">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{poi.address}</span>
                </p>
                <p className="text-xs text-[#64748B] line-clamp-1">{poi.description}</p>
                <div className="mt-1.5 flex items-center gap-1 text-xs text-[#94A3B8]">
                  <Clock className="h-3 w-3" />
                  <span>停留約 {poi.stayMinutes >= 60 ? `${poi.stayMinutes / 60}小時` : `${poi.stayMinutes}分鐘`}</span>
                </div>
              </div>
            </div>

            {poi.travelToNext && idx < day.pois.length - 1 && (
              <TravelConnector mode={poi.travelToNext.mode} minutes={poi.travelToNext.minutes} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Map Tab ────────────────────────────────────────────────────────────
function MapTab({ day }: { day: Day }) {
  return (
    <div className="space-y-3">
      <DayRouteMap pois={day.pois} />
      <div className="flex flex-wrap gap-2">
        {day.pois.map((poi, i) => (
          <div key={poi.id} className="flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-[#1E293B] shadow-sm">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1B4332] text-[10px] font-bold text-white">
              {i + 1}
            </span>
            {poi.name}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── List Tab ───────────────────────────────────────────────────────────
function ListTab({ days }: { days: Day[] }) {
  return (
    <div className="space-y-6">
      {days.map((day) => (
        <div key={day.dayNum}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#64748B]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1B4332] text-[10px] font-bold text-white">
              {day.dayNum}
            </span>
            Day {day.dayNum} · {day.date}
          </h3>
          <div className="space-y-2">
            {day.pois.map((poi) => (
              <div key={poi.id} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-card">
                <PoiArt
                  text={poi.name}
                  seed={poi.imageSeed}
                  className="h-10 w-10 shrink-0 rounded-lg"
                  emojiClassName="text-base"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[#1E293B] truncate text-sm">{poi.name}</p>
                  <p className="text-xs text-[#94A3B8] truncate">{poi.address}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${LEVEL_CONFIG[poi.level].color}`}>
                  {LEVEL_CONFIG[poi.level].label}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────
export default function TripDetailPage() {
  const params = useParams()
  const tripId = params.id as string

  const [activeTab, setActiveTab] = useState<Tab>("timeline")
  const [activeDay, setActiveDay] = useState(0)
  const [draft, setDraft] = useState<DraftItinerary | null>(null)

  // 優先讀投票結果生成的草稿；沒有草稿才 fallback 到 demo 用的東京 mock
  useEffect(() => {
    setDraft(loadDraft(tripId))
    setActiveDay(0)
  }, [tripId])

  const days = draft?.days?.length ? draft.days : MOCK_DAYS
  const safeDay = Math.min(activeDay, days.length - 1)

  const trip = draft
    ? {
        name: draft.tripName,
        destination: draft.destination,
        days: days.length,
        poiCount: days.reduce((acc, d) => acc + d.pois.length, 0),
      }
    : {
        name: "東京經典5日遊",
        destination: "東京都台東",
        days: MOCK_DAYS.length,
        poiCount: MOCK_DAYS.reduce((acc, d) => acc + d.pois.length, 0),
      }

  const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "timeline", label: "時間軸", icon: <Clock className="h-4 w-4" /> },
    { key: "map",      label: "地圖",   icon: <MapPin className="h-4 w-4" /> },
    { key: "list",     label: "景點列表", icon: <List className="h-4 w-4" /> },
  ]

  return (
    <div className="flex-1 px-4 py-6 md:px-8 max-w-4xl mx-auto w-full">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1 text-sm text-[#64748B]">
        <Link href="/dashboard" className="hover:text-[#1B4332] transition-colors">
          我的行程
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-[#1E293B] font-medium">{trip.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B] md:text-3xl">{trip.name}</h1>
          <p className="mt-1 text-sm text-[#52B788] font-medium">
            {trip.destination} · {trip.days} 天 · {trip.poiCount} 個景點
          </p>
          {draft && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#D8F3DC] px-2.5 py-1 text-[11px] font-semibold text-[#1B4332]">
              <Sparkles className="h-3 w-3" />
              草稿行程 · 由投票結果生成
            </span>
          )}
        </div>
        <button className="flex items-center gap-2 self-start rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#2D6A4F]">
          <Plus className="h-4 w-4" />
          新增景點
        </button>
      </div>

      {/* Action buttons */}
      <div className="mb-6 grid grid-cols-4 gap-2">
        <Link
          href={`/trip/${tripId}/explore`}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#52B788] hover:shadow-md group"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D8F3DC] group-hover:bg-[#1B4332] transition-colors">
            <LayoutGrid className="h-4 w-4 text-[#1B4332] group-hover:text-white transition-colors" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[#1E293B]">格狀篩選</p>
            <p className="text-[9px] text-[#94A3B8] mt-0.5">快速過濾</p>
          </div>
        </Link>

        <Link
          href={`/trip/${tripId}/vote`}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#52B788] hover:shadow-md group"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D8F3DC] group-hover:bg-[#1B4332] transition-colors">
            <Vote className="h-4 w-4 text-[#1B4332] group-hover:text-white transition-colors" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[#1E293B]">開始投票</p>
            <p className="text-[9px] text-[#94A3B8] mt-0.5">Swipe 選景點</p>
          </div>
        </Link>

        <Link
          href={`/trip/${tripId}/results`}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#52B788] hover:shadow-md group"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 group-hover:bg-amber-500 transition-colors">
            <BarChart2 className="h-4 w-4 text-amber-500 group-hover:text-white transition-colors" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[#1E293B]">查看結果</p>
            <p className="text-[9px] text-[#94A3B8] mt-0.5">投票排行榜</p>
          </div>
        </Link>

        <Link
          href={`/trip/${tripId}/weather`}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md group"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 group-hover:bg-amber-400 transition-colors">
            <CloudRain className="h-4 w-4 text-amber-500 group-hover:text-white transition-colors" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[#1E293B]">天氣應變</p>
            <p className="text-[9px] text-[#94A3B8] mt-0.5">智能備案</p>
          </div>
        </Link>
      </div>

      {/* Map shortcut banner */}
      <Link
        href={`/trip/${tripId}/map`}
        className="mb-6 flex items-center gap-3 rounded-2xl bg-[#1B4332] px-4 py-3 text-white shadow-md transition-all hover:bg-[#2D6A4F] hover:-translate-y-0.5"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <MapPin className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">景點地圖</p>
          <p className="text-xs text-[#52B788]">45 個三源驗證景點 · 探索 + 路線預覽</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
      </Link>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              activeTab === key
                ? "bg-white text-[#1B4332] shadow-sm"
                : "text-[#64748B] hover:text-[#1E293B]"
            }`}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Day selector (timeline & map only) */}
      {activeTab !== "list" && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {days.map((day, i) => (
            <button
              key={day.dayNum}
              onClick={() => setActiveDay(i)}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                safeDay === i
                  ? "bg-[#1B4332] text-white shadow-sm"
                  : "bg-white text-[#64748B] shadow-card hover:bg-[#D8F3DC] hover:text-[#1B4332]"
              }`}
            >
              Day {day.dayNum}
              <span className="ml-1.5 text-xs opacity-70">({day.pois.length})</span>
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {activeTab === "timeline" && <TimelineTab day={days[safeDay]} />}
      {activeTab === "map"      && <MapTab day={days[safeDay]} />}
      {activeTab === "list"     && <ListTab days={days} />}
    </div>
  )
}
