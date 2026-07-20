// 草稿行程生成（Architect Agent 的前端簡化版）
// 投票結果頁按「生成草稿行程」時呼叫，結果存 localStorage，行程頁讀取顯示。
// 之後接上真正的 Architect Agent API 時，只要換掉 generateDraftDays 的實作即可。

import { POIS, type POI } from "@/data/pois"
import type { POIKnowledge } from "@/data/poi-kb"

export interface DraftPOI {
  id: string
  name: string
  address: string
  description: string
  level: 0 | 1 | 2 | 3
  imageSeed: string
  stayMinutes: number
  lat?: number
  lng?: number
  travelToNext?: { mode: "walk" | "transit"; minutes: number }
}

export interface DraftDay {
  dayNum: number
  date: string
  pois: DraftPOI[]
}

export interface DraftItinerary {
  tripName: string
  destination: string
  days: DraftDay[]
  generatedAt: string
}

const STORAGE_PREFIX = "navigator_draft_"
const MAX_POIS_PER_DAY = 4
const MAX_MINUTES_PER_DAY = 480 // 一天最多排 8 小時停留

// ── 距離與移動時間估算 ──────────────────────────────────────────
function haversineKm(a: POI, b: POI): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function estimateTravel(a: POI, b: POI): { mode: "walk" | "transit"; minutes: number } {
  const km = haversineKm(a, b)
  if (km <= 1.5) return { mode: "walk", minutes: Math.max(3, Math.round(km * 14)) }
  return { mode: "transit", minutes: Math.round(10 + km * 2) }
}

// ── FFR13：驗證庫選點 → generateDraftDays 輸入 ─────────────────
// /explore（驗證景點庫）用 poi-kb.ts 的 POIKnowledge 形狀；generateDraftDays
// 吃的是 data/pois.ts 的 POI 形狀。兩邊欄位語意相同、僅命名風格不同
// （camelCase vs snake_case），這裡做一次性轉換。
// backup_strategy：驗證庫目前不回傳這個欄位（見 CLAUDE.md §9 ingestion gap），
// 留空字串——generateDraftDays 排序邏輯不讀這個欄位，不影響產生的行程。
export function fromPOIKnowledge(p: POIKnowledge): POI {
  return {
    id: p.id,
    name: p.name,
    region: p.region,
    category: p.category,
    level: p.level,
    weather_sensitivity: p.weatherSensitivity,
    tags: p.tags,
    is_indoor: p.isIndoor,
    indoor_type: p.indoorType,
    duration_min: p.durationMin,
    lat: p.lat,
    lng: p.lng,
    backup_strategy: "",
    image_url: p.imageUrl,
    semantic_description: p.touristDescription,
    rating: p.rating,
  }
}

// ── 生成邏輯 ────────────────────────────────────────────────────
// 1. 按區域分群（同區排同一天，減少跨區移動）
// 2. 每區以最高分景點當起點，之後用最近鄰串接（路線不亂跳）
// 3. 依每日景點數 / 總停留時間切天
export function generateDraftDays(scored: { poi: POI; score: number }[]): DraftDay[] {
  const byRegion = new Map<string, { poi: POI; score: number }[]>()
  for (const item of scored) {
    const list = byRegion.get(item.poi.region) ?? []
    list.push(item)
    byRegion.set(item.poi.region, list)
  }

  // 景點多的區域排前面
  const regions = [...byRegion.entries()].sort((a, b) => b[1].length - a[1].length)

  const ordered: POI[] = []
  for (const [, items] of regions) {
    const pool = [...items].sort((a, b) => b.score - a.score)
    let current = pool.shift()!
    ordered.push(current.poi)
    while (pool.length > 0) {
      pool.sort((a, b) => haversineKm(current.poi, a.poi) - haversineKm(current.poi, b.poi))
      current = pool.shift()!
      ordered.push(current.poi)
    }
  }

  const days: DraftDay[] = []
  let bucket: POI[] = []
  let bucketMinutes = 0

  const flush = () => {
    if (bucket.length === 0) return
    const pois: DraftPOI[] = bucket.map((p, i) => ({
      id: p.id,
      name: p.name,
      address: `${p.region} · ${p.category}`,
      description: p.semantic_description.slice(0, 60),
      level: p.level,
      imageSeed: p.id,
      stayMinutes: p.duration_min,
      lat: p.lat,
      lng: p.lng,
      travelToNext: i < bucket.length - 1 ? estimateTravel(p, bucket[i + 1]) : undefined,
    }))
    days.push({ dayNum: days.length + 1, date: "日期待定", pois })
    bucket = []
    bucketMinutes = 0
  }

  for (const poi of ordered) {
    const overflow =
      bucket.length >= MAX_POIS_PER_DAY || bucketMinutes + poi.duration_min > MAX_MINUTES_PER_DAY
    // 換區也換天
    const regionChanged = bucket.length > 0 && bucket[0].region !== poi.region
    if (overflow || regionChanged) flush()
    bucket.push(poi)
    bucketMinutes += poi.duration_min
  }
  flush()

  return days
}

// ── localStorage 存取 ───────────────────────────────────────────
export function saveDraft(tripId: string, draft: DraftItinerary): void {
  localStorage.setItem(STORAGE_PREFIX + tripId, JSON.stringify(draft))
}

export function loadDraft(tripId: string): DraftItinerary | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tripId)
    if (!raw) return null
    const draft = JSON.parse(raw) as DraftItinerary
    // 舊版草稿沒存座標，從 POI 資料按 id 回填，避免地圖顯示不出來
    for (const day of draft.days) {
      for (const p of day.pois) {
        if (p.lat == null || p.lng == null) {
          const src = POIS.find((x) => x.id === p.id)
          if (src) {
            p.lat = src.lat
            p.lng = src.lng
          }
        }
      }
    }
    return draft
  } catch {
    return null
  }
}
