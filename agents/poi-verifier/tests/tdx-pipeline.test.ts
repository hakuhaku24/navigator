/**
 * TDX Pipeline 單元測試
 *
 * 執行：npx ts-node tests/tdx-pipeline.test.ts
 *
 * 涵蓋：
 *   1. TDX_CLASS_TO_CATEGORY 分類對映完整性
 *   2. mapTdxScenicSpot 欄位正確性（含 deriveCity 修正 City 不可靠）
 *   4. mapTdxRestaurant 欄位正確性
 *   5. mapTdxActivity 欄位正確性
 *   6. mapTdxHotel 欄位正確性
 *   7. inferIsIndoor 啟發式推斷
 *   8. inferWeatherSensitivity 啟發式推斷
 *   9. 空值/缺欄位的邊界條件
 *  10. mapTdxEntity 統一對映入口
 */

import {
  mapTdxScenicSpot,
  mapTdxRestaurant,
  mapTdxHotel,
  mapTdxActivity,
  mapTdxEntity,
  inferIsIndoor,
  inferWeatherSensitivity,
  TDX_CLASS_TO_CATEGORY,
} from '../src/tdx-mapper'
import type { TdxScenicSpot, TdxRestaurant, TdxHotel, TdxActivity } from '../src/tdx-types'

// ── 簡易斷言工具 ──────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ✅  ${label}`)
    passed++
  } else {
    console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`)
}

// ── 測試夾具（TDX_SCHEMA_COMPARISON.md 中真實 API 回應的精簡版）──────────

const SCENIC_SPOT: TdxScenicSpot = {
  ScenicSpotID:      'C1_376420000A_000253',
  ScenicSpotName:    '石牌縣界公園',
  DescriptionDetail: '宜蘭與台北的交界公園，設有涼亭與步道，全年開放。',
  Description:       '石牌縣界公園',
  Phone:             '886-3-9312152',
  Address:           '宜蘭縣261頭城鎮北宜公路56.5km處',
  ZipCode:           '261',
  OpenTime:          '全年開放',
  TravelInfo:        '國道5號頭城交流道下，往宜蘭方向行駛。',
  Class1:            '自然風景類',
  Class2:            null,
  Class3:            null,
  Keyword:           '登山,步道,縣界',
  WebsiteUrl:        'https://example.gov.tw/park',
  Picture:           {
    PictureUrl1:         'https://example.com/pic1.jpg',
    PictureDescription1: '公園外觀',
    PictureUrl2:         'https://example.com/pic2.jpg',
    PictureDescription2: '步道景色',
  },
  Position:          { PositionLon: 121.775, PositionLat: 24.865, GeoHash: 'wsqt7nd1f' },
  City:              '新北市',   // ⚠️ TDX 真實會標錯（此點實際在宜蘭）→ 用來測 deriveCity 以 zip 修正
  SrcUpdateTime:     '2026-06-25T01:41:46+08:00',
  UpdateTime:        '2026-06-25T02:31:56+08:00',
}

const RESTAURANT: TdxRestaurant = {
  RestaurantID:   'C3_382000000A_206113',
  RestaurantName: '旺角迷你石頭火鍋',
  Description:    '提供多種口味石頭火鍋，適合家庭聚餐。',
  Address:        '新北市241三重區正義南路2-1號',
  ZipCode:        '241',
  Phone:          '886-2-29747815',
  OpenTime:       '11:30 ~ 23:30 (過年休除夕~初二)',
  Class:          '其他',
  City:           '新北市',
  Picture:        { PictureUrl1: 'https://example.com/restaurant.jpg', PictureDescription1: '用餐環境' },
  Position:       { PositionLon: 121.498, PositionLat: 25.062, GeoHash: 'wsqqsf2ht' },
  SrcUpdateTime:  '2026-06-25T01:44:16+08:00',
  UpdateTime:     '2026-06-25T02:31:56+08:00',
}

const HOTEL: TdxHotel = {
  HotelID:      'C4_A15010000H_000133',
  HotelName:    '萬金龍民宿',
  Description:  '位於新北市的民宿，提供溫泉與寵物友善服務。',
  Address:      '新北市萬里區萬里加投45之6號',
  ZipCode:      '207',
  Phone:        '886-2-24986166',
  Fax:          '886-2-24986155',
  Class:        '民宿',
  ServiceInfo:  '無線網路,溫泉設施,寵物友善旅宿,停車場',
  ParkingInfo:  '小客車20輛',
  City:         '新北市',
  Picture:      { PictureUrl1: 'https://example.com/hotel.jpg', PictureDescription1: '外觀' },
  Position:     { PositionLon: 121.639, PositionLat: 25.211, GeoHash: 'wsqrrvrpe' },
  SrcUpdateTime:'2026-06-25T01:46:21+08:00',
  UpdateTime:   '2026-06-25T02:31:56+08:00',
}

const ACTIVITY: TdxActivity = {
  ActivityID:   'C2_382000000A_003248',
  ActivityName: '2025文資新生活｜新店十四張歷史建築園區',
  Description:  '結合文化資產與社區活化的年度展覽。',
  Location:     '新北市新店區央北二路206巷6號',
  Address:      '新北市231新店區央北二路206巷6號',
  Phone:        '886-2-29603456',
  Organizer:    '新北市政府文化局',
  StartTime:    '2025-03-15T00:00:00+08:00',
  EndTime:      '2025-12-31T23:59:59+08:00',
  Class1:       '年度活動',
  City:         '新北市',
  Picture:      {},
  Position:     { PositionLon: 121.527, PositionLat: 24.980, GeoHash: 'wsqqj7t9d' },
  SrcUpdateTime:'2026-06-25T01:43:58+08:00',
  UpdateTime:   '2026-06-25T02:31:56+08:00',
}

// ──────────────────────────────────────────────────────────────────────────

section('1. TDX_CLASS_TO_CATEGORY 分類對映')
const expectedMappings: Array<[string, string]> = [
  ['自然風景類', '自然景觀'],
  ['生態類',     '自然景觀'],
  ['古蹟類',     '歷史文化'],
  ['藝術類',     '藝術展館'],
  ['藝文設施類', '藝術展館'],
  ['觀光工廠類', '觀光工廠'],
  ['溫泉類',     '溫泉'],
  ['遊憩類',     '休閒體驗'],
  ['運動健身類', '運動健身'],
  ['購物類',     '購物'],
  ['飲食類',     '餐飲'],
]
for (const [tdxClass, expected] of expectedMappings) {
  assert(
    TDX_CLASS_TO_CATEGORY[tdxClass] === expected,
    `"${tdxClass}" → "${expected}"`,
    `got "${TDX_CLASS_TO_CATEGORY[tdxClass]}"`,
  )
}

section('2. mapTdxScenicSpot 欄位對映')
const spot = mapTdxScenicSpot(SCENIC_SPOT)
assert(spot.poiInput.name           === '石牌縣界公園',          'name 正確')
assert(spot.poiInput.location.latitude  === 24.865,               'lat 正確')
assert(spot.poiInput.location.longitude === 121.775,              'lng 正確')
assert(spot.poiInput.website_url    === 'https://example.gov.tw/park', 'website_url 正確')
assert(spot.region                  === '宜蘭縣',  'region 用 zip261 修正（City 標新北但實際宜蘭）')
assert(spot.zipCode                 === '261',     'zipCode 保留')
assert(spot.category                === '自然景觀',               'category 對映 自然風景類 → 自然景觀')
assert(spot.tdxId                   === 'C1_376420000A_000253',   'tdxId 保留原始值')
assert(spot.sourceId.startsWith('TDX-SS-'),                       'sourceId 前綴 TDX-SS-')
assert(spot.imageUrl                === 'https://example.com/pic1.jpg', 'imageUrl 取 PictureUrl1')
assert(spot.address                 === '宜蘭縣261頭城鎮北宜公路56.5km處', 'address 正確')
assert(spot.openTime                === '全年開放',               'openTime 正確')
assert(spot.preliminaryTags.includes('自然風景類'),               'tags 含 Class1')
assert(spot.preliminaryTags.includes('登山'),                     'tags 含 Keyword 拆分結果')
assert(spot.preliminaryTags.includes('自然景觀'),                 'tags 含 Navigator category')
assert(
  (spot.poiInput.user_description ?? '').includes('開放時間：全年開放'),
  'user_description 含 OpenTime',
)
assert(
  (spot.poiInput.user_description ?? '').includes('交通資訊：'),
  'user_description 含 TravelInfo（前 200 字）',
)
assert(spot.entityType === 'ScenicSpot', 'entityType 正確')
assert(spot.phone      === '03-9312152',                          'phone 清洗 886-3 → 03')
assert(spot.travelInfo === '國道5號頭城交流道下，往宜蘭方向行駛。', 'travelInfo 保留')
assert(spot.imageUrls.length         === 2,                       'imageUrls 含 PictureUrl1 + PictureUrl2')
assert(spot.imageUrls[0]             === 'https://example.com/pic1.jpg', 'imageUrls[0] = PictureUrl1')
assert(spot.imageUrls[1]             === 'https://example.com/pic2.jpg', 'imageUrls[1] = PictureUrl2')

section('4. mapTdxRestaurant 欄位對映')
const rest = mapTdxRestaurant(RESTAURANT)
assert(rest.poiInput.name           === '旺角迷你石頭火鍋',       'name 正確')
assert(rest.poiInput.location.latitude  === 25.062,               'lat 正確')
assert(rest.poiInput.location.longitude === 121.498,              'lng 正確')
assert(rest.region                  === '新北市',                 'region 用 zip241 → 新北市')
assert(rest.category                === '餐飲',                   'category 是 餐飲')
assert(rest.openTime                === '11:30 ~ 23:30 (過年休除夕~初二)', 'openTime 正確')
assert(rest.address                 === '新北市241三重區正義南路2-1號',    'address 正確')
assert(rest.imageUrl                === 'https://example.com/restaurant.jpg', 'imageUrl 正確')
assert(rest.imageUrls.length        === 1,                        'imageUrls 含 1 張圖片')
assert(rest.phone                   === '02-29747815',            'phone 清洗 886-2 → 02')
assert(rest.travelInfo              === null,                     'travelInfo 為 null（餐廳無此欄位）')
assert(rest.poiInput.website_url    === undefined,                'website_url 為 undefined（餐廳無此欄位）')
assert(
  (rest.poiInput.user_description ?? '').includes('營業時間：'),
  'user_description 含 OpenTime 格式',
)
assert(rest.entityType === 'Restaurant', 'entityType 正確')

section('5. mapTdxHotel 欄位對映')
const hotel = mapTdxHotel(HOTEL)
assert(hotel.poiInput.name          === '萬金龍民宿',              'name 正確')
assert(hotel.region                 === '新北市',                 'region 用 zip207 → 新北市')
assert(hotel.category               === '旅宿',                   'category 是 旅宿')
assert(hotel.preliminaryTags.includes('民宿'),                    'tags 含 Class')
assert(hotel.preliminaryTags.includes('無線網路'),                 'tags 含 ServiceInfo 拆分結果')
assert(hotel.preliminaryTags.includes('溫泉設施'),                 'tags 含 ServiceInfo 溫泉設施')
assert(hotel.openTime               === null,                     'Hotel 沒有 openTime')
assert(hotel.phone                  === '02-24986166',            'phone 清洗 886-2 → 02')
assert(hotel.travelInfo             === null,                     'travelInfo 為 null（旅宿無此欄位）')
assert(hotel.entityType             === 'Hotel',                  'entityType 正確')

section('6. mapTdxActivity 欄位對映')
const act = mapTdxActivity(ACTIVITY)
assert(act.poiInput.name           === '2025文資新生活｜新店十四張歷史建築園區', 'name 正確')
assert(act.region                  === '新北市',                  'region 用 Address → 新北市')
assert(act.category                === '活動',                    'category 是 活動')
assert(act.openTime                === null,                      'Activity 的 openTime 是 null（用 StartTime/EndTime 替代）')
assert(act.phone                   === '02-29603456',             'phone 清洗 886-2 → 02')
assert(act.travelInfo              === null,                      'travelInfo 為 null（活動無此欄位）')
assert(act.imageUrls.length        === 0,                         'imageUrls 為空（Picture: {} 無 URL）')
assert(
  (act.poiInput.user_description ?? '').includes('活動期間：2025-03-15 ～ 2025-12-31'),
  'user_description 含活動期間',
)
assert(act.entityType              === 'Activity',                'entityType 正確')

section('7. inferIsIndoor 啟發式推斷')
assert(inferIsIndoor('藝術類')     === true,  '"藝術類" → 室內')
assert(inferIsIndoor('藝文設施類') === true,  '"藝文設施類" → 室內')
assert(inferIsIndoor('觀光工廠類') === true,  '"觀光工廠類" → 室內')
assert(inferIsIndoor('購物類')     === true,  '"購物類" → 室內')
assert(inferIsIndoor('自然風景類') === false, '"自然風景類" → 戶外')
assert(inferIsIndoor('生態類')     === false, '"生態類" → 戶外')
assert(inferIsIndoor(null)         === false, 'null → 戶外（預設）')
assert(inferIsIndoor(undefined)    === false, 'undefined → 戶外（預設）')

section('8. inferWeatherSensitivity 啟發式推斷')
assert(inferWeatherSensitivity('自然風景類') === 'high',   '"自然風景類" → high')
assert(inferWeatherSensitivity('生態類')     === 'high',   '"生態類" → high')
assert(inferWeatherSensitivity('藝術類')     === 'low',    '"藝術類" → low')
assert(inferWeatherSensitivity('觀光工廠類') === 'low',    '"觀光工廠類" → low')
assert(inferWeatherSensitivity('古蹟類')     === 'medium', '"古蹟類" → medium')
assert(inferWeatherSensitivity(null)         === 'medium', 'null → medium（預設）')

section('9. 邊界條件：缺欄位景點')
const minimalSpot: TdxScenicSpot = {
  ScenicSpotID:   'MIN-001',
  ScenicSpotName: '最簡景點',
  Position:       { PositionLon: 121.0, PositionLat: 24.0 },
}
const min = mapTdxScenicSpot(minimalSpot)
assert(min.poiInput.name           === '最簡景點',   'name 正確（無其他欄位）')
assert(min.region                  === '未知區域',   'City 缺失時 region = "未知區域"')
assert(min.category                === '景點',       'Class1 缺失時 category = "景點"（fallback）')
assert(min.imageUrl                === null,          'Picture 缺失時 imageUrl = null')
assert(min.address                 === null,          'Address 缺失時 address = null')
assert(min.openTime                === null,          'OpenTime 缺失時 openTime = null')
assert(min.poiInput.website_url    === undefined,     'WebsiteUrl 缺失時 website_url = undefined')
assert(min.poiInput.user_description === undefined,   '無描述時 user_description = undefined')
assert(min.phone                   === null,           'Phone 缺失時 phone = null')
assert(min.travelInfo              === null,           'TravelInfo 缺失時 travelInfo = null')
assert(min.imageUrls.length        === 0,              'Picture 缺失時 imageUrls = []')
assert(min.preliminaryTags.length  > 0,               'preliminaryTags 至少含 fallback category')

section('10. mapTdxEntity 統一入口')
const via = mapTdxEntity(SCENIC_SPOT, 'ScenicSpot')
assert(via.poiInput.name           === spot.poiInput.name,  'ScenicSpot 路由正確')
assert(via.entityType              === 'ScenicSpot',        'entityType 正確')
const viaRest = mapTdxEntity(RESTAURANT, 'Restaurant')
assert(viaRest.entityType          === 'Restaurant',        'Restaurant 路由正確')
const viaHotel = mapTdxEntity(HOTEL, 'Hotel')
assert(viaHotel.entityType         === 'Hotel',             'Hotel 路由正確')
const viaAct = mapTdxEntity(ACTIVITY, 'Activity')
assert(viaAct.entityType           === 'Activity',          'Activity 路由正確')

// ── 總結 ──────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(56))
console.log(`  TDX Pipeline 測試完成`)
console.log(`  通過 ${passed}，失敗 ${failed}，共 ${passed + failed} 項`)
console.log('═'.repeat(56) + '\n')

if (failed > 0) process.exit(1)
