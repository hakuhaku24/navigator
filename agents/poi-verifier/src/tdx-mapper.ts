// TDX 觀光實體 → Navigator PoiInput 欄位對映
// 對映策略來自 docs/TDX_SCHEMA_COMPARISON.md § 5

import type { PoiInput } from './types'
import type {
  TdxScenicSpot,
  TdxRestaurant,
  TdxHotel,
  TdxActivity,
  TdxEntityType,
  TdxEntity,
  TdxPicture,
} from './tdx-types'
import { deriveCity, cleanPhone } from './canonical-poi'

// ── TDX Class1 → Navigator category ──────────────────────────────────────

export const TDX_CLASS_TO_CATEGORY: Record<string, string> = {
  '自然風景類': '自然景觀',
  '生態類':     '自然景觀',
  '溫泉類':     '溫泉',
  '古蹟類':     '歷史文化',
  '廟宇類':     '歷史文化',
  '文化類':     '歷史文化',
  '藝術類':     '藝術展館',
  '藝文設施類': '藝術展館',
  '觀光工廠類': '觀光工廠',
  '休閒農業類': '休閒體驗',
  '遊憩類':     '休閒體驗',
  '運動健身類': '運動健身',
  '購物類':     '購物',
  '飲食類':     '餐飲',
  '其他':       '其他',
}

// ── TDX City → region ─────────────────────────────────────────────────────
// 註：原 TDX_CITY_TO_REGION（City→縣市縮寫）已移除，改用 canonical deriveCity，
//     因 TDX City 是「管轄單位」非實際位置、會錯（見 db-organization-plan §10 修正 1）。
//     real city 改由 ZipCode→Address→City 推導。

// ── 室內/戶外推斷（Class1 啟發式，無 API 呼叫）──────────────────────────

export function inferIsIndoor(class1: string | null | undefined): boolean {
  const indoorClasses = new Set(['藝術類', '藝文設施類', '觀光工廠類', '購物類'])
  return indoorClasses.has(class1 ?? '')
}

// ── 天氣敏感度推斷 ──────────────────────────────────────────────────────

export function inferWeatherSensitivity(
  class1: string | null | undefined,
): 'low' | 'medium' | 'high' {
  const lowClasses  = new Set(['藝術類', '藝文設施類', '觀光工廠類', '購物類'])
  const highClasses = new Set(['自然風景類', '生態類'])
  if (lowClasses.has(class1 ?? ''))  return 'low'
  if (highClasses.has(class1 ?? '')) return 'high'
  return 'medium'
}

// ── 停留時間預設值（按類別，分鐘）──────────────────────────────────────

export function defaultStayMinutes(category: string): number {
  const minutes: Record<string, number> = {
    '自然景觀': 90,
    '溫泉':     120,
    '歷史文化': 60,
    '藝術展館': 90,
    '觀光工廠': 90,
    '休閒體驗': 120,
    '運動健身': 120,
    '購物':     60,
    '餐飲':     60,
    '活動':     120,
    '旅宿':     480,
    '其他':     60,
  }
  return minutes[category] ?? 90
}

// ── 共用輔助 ─────────────────────────────────────────────────────────────

function pictureUrl(pic: TdxPicture | null | undefined): string | null {
  return pic?.PictureUrl1 ?? null
}

// TDX 最多提供 3 張圖片；回傳所有非空 URL
function extractImageUrls(pic: TdxPicture | null | undefined): string[] {
  if (!pic) return []
  return [pic.PictureUrl1, pic.PictureUrl2, pic.PictureUrl3]
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
}

// region 改用 canonical deriveCity（ZipCode→Address→City），修正 TDX City 不可靠
function resolveRegion(
  zip: string | null | undefined,
  address: string | null | undefined,
  city: string | null | undefined,
): string {
  return deriveCity(zip, address, city) ?? '未知區域'
}

function splitKeywords(keyword: string | null | undefined): string[] {
  if (!keyword) return []
  return keyword.split(',').map(k => k.trim()).filter(Boolean)
}

// ── TdxMappedPoi — 對映後的中間產物 ──────────────────────────────────────

export interface TdxMappedPoi {
  poiInput:        PoiInput
  tdxId:           string       // 原始 TDX ID（如 "C1_376420000A_000253"）
  sourceId:        string       // Navigator source_id（如 "TDX-SS-C1_376420000A_000253"）
  entityType:      TdxEntityType
  region:          string       // 真實縣市，經 deriveCity 推導（ZipCode→Address→City，非直抄 City）
  zipCode:         string | null // TDX ZipCode（推 region 用；Activity 無此欄為 null）
  category:        string       // Navigator 分類詞彙
  preliminaryTags: string[]     // 從 Class + Keyword 衍生的預備標籤
  imageUrl:        string | null // 主圖（PictureUrl1）
  imageUrls:       string[]     // 所有非空 TDX 圖片 URL（最多 3 張）
  address:         string | null
  openTime:        string | null // 原始 TDX 開放/營業時間字串
  phone:           string | null // TDX Phone 欄位
  travelInfo:      string | null // TDX TravelInfo（僅 ScenicSpot；其他為 null）
  tdxCity:         string | null
  tdxSrcUpdateTime: string | null
}

function makeSourceId(type: TdxEntityType, tdxId: string): string {
  const prefix: Record<TdxEntityType, string> = {
    ScenicSpot: 'SS',
    Restaurant: 'RS',
    Hotel:      'HT',
    Activity:   'AC',
  }
  return `TDX-${prefix[type]}-${tdxId}`
}

// ── 各實體對映函式 ─────────────────────────────────────────────────────────

export function mapTdxScenicSpot(spot: TdxScenicSpot): TdxMappedPoi {
  const category = TDX_CLASS_TO_CATEGORY[spot.Class1 ?? ''] ?? '景點'
  const region   = resolveRegion(spot.ZipCode, spot.Address, spot.City)

  const keywordTags = splitKeywords(spot.Keyword)
  const classTags   = [spot.Class1, spot.Class2, spot.Class3].filter((c): c is string => !!c)
  const preliminaryTags = Array.from(new Set([...classTags, ...keywordTags, category]))

  const baseDesc  = (spot.DescriptionDetail || spot.Description || '').trim()
  const openInfo  = spot.OpenTime   ? `開放時間：${spot.OpenTime}` : ''
  const travelFyi = spot.TravelInfo ? `交通資訊：${spot.TravelInfo.slice(0, 200)}` : ''
  const descParts = [baseDesc, openInfo, travelFyi].filter(Boolean)

  return {
    poiInput: {
      name:             spot.ScenicSpotName,
      location:         { latitude: spot.Position.PositionLat, longitude: spot.Position.PositionLon },
      user_description: descParts.join('\n').slice(0, 800) || undefined,
      website_url:      spot.WebsiteUrl ?? undefined,
    },
    tdxId:            spot.ScenicSpotID,
    sourceId:         makeSourceId('ScenicSpot', spot.ScenicSpotID),
    entityType:       'ScenicSpot',
    region,
    category,
    preliminaryTags,
    imageUrl:         pictureUrl(spot.Picture),
    imageUrls:        extractImageUrls(spot.Picture),
    address:          spot.Address ?? null,
    openTime:         spot.OpenTime ?? null,
    phone:            cleanPhone(spot.Phone),
    zipCode:          spot.ZipCode ?? null,
    travelInfo:       spot.TravelInfo ?? null,
    tdxCity:          spot.City ?? null,
    tdxSrcUpdateTime: spot.SrcUpdateTime ?? null,
  }
}

export function mapTdxRestaurant(r: TdxRestaurant): TdxMappedPoi {
  const category = '餐飲'
  const region   = resolveRegion(r.ZipCode, r.Address, r.City)

  const classTags      = r.Class ? [r.Class] : []
  const preliminaryTags = Array.from(new Set([...classTags, category]))

  const baseDesc = (r.Description ?? '').trim()
  const openInfo = r.OpenTime ? `營業時間：${r.OpenTime}` : ''
  const descParts = [baseDesc, openInfo].filter(Boolean)

  return {
    poiInput: {
      name:             r.RestaurantName,
      location:         { latitude: r.Position.PositionLat, longitude: r.Position.PositionLon },
      user_description: descParts.join('\n').slice(0, 800) || undefined,
    },
    tdxId:            r.RestaurantID,
    sourceId:         makeSourceId('Restaurant', r.RestaurantID),
    entityType:       'Restaurant',
    region,
    category,
    preliminaryTags,
    imageUrl:         pictureUrl(r.Picture),
    imageUrls:        extractImageUrls(r.Picture),
    address:          r.Address ?? null,
    openTime:         r.OpenTime ?? null,
    phone:            cleanPhone(r.Phone),
    zipCode:          r.ZipCode ?? null,
    travelInfo:       null,
    tdxCity:          r.City ?? null,
    tdxSrcUpdateTime: r.SrcUpdateTime ?? null,
  }
}

export function mapTdxHotel(h: TdxHotel): TdxMappedPoi {
  const category = '旅宿'
  const region   = resolveRegion(h.ZipCode, h.Address, h.City)

  const classTags      = h.Class ? [h.Class] : []
  const serviceTags    = h.ServiceInfo
    ? h.ServiceInfo.split(',').map(s => s.trim()).filter(Boolean)
    : []
  const preliminaryTags = Array.from(new Set([...classTags, ...serviceTags, category]))

  return {
    poiInput: {
      name:             h.HotelName,
      location:         { latitude: h.Position.PositionLat, longitude: h.Position.PositionLon },
      user_description: (h.Description ?? '').trim().slice(0, 800) || undefined,
    },
    tdxId:            h.HotelID,
    sourceId:         makeSourceId('Hotel', h.HotelID),
    entityType:       'Hotel',
    region,
    category,
    preliminaryTags,
    imageUrl:         pictureUrl(h.Picture),
    imageUrls:        extractImageUrls(h.Picture),
    address:          h.Address ?? null,
    openTime:         null,
    phone:            cleanPhone(h.Phone),
    zipCode:          h.ZipCode ?? null,
    travelInfo:       null,
    tdxCity:          h.City ?? null,
    tdxSrcUpdateTime: h.SrcUpdateTime ?? null,
  }
}

export function mapTdxActivity(a: TdxActivity): TdxMappedPoi {
  const category = '活動'
  const region   = resolveRegion(undefined, a.Address, a.City)  // Activity 無 ZipCode

  const classTags      = a.Class1 ? [a.Class1] : []
  const preliminaryTags = Array.from(new Set([...classTags, category]))

  const baseDesc  = (a.Description ?? '').trim()
  const timeRange = (a.StartTime && a.EndTime)
    ? `活動期間：${a.StartTime.slice(0, 10)} ～ ${a.EndTime.slice(0, 10)}`
    : ''
  const descParts = [baseDesc, timeRange].filter(Boolean)

  return {
    poiInput: {
      name:             a.ActivityName,
      location:         { latitude: a.Position.PositionLat, longitude: a.Position.PositionLon },
      user_description: descParts.join('\n').slice(0, 800) || undefined,
    },
    tdxId:            a.ActivityID,
    sourceId:         makeSourceId('Activity', a.ActivityID),
    entityType:       'Activity',
    region,
    category,
    preliminaryTags,
    imageUrl:         pictureUrl(a.Picture),
    imageUrls:        extractImageUrls(a.Picture),
    address:          a.Address ?? null,
    openTime:         null,
    phone:            cleanPhone(a.Phone),
    zipCode:          null,
    travelInfo:       null,
    tdxCity:          a.City ?? null,
    tdxSrcUpdateTime: a.SrcUpdateTime ?? null,
  }
}

// ── 統一對映入口 ──────────────────────────────────────────────────────────

export function mapTdxEntity(entity: TdxEntity, type: TdxEntityType): TdxMappedPoi {
  switch (type) {
    case 'ScenicSpot':  return mapTdxScenicSpot(entity as TdxScenicSpot)
    case 'Restaurant':  return mapTdxRestaurant(entity as TdxRestaurant)
    case 'Hotel':       return mapTdxHotel(entity as TdxHotel)
    case 'Activity':    return mapTdxActivity(entity as TdxActivity)
  }
}
