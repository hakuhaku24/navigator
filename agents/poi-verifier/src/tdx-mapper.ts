// TDX 觀光實體 → Navigator PoiInput 欄位對映
//
// ⚠️ 2026-08-02 全面改寫。舊端點 `/api/basic/v2/Tourism/ScenicSpot` 已下架，
//    改接 `/api/tourism/service/odata/V2/Tourism/Attraction`，schema 完全不同。
//    舊的 Class1/2/3 中文字串對照、Picture 三張上限、ParkingPosition 座標全數作廢，
//    細節見 `tdx-types.ts` 檔頭。

import type { PoiInput } from './types'
import type {
  TdxAttraction,
  TdxRestaurant,
  TdxHotel,
  TdxEvent,
  TdxEntityType,
  TdxEntity,
  TdxImage,
  TdxPostalAddress,
  TdxTelephone,
} from './tdx-types'
import { TDX_ATTRACTION_CLASS, TDX_FACILITY, TDX_SERVICE_STATUS } from './tdx-types'
import { categoryFromClasses, TDX_ATTRACTION_CLASS_TO_CATEGORY } from './tdx-types'
import { deriveCity, cleanPhone } from './canonical-poi'

// 類型代碼 → category 的對照表定義在 tdx-types.ts（葉節點，避免與 canonical-poi
// 形成循環相依）；在此轉出，讓 mapper 仍是對映相關功能的單一入口。
export { categoryFromClasses, TDX_ATTRACTION_CLASS_TO_CATEGORY }

/** 數字代碼 → 中文類型名（做 tag 用）。不認得的代碼直接略過，不編造。 */
export function classTags(classes: number[] | null | undefined): string[] {
  if (!classes?.length) return []
  return classes
    .map(c => TDX_ATTRACTION_CLASS[c])
    .filter((n): n is string => !!n)
}

/** 設施代碼 → 中文設施名。無障礙設施（20–25）就是靠這個進 tags。 */
export function facilityTags(codes: number[] | null | undefined): string[] {
  if (!codes?.length) return []
  return codes
    .map(c => TDX_FACILITY[c])
    .filter((n): n is string => !!n)
}

/** 營運狀態代碼 → 中文。查無代碼回 null（不可當成「正常營運」）。 */
export function serviceStatusLabel(code: number | null | undefined): string | null {
  if (typeof code !== 'number') return null
  return (TDX_SERVICE_STATUS as Record<number, string>)[code] ?? null
}

// ── 室內/戶外推斷 ────────────────────────────────────────────────────────

/**
 * ⚠️ 回傳 `boolean | null`，`null` ＝**未判定**，呼叫端不可當 false 用。
 *
 * 為什麼特別強調：2026-05-06 那批 ingest 就是把「未判定」用 `?? false` 補成
 * 「戶外」，造成 45 筆裡 41 筆 is_indoor=false，而下雨應變是
 * `metadata @> {"is_indoor": true}` 的硬性篩選 → 陽明山與東北角候選池歸零
 * （見 CLAUDE.md §9 紅字段落）。所以這裡寧可回 null 也不猜。
 *
 * 只有「幾乎必然在室內」的類型才回 true，「幾乎必然露天」的才回 false，
 * 其餘一律 null——例如商圈商店類（百貨室內、老街露天）、生態場館類
 * （水族館室內、動物園露天）、溫泉類（湯屋室內、野溪露天）都無法一概而論。
 */
export function inferIsIndoor(classes: number[] | null | undefined): boolean | null {
  if (!classes?.length) return null
  const indoor  = new Set([5, 14, 25, 27])              // 藝術、觀光工廠、藝文場館、娛樂場館
  const outdoor = new Set([2, 7, 8, 11, 15, 16, 17, 18, 19, 24])  // 生態、公園、森林、水域…
  const hasIndoor  = classes.some(c => indoor.has(c))
  const hasOutdoor = classes.some(c => outdoor.has(c))
  // 同時掛室內與露天類型（如「國家公園裡的美術館」）＝ 資料本身沒說清楚，回 null。
  // 這種情況下二選一必定有一半是錯的，而錯的那一半會被下雨應變的硬性篩選放大。
  if (hasIndoor && hasOutdoor) return null
  if (hasIndoor)  return true
  if (hasOutdoor) return false
  return null
}

/**
 * 天氣敏感度。這裡刻意**不**跟著 `inferIsIndoor` 回 null——
 * 'medium' 是量表上真實存在的中間值（用於加權計分），不是把未知偽裝成已知；
 * 而 is_indoor 的 false 會直接讓景點通過／落在硬性篩選的錯誤那邊，性質不同。
 */
export function inferWeatherSensitivity(
  classes: number[] | null | undefined,
): 'low' | 'medium' | 'high' {
  if (!classes?.length) return 'medium'
  const low  = new Set([5, 14, 25, 27])
  const high = new Set([2, 7, 8, 9, 11, 15, 16, 17, 18, 19, 24])
  if (classes.some(c => low.has(c)))  return 'low'
  if (classes.some(c => high.has(c))) return 'high'
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
    '景點':     90,
    '其他':     60,
  }
  return minutes[category] ?? 90
}

// ── 共用輔助 ─────────────────────────────────────────────────────────────

/** `Images[]` → 非空 URL 陣列。新版無 3 張上限（實測單筆最多 92 張）。 */
export function extractImageUrls(images: TdxImage[] | null | undefined): string[] {
  if (!images?.length) return []
  return images
    .map(i => i?.URL)
    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
}

/**
 * 圖片說明，與 `extractImageUrls` 同索引對齊。
 *
 * 新版 schema 下對齊是天生的（說明與 URL 在同一個物件裡），只要跟著同一組
 * 過濾條件走即可；舊版那種「URL 缺一張就整串位移」的錯位風險已不存在。
 *
 * ⚠️ 實測 500 筆共 1,156 張圖，有說明的 695 張**全部是出處標註**
 *    （「照片提供｜宜蘭分署」）。想用它查核「圖文是否相符」目前行不通。
 */
export function extractImageDescriptions(images: TdxImage[] | null | undefined): string[] {
  if (!images?.length) return []
  return images
    .filter(i => typeof i?.URL === 'string' && i.URL.trim().length > 0)
    .map(i => (typeof i.Description === 'string' ? i.Description.trim() : ''))
}

/** `Telephones[]` → 單一市話字串（含分機）。取第一支有值的。 */
export function extractPhone(tels: TdxTelephone[] | null | undefined): string | null {
  if (!tels?.length) return null
  for (const t of tels) {
    const raw = t?.Tel
    if (typeof raw !== 'string' || !raw.trim()) continue
    const base = cleanPhone(raw)
    if (!base) continue
    return typeof t.Ext === 'number' ? `${base}#${t.Ext}` : base
  }
  return null
}

/** `PostalAddress` → 單行地址字串（給 facts.address 與舊有欄位用）。 */
export function formatAddress(addr: TdxPostalAddress | null | undefined): string | null {
  if (!addr) return null
  const line = [addr.City, addr.Town, addr.StreetAddress]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join('')
  return line || null
}

/**
 * 縣市推導。沿用 canonical `deriveCity` 的 ZipCode → Address → City 優先序。
 *
 * ⚠️ 實測發現新版 `PostalAddress` 內部也會不一致：滿月圓國家森林遊樂區的
 *    `Town`/`ZipCode` 是「八里區/249」，但 `StreetAddress` 是「三峽區有木里…」，
 *    後者才對。所幸兩者的 `City` 都是新北市，縣市級推導不受影響——
 *    但**任何要用到鄉鎮層級的功能都不能直接信 `Town`/`ZipCode`**。
 */
function resolveRegion(addr: TdxPostalAddress | null | undefined): string {
  return deriveCity(addr?.ZipCode, addr?.StreetAddress, addr?.City) ?? '未知區域'
}

// ── TdxMappedPoi — 對映後的中間產物 ──────────────────────────────────────

export interface TdxMappedPoi {
  poiInput:        PoiInput
  tdxId:           string       // 原始 TDX ID（如 "Attraction_345040000G_000002"）
  sourceId:        string       // Navigator source_id（如 "TDX-AT-Attraction_345040000G_000002"）
  entityType:      TdxEntityType
  region:          string       // 真實縣市，經 deriveCity 推導
  zipCode:         string | null
  category:        string       // Navigator 分類詞彙
  preliminaryTags: string[]     // 類型代碼 ＋ 官方 Tags ＋ 設施名 衍生的預備標籤
  imageUrl:        string | null // 主圖（Images[0]）
  imageUrls:       string[]
  /** 圖片官方說明，與 imageUrls 同索引。實測多為出處標註，見 extractImageDescriptions。 */
  imageDescriptions: string[]
  address:         string | null
  openTime:        string | null // ServiceTimeInfo（實測填充率 0%）
  phone:           string | null
  travelInfo:      string | null // TrafficInfo
  /** 停車資訊自由文字。取代舊版的 ParkingPosition 座標（新版已無座標）。 */
  parkingInfo:     string | null
  /** 營運狀態代碼；1=正常營運、0=永久停止、3=暫時停止。null ＝ 未提供。 */
  serviceStatus:      number | null
  serviceStatusLabel: string | null
  /** 免費入場（1/0）。null ＝ 未提供。 */
  isAccessibleForFree: number | null
  feeInfo:         string | null
  /** 官方建議停留分鐘。實測填充率 0%，有值時應優先於 LLM 推估。 */
  visitDuration:   number | null
  classCodes:      number[]
  facilityCodes:   number[]
  tdxCity:         string | null
  tdxSrcUpdateTime: string | null
}

function makeSourceId(type: TdxEntityType, tdxId: string): string {
  const prefix: Record<TdxEntityType, string> = {
    Attraction: 'AT',
    Restaurant: 'RS',
    Hotel:      'HT',
    Event:      'EV',
  }
  return `TDX-${prefix[type]}-${tdxId}`
}

/** 描述 ＋ 開放時間 ＋ 交通，組成給下游 LLM 讀的 user_description。 */
function buildDescription(parts: Array<string | null | undefined>): string | undefined {
  return parts.filter(Boolean).join('\n').slice(0, 800) || undefined
}

// ── 各實體對映函式 ─────────────────────────────────────────────────────────

export function mapTdxAttraction(a: TdxAttraction): TdxMappedPoi {
  const classes  = a.AttractionClasses ?? []
  const category = categoryFromClasses(classes)
  const address  = formatAddress(a.PostalAddress)
  const images   = a.Images ?? []

  const preliminaryTags = Array.from(new Set([
    ...classTags(classes),
    ...(a.Tags ?? []).map(t => t.trim()).filter(Boolean),
    ...facilityTags(a.Facilities),
    category,
  ]))

  return {
    poiInput: {
      name:             a.AttractionName ?? '',
      location:         { latitude: a.PositionLat, longitude: a.PositionLon },
      user_description: buildDescription([
        (a.Description ?? '').trim(),
        a.ServiceTimeInfo ? `開放時間：${a.ServiceTimeInfo}` : '',
        a.TrafficInfo     ? `交通資訊：${a.TrafficInfo.slice(0, 200)}` : '',
      ]),
      website_url:      a.WebsiteUrl ?? undefined,
    },
    tdxId:            a.AttractionID ?? '',
    sourceId:         makeSourceId('Attraction', a.AttractionID ?? ''),
    entityType:       'Attraction',
    region:           resolveRegion(a.PostalAddress),
    zipCode:          a.PostalAddress?.ZipCode ?? null,
    category,
    preliminaryTags,
    imageUrl:         extractImageUrls(images)[0] ?? null,
    imageUrls:        extractImageUrls(images),
    imageDescriptions: extractImageDescriptions(images),
    address,
    openTime:         a.ServiceTimeInfo?.trim() || null,
    phone:            extractPhone(a.Telephones),
    travelInfo:       a.TrafficInfo?.trim() || null,
    parkingInfo:      a.ParkingInfo?.trim() || null,
    serviceStatus:      a.ServiceStatus ?? null,
    serviceStatusLabel: serviceStatusLabel(a.ServiceStatus),
    isAccessibleForFree: a.IsAccessibleForFree ?? null,
    feeInfo:          a.FeeInfo?.trim() || null,
    visitDuration:    a.VisitDuration ?? null,
    classCodes:       classes,
    facilityCodes:    a.Facilities ?? [],
    tdxCity:          a.PostalAddress?.City ?? null,
    tdxSrcUpdateTime: a.UpdateTime ?? null,
  }
}

export function mapTdxRestaurant(r: TdxRestaurant): TdxMappedPoi {
  const category = '餐飲'
  const images   = r.Images ?? []

  const preliminaryTags = Array.from(new Set([
    ...facilityTags(r.Facilities),
    category,
  ]))

  return {
    poiInput: {
      name:             r.RestaurantName ?? '',
      location:         { latitude: r.PositionLat, longitude: r.PositionLon },
      user_description: buildDescription([
        (r.Description ?? '').trim(),
        r.ServiceTimeInfo ? `營業時間：${r.ServiceTimeInfo}` : '',
      ]),
      website_url:      r.WebsiteUrl ?? undefined,
    },
    tdxId:            r.RestaurantID ?? '',
    sourceId:         makeSourceId('Restaurant', r.RestaurantID ?? ''),
    entityType:       'Restaurant',
    region:           resolveRegion(r.PostalAddress),
    zipCode:          r.PostalAddress?.ZipCode ?? null,
    category,
    preliminaryTags,
    imageUrl:         extractImageUrls(images)[0] ?? null,
    imageUrls:        extractImageUrls(images),
    imageDescriptions: extractImageDescriptions(images),
    address:          formatAddress(r.PostalAddress),
    openTime:         r.ServiceTimeInfo?.trim() || null,
    phone:            extractPhone(r.Telephones),
    travelInfo:       r.TrafficInfo?.trim() || null,
    parkingInfo:      r.ParkingInfo?.trim() || null,
    serviceStatus:      r.ServiceStatus ?? null,
    serviceStatusLabel: serviceStatusLabel(r.ServiceStatus),
    isAccessibleForFree: null,   // Restaurant 無此欄位
    feeInfo:          null,      // Restaurant 無此欄位
    visitDuration:    null,      // Restaurant 無此欄位
    classCodes:       r.CuisineClasses ?? [],
    facilityCodes:    r.Facilities ?? [],
    tdxCity:          r.PostalAddress?.City ?? null,
    tdxSrcUpdateTime: r.UpdateTime ?? null,
  }
}

export function mapTdxHotel(h: TdxHotel): TdxMappedPoi {
  const category = '旅宿'
  const images   = h.Images ?? []

  const serviceTags = h.ServiceInfo
    ? h.ServiceInfo.split(',').map(s => s.trim()).filter(Boolean)
    : []
  const preliminaryTags = Array.from(new Set([
    ...serviceTags,
    ...facilityTags(h.Facilities),
    category,
  ]))

  return {
    poiInput: {
      name:             h.HotelName ?? '',
      location:         { latitude: h.PositionLat, longitude: h.PositionLon },
      user_description: buildDescription([(h.Description ?? '').trim()]),
      website_url:      h.WebsiteUrl ?? undefined,
    },
    tdxId:            h.HotelID ?? '',
    sourceId:         makeSourceId('Hotel', h.HotelID ?? ''),
    entityType:       'Hotel',
    region:           resolveRegion(h.PostalAddress),
    zipCode:          h.PostalAddress?.ZipCode ?? null,
    category,
    preliminaryTags,
    imageUrl:         extractImageUrls(images)[0] ?? null,
    imageUrls:        extractImageUrls(images),
    imageDescriptions: extractImageDescriptions(images),
    address:          formatAddress(h.PostalAddress),
    openTime:         h.ServiceTimeInfo?.trim() || null,
    phone:            extractPhone(h.Telephones),
    travelInfo:       h.TrafficInfo?.trim() || null,
    parkingInfo:      h.ParkingInfo?.trim() || null,
    serviceStatus:      h.ServiceStatus ?? null,
    serviceStatusLabel: serviceStatusLabel(h.ServiceStatus),
    isAccessibleForFree: null,   // Hotel 無此欄位
    feeInfo:          null,
    visitDuration:    null,
    classCodes:       h.HotelClasses ?? [],
    facilityCodes:    h.Facilities ?? [],
    tdxCity:          h.PostalAddress?.City ?? null,
    tdxSrcUpdateTime: h.UpdateTime ?? null,
  }
}

export function mapTdxEvent(e: TdxEvent): TdxMappedPoi {
  const category = '活動'
  const images   = e.Images ?? []

  const preliminaryTags = Array.from(new Set([
    ...(e.Tags ?? []).map(t => t.trim()).filter(Boolean),
    ...facilityTags(e.Facilities),
    category,
  ]))

  const timeRange = (e.StartDateTime && e.EndDateTime)
    ? `活動期間：${e.StartDateTime.slice(0, 10)} ～ ${e.EndDateTime.slice(0, 10)}`
    : ''

  return {
    poiInput: {
      name:             e.EventName ?? '',
      location:         { latitude: e.PositionLat, longitude: e.PositionLon },
      user_description: buildDescription([(e.Description ?? '').trim(), timeRange]),
      website_url:      e.WebsiteUrl ?? undefined,
    },
    tdxId:            e.EventID ?? '',
    sourceId:         makeSourceId('Event', e.EventID ?? ''),
    entityType:       'Event',
    region:           resolveRegion(e.PostalAddress),
    zipCode:          e.PostalAddress?.ZipCode ?? null,
    category,
    preliminaryTags,
    imageUrl:         extractImageUrls(images)[0] ?? null,
    imageUrls:        extractImageUrls(images),
    imageDescriptions: extractImageDescriptions(images),
    address:          formatAddress(e.PostalAddress),
    openTime:         null,      // Event 用 StartDateTime/EndDateTime 表達
    phone:            extractPhone(e.Telephones),
    travelInfo:       e.TrafficInfo?.trim() || null,
    parkingInfo:      e.ParkingInfo?.trim() || null,
    serviceStatus:      null,    // Event 無 ServiceStatus，改用 EventStatus（字串）
    serviceStatusLabel: e.EventStatus?.trim() || null,
    isAccessibleForFree: e.IsAccessibleForFree ?? null,
    feeInfo:          e.FeeInfo?.trim() || null,
    visitDuration:    null,
    classCodes:       e.EventClasses ?? [],
    facilityCodes:    e.Facilities ?? [],
    tdxCity:          e.PostalAddress?.City ?? null,
    tdxSrcUpdateTime: e.UpdateTime ?? null,
  }
}

// ── 統一對映入口 ──────────────────────────────────────────────────────────

export function mapTdxEntity(entity: TdxEntity, type: TdxEntityType): TdxMappedPoi {
  switch (type) {
    case 'Attraction': return mapTdxAttraction(entity as TdxAttraction)
    case 'Restaurant': return mapTdxRestaurant(entity as TdxRestaurant)
    case 'Hotel':      return mapTdxHotel(entity as TdxHotel)
    case 'Event':      return mapTdxEvent(entity as TdxEvent)
  }
}
