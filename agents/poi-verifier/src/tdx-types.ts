// TDX 觀光 API — TypeScript 型別定義
// 端點前綴：https://tdx.transportdata.tw/api/basic/v2/Tourism/
// 驗證日期：2026-06-25（Live API 實際回應）

export interface TdxPosition {
  PositionLon: number
  PositionLat: number
  GeoHash?: string | null
}

export interface TdxPicture {
  PictureUrl1?: string | null
  PictureDescription1?: string | null
  PictureUrl2?: string | null
  PictureDescription2?: string | null
  PictureUrl3?: string | null
  PictureDescription3?: string | null
}

// ── ScenicSpot（景點）──────────────────────────────────────────────────────

export interface TdxScenicSpot {
  ScenicSpotID:      string
  ScenicSpotName:    string
  DescriptionDetail?: string | null
  Description?:      string | null
  Phone?:            string | null
  Address?:          string | null
  ZipCode?:          string | null
  OpenTime?:         string | null
  TravelInfo?:       string | null
  Class1?:           string | null
  Class2?:           string | null
  Class3?:           string | null
  Keyword?:          string | null
  WebsiteUrl?:       string | null
  Picture?:          TdxPicture | null
  Position:          TdxPosition
  ParkingPosition?:  TdxPosition | null
  City?:             string | null
  SrcUpdateTime?:    string | null
  UpdateTime?:       string | null
}

// ── Restaurant（餐廳）──────────────────────────────────────────────────────

export interface TdxRestaurant {
  RestaurantID:   string
  RestaurantName: string
  Description?:  string | null
  Address?:      string | null
  ZipCode?:      string | null
  Phone?:        string | null
  OpenTime?:     string | null
  Class?:        string | null
  City?:         string | null
  Picture?:      TdxPicture | null
  Position:      TdxPosition
  SrcUpdateTime?: string | null
  UpdateTime?:   string | null
}

// ── Hotel（旅宿）──────────────────────────────────────────────────────────

export interface TdxHotel {
  HotelID:      string
  HotelName:    string
  Description?: string | null
  Address?:     string | null
  ZipCode?:     string | null
  Phone?:       string | null
  Fax?:         string | null
  Class?:       string | null
  ServiceInfo?: string | null
  ParkingInfo?: string | null
  City?:        string | null
  Picture?:     TdxPicture | null
  Position:     TdxPosition
  SrcUpdateTime?: string | null
  UpdateTime?:  string | null
}

// ── Activity（活動）──────────────────────────────────────────────────────

export interface TdxActivity {
  ActivityID:   string
  ActivityName: string
  Description?: string | null
  Location?:    string | null
  Address?:     string | null
  Phone?:       string | null
  Organizer?:   string | null
  StartTime?:   string | null
  EndTime?:     string | null
  Class1?:      string | null
  City?:        string | null
  Picture?:     TdxPicture | null
  Position:     TdxPosition
  SrcUpdateTime?: string | null
  UpdateTime?:  string | null
}

export type TdxEntityType = 'ScenicSpot' | 'Restaurant' | 'Hotel' | 'Activity'
export type TdxEntity = TdxScenicSpot | TdxRestaurant | TdxHotel | TdxActivity

// ── OAuth2 token response ─────────────────────────────────────────────────

export interface TdxTokenResponse {
  access_token: string
  expires_in:   number
  token_type:   string
}

// ── OData API response wrapper ────────────────────────────────────────────

export interface TdxApiResponse<T> {
  data?:  T[]   // TDX v2 wraps result in `data` key
  value?: T[]   // some endpoints use `value` (OData 4.0 style)
}
