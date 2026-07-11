"use client"

// 單日行程路線地圖：Mapbox 底圖 + 編號標記 + 連線
// 用於行程頁的「地圖」分頁；token 讀 NEXT_PUBLIC_MAPBOX_TOKEN

import Map, { Marker, Source, Layer, NavigationControl } from "react-map-gl/mapbox"
import "mapbox-gl/dist/mapbox-gl.css"
import { MapPin } from "lucide-react"
import type { DraftPOI } from "@/lib/draft-itinerary"

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

function Fallback({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 flex flex-col items-center justify-center min-h-[420px] gap-3">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#D8F3DC]">
        <MapPin className="h-7 w-7 text-[#1B4332]" />
      </div>
      <p className="font-semibold text-[#1E293B]">{title}</p>
      <p className="text-sm text-[#64748B] text-center max-w-xs">{hint}</p>
    </div>
  )
}

export default function DayRouteMap({ pois }: { pois: DraftPOI[] }) {
  const points = pois.filter(
    (p): p is DraftPOI & { lat: number; lng: number } => p.lat != null && p.lng != null
  )

  if (!TOKEN) {
    return (
      <Fallback
        title="地圖需要 Mapbox Token"
        hint="請在 .env.local 設定 NEXT_PUBLIC_MAPBOX_TOKEN 後重啟 dev server"
      />
    )
  }
  if (points.length === 0) {
    return (
      <Fallback
        title="此行程沒有座標資料"
        hint="回到投票結果頁重新按「生成草稿行程」即可帶入座標"
      />
    )
  }

  const lngs = points.map((p) => p.lng)
  const lats = points.map((p) => p.lat)
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]

  const routeLine = {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 h-[420px]">
      {/* key 換日時重新掛載，讓視野重新 fit 到當日景點 */}
      <Map
        key={points.map((p) => p.id).join("|")}
        mapboxAccessToken={TOKEN}
        initialViewState={{
          bounds,
          fitBoundsOptions: { padding: { top: 60, bottom: 60, left: 50, right: 50 }, maxZoom: 15 },
        }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {points.length > 1 && (
          <Source id="day-route" type="geojson" data={routeLine}>
            <Layer
              id="day-route-line"
              type="line"
              paint={{ "line-color": "#1B4332", "line-width": 3, "line-dasharray": [1.5, 1.5], "line-opacity": 0.75 }}
            />
          </Source>
        )}

        {points.map((p, i) => (
          <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="bottom">
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1B4332] text-[12px] font-bold text-white shadow-md ring-2 ring-white">
                {i + 1}
              </div>
              <div className="mt-0.5 max-w-[120px] truncate rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-[#1E293B] shadow">
                {p.name}
              </div>
            </div>
          </Marker>
        ))}
      </Map>
    </div>
  )
}
