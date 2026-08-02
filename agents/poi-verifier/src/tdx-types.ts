// TDX 觀光 API — TypeScript 型別定義
//
// ⚠️ 2026-08-02 全面改版。舊的 `/api/basic/v2/Tourism/ScenicSpot` 系列端點**已下架**
//    （同一把 token 打 `/api/basic/v2/Rail/TRA/Station` 回 200、打觀光端點回 404，
//    所以不是憑證問題）。觀光資料改由觀光署的獨立服務提供：
//
//      https://tdx.transportdata.tw/api/tourism/service/odata/V2/Tourism/{Entity}
//
//    實體同時改名：ScenicSpot → Attraction、Activity → Event。
//
// 欄位定義來源：OAS 3.0.4「觀光資訊資料庫開放資料V2」
//   https://tdx.transportdata.tw/webapi/File/Swagger/V3/0aed433a-9e95-404d-974c-4e70e29ae460
// 代碼表來源：交通部觀光署「觀光資料標準 V2.1」
//   https://media.taiwan.net.tw/Upload/觀光資料標準V2.1.pdf
// 驗證日期：2026-08-02（實打 500 筆 Attraction 對過欄位）

// ── 共用複合型別 ───────────────────────────────────────────────────────────

/**
 * 影像。取代舊版 `Picture.PictureUrl1–3` / `PictureDescription1–3` 的三張上限，
 * 現在是陣列（實測單筆最多 92 張），而且說明與 URL 天生同物件、不會錯位。
 *
 * ⚠️ `Description` 實測**幾乎都是出處標註**（「照片提供｜宜蘭分署」），
 *    不是圖片內容描述。想拿它做「圖文是否相符」的查核會落空，見 KNOWN_ISSUES。
 */
export interface TdxImage {
  Name?:        string | null
  Description?: string | null
  URL?:         string | null
  Width?:       number | null
  Height?:      number | null
  Keywords?:    string[] | null
}

/** 結構化地址。取代舊版的 `Address` 純字串 ＋ 分離的 `ZipCode` / `City`。 */
export interface TdxPostalAddress {
  City?:          string | null
  CityCode?:      string | null
  Town?:          string | null
  TownCode?:      string | null
  ZipCode?:       string | null
  StreetAddress?: string | null
}

export interface TdxTelephone {
  Tel?: string | null
  Ext?: number | null
}

export interface TdxOrganization {
  Name?:       string | null
  Class?:      string | null
  TaxCode?:    string | null
  AgencyCode?: string | null
  URL?:        string | null
  Email?:      string | null
}

/** 關聯所在縣市鄉鎮。實測填充率僅 2%，**不可拿來篩選縣市**（用 PostalAddress/City）。 */
export interface TdxLocatedCity {
  Name?:     string | null
  Class:     number
  City?:     string | null
  CityCode?: string | null
  Town?:     string | null
  TownCode?: string | null
}

export interface TdxSocialMediaUrl {
  Name?:  string | null
  Class?: string | null
  URL?:   string | null
}

// ── 代碼表（觀光資料標準 V2.1 附錄）────────────────────────────────────────

/**
 * 營運服務狀態 `ServiceStatusEnum`。實測填充率 100%，是新版最有用的欄位之一——
 * 在此之前 `poi-catalog-client.ts` 是寫死 `business_status: 'OPERATIONAL'`。
 */
export const TDX_SERVICE_STATUS = {
  0: '永久停止',
  1: '正常營運',
  2: '非營運時段',
  3: '暫時停止營運',
  9: '營運狀態待確認',
} as const

/** 景點類型 `AttractionClassEnum`。舊版是中文字串 Class1/2/3，現在是數字陣列。 */
export const TDX_ATTRACTION_CLASS: Record<number, string> = {
  1: '文化類',     2: '生態類',       3: '文化資產類',   4: '宗教廟宇類',
  5: '藝術類',     6: '商圈商店類',   7: '國家公園類',   8: '國家風景區類',
  9: '休閒農業類', 10: '溫泉類',      11: '自然風景類',  12: '遊憩類',
  13: '體育健身類', 14: '觀光工廠類', 15: '都會公園類',  16: '森林遊樂區類',
  17: '平地森林園區類', 18: '國家自然公園類', 19: '公園綠地類', 20: '觀光遊樂業類',
  21: '原住民文化類', 22: '客家文化類', 23: '交通場站類', 24: '水域環境類',
  25: '藝文場館類', 26: '生態場館類', 27: '娛樂場館類', 254: '其他',
}

/**
 * 設施代碼 `FacilityEnum`（節錄常用者）。20–25 是無障礙設施——
 * 這正是計畫書打算向 Google Places 買 `accessibilityOptions` 的那組資訊。
 * ⚠️ 實測 500 筆填充率 0%，欄位存在但資料端還沒填，先接住不代表現在有值。
 */
export const TDX_FACILITY: Record<number, string> = {
  1: '廁所', 2: '通用廁所', 3: '哺集乳室', 4: '飲水機', 5: '電梯', 6: '電扶梯',
  7: '無線網路', 8: '諮詢站', 9: '置物櫃', 10: '停車場', 11: 'AED',
  20: '無障礙通路', 21: '無障礙廁所', 22: '無障礙浴室', 23: '無障礙客房',
  24: '無障礙座椅席位', 25: '無障礙停車位',
  40: '穆斯林祈禱室', 41: '穆斯林淨下設備', 42: '穆斯林小淨設備',
  50: '3C充電服務', 51: '電動車充電服務', 52: '簡易急救箱', 53: '輪椅借用',
  54: '老花眼鏡借用', 55: '手杖借用', 56: '嬰兒車借用', 57: '手搖車借用',
  58: '雨具借用', 59: '吹風機借用', 60: '自行車簡易維修工具', 61: '充氣設備',
  254: '其他',
}

/** 文化資產級別 `AssetsClassEnum`。 */
export const TDX_ASSETS_CLASS: Record<number, string> = {
  0: '非屬文化資產', 1: '國定', 2: '直轄市定', 3: '縣(市)定',
  4: '重要', 5: '一般', 9: '其他',
}

// ── 類型代碼 → Navigator category ─────────────────────────────────────────
// 放在型別檔（無 import 的葉節點）而非 mapper，是為了讓 canonical-poi 也能用它
// 而不造成 canonical-poi ↔ tdx-mapper 的循環相依。

export const TDX_ATTRACTION_CLASS_TO_CATEGORY: Record<number, string> = {
  1: '歷史文化',  2: '自然景觀',  3: '歷史文化',  4: '歷史文化',
  5: '藝術展館',  6: '購物',      7: '自然景觀',  8: '自然景觀',
  9: '休閒體驗',  10: '溫泉',     11: '自然景觀', 12: '休閒體驗',
  13: '運動健身', 14: '觀光工廠', 15: '自然景觀', 16: '自然景觀',
  17: '自然景觀', 18: '自然景觀', 19: '自然景觀', 20: '休閒體驗',
  21: '歷史文化', 22: '歷史文化', 23: '景點',     24: '自然景觀',
  25: '藝術展館', 26: '藝術展館', 27: '休閒體驗', 254: '景點',
}

/**
 * 一筆景點可以同時掛多個類型代碼（實測常見 2–3 個），所以要有決定性的挑選順序，
 * 否則同一筆資料重跑會拿到不同 category。原則是**具體的場所類型優先於大範圍的
 * 地理分區**——「陽明山國家公園裡的美術館」該歸藝文場館，不該歸國家公園。
 */
const CLASS_PRIORITY: number[] = [
  10, 14, 25, 5, 26, 27, 6, 13, 9, 20,   // 具體場所／設施
  3, 4, 21, 22, 23,                       // 文化人文（具體）
  16, 7, 8, 17, 18, 15, 19, 24, 11, 2,    // 地理／自然分區
  // 最後才輪到兩個包山包海的類別。官方對它們的定義分別是「提供旅客休閒遊憩之
  // 場域」與「提供旅客文化相關內涵之場域」——幾乎所有景點都符合，先比對到就會
  // 淹掉真正有資訊量的分類。實例：某地同時掛 [11 自然風景, 12 遊憩] 時，
  // 該歸「自然景觀」而不是「休閒體驗」。
  12, 1,
  254,
]

export function categoryFromClasses(classes: number[] | null | undefined): string {
  if (!classes?.length) return '景點'
  for (const code of CLASS_PRIORITY) {
    if (classes.includes(code)) return TDX_ATTRACTION_CLASS_TO_CATEGORY[code] ?? '景點'
  }
  return '景點'
}

// ── Attraction（景點；舊 ScenicSpot）──────────────────────────────────────

export interface TdxAttraction {
  AttractionID?:       string | null
  AttractionName?:     string | null
  AlternateNames?:     string[] | null
  Description?:        string | null
  PositionLat:         number
  PositionLon:         number
  Geometry?:           string | null
  AttractionClasses?:  number[] | null
  PostalAddress?:      TdxPostalAddress | null
  Telephones?:         TdxTelephone[] | null
  Images?:             TdxImage[] | null
  Organizations?:      TdxOrganization[] | null
  ServiceTimeInfo?:    string | null
  TrafficInfo?:        string | null
  /** 停車資訊。⚠️ 舊版 `ParkingPosition` 是**座標**，新版只剩自由文字。 */
  ParkingInfo?:        string | null
  Facilities?:         number[] | null
  ServiceStatus?:      number | null
  IsPublicAccess?:     number | null
  IsAccessibleForFree?: number | null
  FeeInfo?:            string | null
  PaymentMethods?:     string[] | null
  LocatedCities?:      TdxLocatedCity[] | null
  WebsiteUrl?:         string | null
  ReservationURLs?:    string[] | null
  MapURLs?:            string[] | null
  SameAsURLs?:         string[] | null
  SocialMediaURLs?:    TdxSocialMediaUrl[] | null
  /** 官方建議停留分鐘數。⚠️ 實測填充率 0%，現階段仍要靠 LLM 推。 */
  VisitDuration?:      number | null
  AssetsClass?:        number | null
  Tags?:               string[] | null
  Remarks?:            string | null
  UpdateTime?:         string | null
}

// ── Restaurant（餐飲）──────────────────────────────────────────────────────

export interface TdxRestaurant {
  RestaurantID?:    string | null
  RestaurantName?:  string | null
  AlternateNames?:  string[] | null
  Description?:     string | null
  PositionLat:      number
  PositionLon:      number
  CuisineClasses?:  number[] | null
  PostalAddress?:   TdxPostalAddress | null
  Telephones?:      TdxTelephone[] | null
  Images?:          TdxImage[] | null
  Organizations?:   TdxOrganization[] | null
  ServiceTimeInfo?: string | null
  TrafficInfo?:     string | null
  ParkingInfo?:     string | null
  Facilities?:      number[] | null
  ServiceStatus?:   number | null
  PaymentMethods?:  string[] | null
  LocatedCities?:   TdxLocatedCity[] | null
  WebsiteUrl?:      string | null
  ReservationURLs?: string[] | null
  RestaurantFeatures?: number[] | null
  Remarks?:         string | null
  UpdateTime?:      string | null
}

// ── Hotel（旅宿）──────────────────────────────────────────────────────────

export interface TdxHotel {
  HotelID?:         string | null
  HotelName?:       string | null
  HotelLicenseNumber?: string | null
  AlternateNames?:  string[] | null
  Description?:     string | null
  PositionLat:      number
  PositionLon:      number
  HotelClasses?:    number[] | null
  HotelStars?:      number | null
  PostalAddress?:   TdxPostalAddress | null
  Telephones?:      TdxTelephone[] | null
  Images?:          TdxImage[] | null
  Organizations?:   TdxOrganization[] | null
  ServiceTimeInfo?: string | null
  TrafficInfo?:     string | null
  ParkingInfo?:     string | null
  Facilities?:      number[] | null
  ServiceStatus?:   number | null
  PaymentMethods?:  string[] | null
  LocatedCities?:   TdxLocatedCity[] | null
  WebsiteUrl?:      string | null
  ReservationURLs?: string[] | null
  ServiceInfo?:     string | null
  TotalRooms?:      number | null
  LowestPrice?:     number | null
  /** 無障礙客房數。與 Facilities 20–25 一樣是無障礙訊號，但這個是數量。 */
  AccessibleRooms?: number | null
  ParkingSpaces?:   number | null
  Remarks?:         string | null
  UpdateTime?:      string | null
}

// ── Event（活動；舊 Activity）─────────────────────────────────────────────

export interface TdxEvent {
  EventID?:         string | null
  EventName?:       string | null
  AlternateNames?:  string[] | null
  Description?:     string | null
  PositionLat:      number
  PositionLon:      number
  EventClasses?:    number[] | null
  PostalAddress?:   TdxPostalAddress | null
  Telephones?:      TdxTelephone[] | null
  Images?:          TdxImage[] | null
  Organizations?:   TdxOrganization[] | null
  TrafficInfo?:     string | null
  ParkingInfo?:     string | null
  Facilities?:      number[] | null
  IsAccessibleForFree?: number | null
  FeeInfo?:         string | null
  PaymentMethods?:  string[] | null
  LocatedCities?:   TdxLocatedCity[] | null
  WebsiteUrl?:      string | null
  ReservationURLs?: string[] | null
  Participant?:     string | null
  StartDateTime?:   string | null
  EndDateTime?:     string | null
  EventStatus?:     string | null
  Tags?:            string[] | null
  Remarks?:         string | null
  UpdateTime?:      string | null
}

// ── 統合 ──────────────────────────────────────────────────────────────────

/** 本專案支援的四類實體。TDX 另有 Trail / CyclingRoute / TourismServiceSite，暫不接。 */
export type TdxEntityType = 'Attraction' | 'Restaurant' | 'Hotel' | 'Event'

export type TdxEntity = TdxAttraction | TdxRestaurant | TdxHotel | TdxEvent

// ── API 回應外殼 ──────────────────────────────────────────────────────────

export interface TdxTokenResponse {
  access_token: string
  expires_in:   number
  token_type:   string
}

/** OData 回應包在 `{ value: [...] }`；保留 `data` 以相容舊格式。 */
export interface TdxApiResponse<T> {
  value?: T[]
  data?:  T[]
}
