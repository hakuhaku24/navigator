/**
 * TDX Pipeline 單元測試（2026-08-02 改版後）
 *
 * 執行：npx ts-node tests/tdx-pipeline.test.ts
 *
 * ⚠️ 本檔在 2026-08-02 全面重寫。舊版測的是已下架的 ScenicSpot 端點
 *    （Class1 中文字串、Picture 三張上限、ParkingPosition 座標），
 *    那些欄位新版 API 一個都不會回傳，測過也不代表匯入能動。
 *
 * 主要夾具 `MANYUEYUAN` 是**真實 API 回應**（2026-08-02 實打取得），
 * 不是手寫的理想資料——包含官方資料本身的矛盾（見 section 8）。
 *
 * 涵蓋：
 *   1. 類型代碼 → category（含多重代碼的決定性挑選）
 *   2. 類型/設施代碼 → 標籤
 *   3. 營運狀態代碼
 *   4. inferIsIndoor（重點：未判定要回 null，不可回 false）
 *   5. inferWeatherSensitivity
 *   6. 圖片 URL 與說明的索引對齊
 *   7. 電話與地址
 *   8. mapTdxAttraction（真實資料）
 *   9. mapTdxRestaurant / Hotel / Event
 *  10. 邊界條件
 *  11. mapTdxEntity 統一入口
 */

import {
  mapTdxAttraction,
  mapTdxRestaurant,
  mapTdxHotel,
  mapTdxEvent,
  mapTdxEntity,
  inferIsIndoor,
  inferWeatherSensitivity,
  categoryFromClasses,
  classTags,
  facilityTags,
  serviceStatusLabel,
  extractImageUrls,
  extractImageDescriptions,
  extractPhone,
  formatAddress,
  defaultStayMinutes,
  TDX_ATTRACTION_CLASS_TO_CATEGORY,
} from '../src/tdx-mapper'
import type { TdxAttraction, TdxRestaurant, TdxHotel, TdxEvent } from '../src/tdx-types'

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

// ── 測試夾具 ──────────────────────────────────────────────────────────────

/** 真實 API 回應（2026-08-02 實打 /Tourism/Attraction 取得，圖片裁到 2 張） */
const MANYUEYUAN: TdxAttraction = {
  AttractionID:      'Attraction_345040000G_000002',
  AttractionName:    '滿月圓國家森林遊樂區',
  AlternateNames:    [],
  Description:       '在三峽大豹溪的上游，一條叫做蚋子溪的支流上，座落著一個擁有瀑布、生態與楓紅的美麗小天地。',
  PositionLat:       24.8307811041726,
  PositionLon:       121.444585295549,
  Geometry:          null,
  AttractionClasses: [16],
  ServiceTimeInfo:   '',
  TrafficInfo:       '［開車前往］國道3號→三鶯交流道→縣道110線→三峽→省道台3線→大埔',
  ParkingInfo:       '大型車：100元，按次收費。小型車：100元，按次收費。',
  Facilities:        [],
  ServiceStatus:     1,
  IsPublicAccess:    1,
  IsAccessibleForFree: 0,
  FeeInfo:           '',
  PaymentMethods:    [],
  WebsiteUrl:        'https://recreation.forest.gov.tw/Forest/RA?typ_id=0200001',
  ReservationURLs:   ['https://forestpass.welcometw.com/tour/listAll?category=r6G'],
  VisitDuration:     null,
  AssetsClass:       null,
  Tags:              ['國家森林遊樂區', '瀑布', '登山', '賞蝶'],
  Remarks:           '',
  UpdateTime:        '2026-08-02T12:20:28+08:00',
  // ⚠️ 官方資料自身矛盾：Town/ZipCode 說八里區 249，StreetAddress 說三峽區。
  //    滿月圓實際在三峽區。保留原樣，因為測試要反映真實資料的樣子。
  PostalAddress:     {
    City: '新北市', CityCode: '65000',
    Town: '八里區', TownCode: '65000230',
    ZipCode: '249', StreetAddress: '三峽區有木里有木174-1號',
  },
  Telephones:        [{ Tel: '(02)26720004', Ext: null }, { Tel: '(02)26720542', Ext: null }],
  Images: [
    { Name: '滿月圓蝴蝶',   Description: '照片提供｜新竹分署', URL: 'https://example.gov.tw/a.jpg', Width: null, Height: null, Keywords: [] },
    { Name: '滿月圓自導步道', Description: '照片提供｜新竹分署', URL: 'https://example.gov.tw/b.jpg', Width: null, Height: null, Keywords: [] },
  ],
  Organizations:     [],
  LocatedCities:     [{ Name: '園區涵蓋範圍', Class: 8, City: '新北市', CityCode: '65000', Town: '三峽區', TownCode: '65000090' }],
  SocialMediaURLs:   [],
  MapURLs:           [],
  SameAsURLs:        [],
}

const RESTAURANT: TdxRestaurant = {
  RestaurantID:    'Restaurant_382000000A_206113',
  RestaurantName:  '旺角迷你石頭火鍋',
  Description:     '提供多種口味石頭火鍋，適合家庭聚餐。',
  PositionLat:     25.062,
  PositionLon:     121.498,
  CuisineClasses:  [],
  PostalAddress:   { City: '新北市', Town: '三重區', ZipCode: '241', StreetAddress: '正義南路2-1號' },
  Telephones:      [{ Tel: '(02)29747815', Ext: null }],
  Images:          [{ URL: 'https://example.com/restaurant.jpg', Description: '用餐環境' }],
  ServiceTimeInfo: '11:30 ~ 23:30 (過年休除夕~初二)',
  ParkingInfo:     null,
  Facilities:      [1, 7],
  ServiceStatus:   1,
  UpdateTime:      '2026-08-02T02:31:56+08:00',
}

const HOTEL: TdxHotel = {
  HotelID:        'Hotel_A15010000H_000133',
  HotelName:      '萬金龍民宿',
  Description:    '位於新北市的民宿，提供溫泉與寵物友善服務。',
  PositionLat:    25.211,
  PositionLon:    121.639,
  HotelClasses:   [],
  PostalAddress:  { City: '新北市', Town: '萬里區', ZipCode: '207', StreetAddress: '萬里加投45之6號' },
  Telephones:     [{ Tel: '(02)24986166', Ext: 12 }],
  Images:         [{ URL: 'https://example.com/hotel.jpg', Description: '外觀' }],
  ServiceInfo:    '無線網路,溫泉設施,寵物友善旅宿,停車場',
  Facilities:     [10, 21],
  ServiceStatus:  1,
  AccessibleRooms: 2,
  UpdateTime:     '2026-08-02T02:31:56+08:00',
}

const EVENT: TdxEvent = {
  EventID:       'Event_382000000A_003248',
  EventName:     '2026文資新生活｜新店十四張歷史建築園區',
  Description:   '結合文化資產與社區活化的年度展覽。',
  PositionLat:   24.980,
  PositionLon:   121.527,
  EventClasses:  [1],
  PostalAddress: { City: '新北市', Town: '新店區', ZipCode: '231', StreetAddress: '央北二路206巷6號' },
  Telephones:    [{ Tel: '(02)29603456', Ext: null }],
  Images:        [],
  StartDateTime: '2026-03-15T00:00:00+08:00',
  EndDateTime:   '2026-12-31T23:59:59+08:00',
  EventStatus:   '正常舉行',
  Tags:          ['文化資產', '展覽'],
  UpdateTime:    '2026-08-02T01:43:58+08:00',
}

// ──────────────────────────────────────────────────────────────────────────

section('1. 類型代碼 → category')
const expectedCategories: Array<[number, string]> = [
  [11, '自然景觀'], [2, '自然景觀'], [10, '溫泉'],   [3, '歷史文化'],
  [4, '歷史文化'],  [5, '藝術展館'], [25, '藝術展館'], [14, '觀光工廠'],
  [9, '休閒體驗'],  [12, '休閒體驗'], [13, '運動健身'], [6, '購物'],
]
for (const [code, expected] of expectedCategories) {
  assert(
    TDX_ATTRACTION_CLASS_TO_CATEGORY[code] === expected,
    `代碼 ${code} → "${expected}"`,
    `got "${TDX_ATTRACTION_CLASS_TO_CATEGORY[code]}"`,
  )
}
// 多重代碼：必須有決定性的優先序，否則同一筆資料重跑會拿到不同 category
assert(categoryFromClasses([16, 25]) === '藝術展館', '森林遊樂區+藝文場館 → 藝文場館優先（具體場所勝過地理分區）')
assert(categoryFromClasses([25, 16]) === '藝術展館', '同上，且與代碼順序無關')
assert(categoryFromClasses([7, 5])   === '藝術展館', '國家公園+藝術類 → 藝術類優先')
assert(categoryFromClasses([11, 2])  === '自然景觀', '兩個自然類 → 自然景觀')
assert(categoryFromClasses([11, 12]) === '自然景觀', '自然風景+遊憩 → 自然景觀（遊憩類太籠統，排最後）')
assert(categoryFromClasses([1, 3])   === '歷史文化', '文化類+文化資產類 → 兩者都對映歷史文化')
assert(categoryFromClasses([12])     === '休閒體驗', '只有遊憩類時它仍然生效')
assert(categoryFromClasses([1])      === '歷史文化', '只有文化類時它仍然生效')
assert(categoryFromClasses([])       === '景點',     '空陣列 → fallback 景點')
assert(categoryFromClasses(null)     === '景點',     'null → fallback 景點')
assert(categoryFromClasses([999])    === '景點',     '不認得的代碼 → fallback 景點（不編造）')

section('2. 類型/設施代碼 → 標籤')
assert(classTags([16]).includes('森林遊樂區類'), 'classTags 譯出中文類型名')
assert(classTags([999]).length === 0,            'classTags 略過不認得的代碼')
assert(classTags(null).length === 0,             'classTags null → []')
assert(facilityTags([1, 7]).join(',') === '廁所,無線網路', 'facilityTags 譯出設施名')
assert(facilityTags([21]).includes('無障礙廁所'), 'facilityTags 涵蓋無障礙設施（代碼 20–25）')
assert(facilityTags([999]).length === 0,          'facilityTags 略過不認得的代碼')

section('3. 營運狀態代碼')
assert(serviceStatusLabel(0) === '永久停止',       '0 → 永久停止')
assert(serviceStatusLabel(1) === '正常營運',       '1 → 正常營運')
assert(serviceStatusLabel(3) === '暫時停止營運',   '3 → 暫時停止營運')
assert(serviceStatusLabel(9) === '營運狀態待確認', '9 → 待確認')
assert(serviceStatusLabel(null) === null,          'null → null')
assert(serviceStatusLabel(7) === null,             '不認得的代碼 → null（不可當成正常營運）')

section('4. inferIsIndoor：未判定必須是 null')
// 這一組是整個檔案最重要的部分。2026-05-06 那批 ingest 把「未判定」用 ?? false
// 補成「戶外」，造成 45 筆裡 41 筆 is_indoor=false，下雨應變在 2/3 區域無候選。
assert(inferIsIndoor([5])      === true,  '藝術類 → 室內')
assert(inferIsIndoor([14])     === true,  '觀光工廠類 → 室內')
assert(inferIsIndoor([25])     === true,  '藝文場館類 → 室內')
assert(inferIsIndoor([11])     === false, '自然風景類 → 戶外')
assert(inferIsIndoor([16])     === false, '森林遊樂區類 → 戶外')
assert(inferIsIndoor([6])      === null,  '商圈商店類 → null（百貨室內、老街露天，無法一概而論）')
assert(inferIsIndoor([26])     === null,  '生態場館類 → null（水族館室內、動物園露天）')
assert(inferIsIndoor([10])     === null,  '溫泉類 → null（湯屋室內、野溪露天）')
assert(inferIsIndoor([13])     === null,  '體育健身類 → null（體育館室內、步道露天）')
assert(inferIsIndoor([5, 16])  === null,  '同時掛室內與露天 → null（二選一必有一半是錯的）')
assert(inferIsIndoor([])       === null,  '空陣列 → null')
assert(inferIsIndoor(null)     === null,  'null → null')
assert(inferIsIndoor(undefined) === null, 'undefined → null')
assert((inferIsIndoor([6]) as unknown) !== false, '未判定不可以是 false（會被硬性篩選當成「確定是戶外」）')

section('5. inferWeatherSensitivity')
// 這裡刻意不回 null：medium 是量表上真實存在的中間值，不是把未知偽裝成已知
assert(inferWeatherSensitivity([11]) === 'high',   '自然風景類 → high')
assert(inferWeatherSensitivity([16]) === 'high',   '森林遊樂區類 → high')
assert(inferWeatherSensitivity([5])  === 'low',    '藝術類 → low')
assert(inferWeatherSensitivity([14]) === 'low',    '觀光工廠類 → low')
assert(inferWeatherSensitivity([3])  === 'medium', '文化資產類 → medium')
assert(inferWeatherSensitivity(null) === 'medium', 'null → medium（預設）')

section('6. 圖片 URL 與說明的索引對齊')
const imgs = [
  { URL: 'https://x/1.jpg', Description: '第一張' },
  { URL: '',                Description: '沒有 URL 的孤兒說明' },
  { URL: 'https://x/3.jpg' },
  { URL: 'https://x/4.jpg', Description: '第四張' },
]
const urls  = extractImageUrls(imgs)
const descs = extractImageDescriptions(imgs)
assert(urls.length === 3 && descs.length === 3, 'URL 與說明等長（空 URL 兩邊一起濾掉）')
assert(descs[0] === '第一張',    'index 0 對應第 1 張')
assert(descs[1] === '',          'index 1 是無說明的第 3 張，填空字串佔位')
assert(descs[2] === '第四張',    'index 2 對應第 4 張——孤兒說明沒有讓後面位移')
assert(urls[2] === 'https://x/4.jpg', 'URL 與說明指向同一張圖')
assert(extractImageUrls(null).length === 0,          'null → []')
assert(extractImageUrls([]).length === 0,            '[] → []')
assert(extractImageDescriptions(null).length === 0,  '說明 null → []')
assert(extractImageDescriptions([{ Name: '只有名字' }]).length === 0, '無 URL 的圖片不計入')

section('7. 電話與地址')
assert(extractPhone([{ Tel: '(02)26720004', Ext: null }]) === '02-26720004', '市話清洗')
assert(extractPhone([{ Tel: '(02)24986166', Ext: 12 }])   === '02-24986166#12', '分機以 # 接在後面')
assert(extractPhone([{ Tel: '', Ext: null }, { Tel: '(03)9312152' }]) === '03-9312152', '跳過空號取下一支')
assert(extractPhone([]) === null,   '空陣列 → null')
assert(extractPhone(null) === null, 'null → null')
assert(
  formatAddress({ City: '新北市', Town: '三峽區', StreetAddress: '有木里174-1號' }) === '新北市三峽區有木里174-1號',
  'PostalAddress 組回單行地址',
)
assert(formatAddress({ City: '新北市' }) === '新北市', '只有縣市也能組')
assert(formatAddress(null) === null,  'null → null')
assert(formatAddress({}) === null,    '空物件 → null')

section('8. mapTdxAttraction（真實 API 資料）')
const spot = mapTdxAttraction(MANYUEYUAN)
assert(spot.poiInput.name === '滿月圓國家森林遊樂區',      'name 正確')
assert(spot.poiInput.location.latitude === 24.8307811041726,  'lat 取自攤平後的 PositionLat')
assert(spot.poiInput.location.longitude === 121.444585295549, 'lng 取自攤平後的 PositionLon')
assert(spot.tdxId === 'Attraction_345040000G_000002',      'tdxId 保留原始值')
assert(spot.sourceId === 'TDX-AT-Attraction_345040000G_000002', 'sourceId 前綴 TDX-AT-')
assert(spot.entityType === 'Attraction',                   'entityType 正確')
assert(spot.category === '自然景觀',                        'AttractionClasses [16] → 自然景觀')
assert(spot.region === '新北市',                            'region 推導為新北市')
assert(spot.preliminaryTags.includes('森林遊樂區類'),        'tags 含類型代碼譯名')
assert(spot.preliminaryTags.includes('瀑布'),               'tags 含官方 Tags')
assert(spot.preliminaryTags.includes('自然景觀'),            'tags 含 Navigator category')
assert(spot.imageUrls.length === 2,                        'imageUrls 取兩張（新版無 3 張上限）')
assert(spot.imageDescriptions[0] === '照片提供｜新竹分署',   'imageDescriptions 帶出官方說明')
assert(spot.phone === '02-26720004',                       'phone 取第一支並清洗')
assert(spot.parkingInfo?.startsWith('大型車：100元') === true, 'parkingInfo 是文字（新版已無座標）')
assert(spot.serviceStatus === 1,                           'serviceStatus 保留代碼')
assert(spot.serviceStatusLabel === '正常營運',              'serviceStatusLabel 譯出中文')
assert(spot.isAccessibleForFree === 0,                     'isAccessibleForFree 保留 0（非免費）')
assert(spot.visitDuration === null,                        'VisitDuration 官方未給 → null')
assert(spot.openTime === null,                             'ServiceTimeInfo 是空字串 → null（不是空字串）')
assert(spot.travelInfo?.includes('國道3號') === true,       'travelInfo 取自 TrafficInfo')
assert(spot.tdxSrcUpdateTime === '2026-08-02T12:20:28+08:00', 'UpdateTime 帶出')
assert(
  (spot.poiInput.user_description ?? '').includes('交通資訊：'),
  'user_description 含交通資訊',
)
assert(
  !(spot.poiInput.user_description ?? '').includes('開放時間：'),
  'ServiceTimeInfo 為空時不加「開放時間：」空段落',
)
// 官方資料自身矛盾：縣市級推得出來，鄉鎮級不可信
assert(spot.region === '新北市', 'Town/ZipCode 與 StreetAddress 打架時，縣市級仍正確')
assert(spot.zipCode === '249',   'zipCode 原樣保留（即使它與 StreetAddress 的鄉鎮不符）')

section('9. mapTdxRestaurant / Hotel / Event')
const rest = mapTdxRestaurant(RESTAURANT)
assert(rest.poiInput.name === '旺角迷你石頭火鍋', 'Restaurant name 正確')
assert(rest.category === '餐飲',                  'Restaurant category 固定為餐飲')
assert(rest.region === '新北市',                  'Restaurant region 正確')
assert(rest.sourceId.startsWith('TDX-RS-'),       'Restaurant sourceId 前綴')
assert(rest.openTime === '11:30 ~ 23:30 (過年休除夕~初二)', 'Restaurant openTime 取 ServiceTimeInfo')
assert(rest.preliminaryTags.includes('無線網路'),  'Restaurant tags 含設施譯名')
assert(rest.isAccessibleForFree === null,          'Restaurant 無 IsAccessibleForFree → null')
assert(rest.address === '新北市三重區正義南路2-1號', 'Restaurant 地址組合正確')

const hotel = mapTdxHotel(HOTEL)
assert(hotel.poiInput.name === '萬金龍民宿',      'Hotel name 正確')
assert(hotel.category === '旅宿',                 'Hotel category 固定為旅宿')
assert(hotel.sourceId.startsWith('TDX-HT-'),      'Hotel sourceId 前綴')
assert(hotel.phone === '02-24986166#12',          'Hotel phone 含分機')
assert(hotel.preliminaryTags.includes('溫泉設施'), 'Hotel tags 含 ServiceInfo 拆分結果')
assert(hotel.preliminaryTags.includes('無障礙廁所'), 'Hotel tags 含設施代碼譯名')
assert(hotel.openTime === null,                   'Hotel 無 ServiceTimeInfo → null')

const evt = mapTdxEvent(EVENT)
assert(evt.poiInput.name.startsWith('2026文資新生活'), 'Event name 正確')
assert(evt.category === '活動',                   'Event category 固定為活動')
assert(evt.sourceId.startsWith('TDX-EV-'),        'Event sourceId 前綴')
assert(evt.serviceStatusLabel === '正常舉行',      'Event 用 EventStatus 字串而非數字代碼')
assert(evt.serviceStatus === null,                'Event 無數字 ServiceStatus → null')
assert(evt.imageUrls.length === 0,                'Event 無圖片 → []')
assert(
  (evt.poiInput.user_description ?? '').includes('活動期間：2026-03-15 ～ 2026-12-31'),
  'Event user_description 含活動期間',
)

section('10. 邊界條件：最簡記錄')
const minimal: TdxAttraction = {
  AttractionID:   'MIN-001',
  AttractionName: '最簡景點',
  PositionLat:    24.0,
  PositionLon:    121.0,
}
const min = mapTdxAttraction(minimal)
assert(min.poiInput.name === '最簡景點',       'name 正確（無其他欄位）')
assert(min.region === '未知區域',              '無 PostalAddress → region 未知區域')
assert(min.category === '景點',                '無 AttractionClasses → category 景點')
assert(min.imageUrl === null,                  '無 Images → imageUrl null')
assert(min.imageUrls.length === 0,             '無 Images → imageUrls []')
assert(min.imageDescriptions.length === 0,     '無 Images → imageDescriptions []')
assert(min.address === null,                   '無 PostalAddress → address null')
assert(min.phone === null,                     '無 Telephones → phone null')
assert(min.parkingInfo === null,               '無 ParkingInfo → null')
assert(min.serviceStatus === null,             '無 ServiceStatus → null（不可預設為正常營運）')
assert(min.serviceStatusLabel === null,        '無 ServiceStatus → label null')
assert(min.poiInput.user_description === undefined, '無描述 → user_description undefined')
assert(min.poiInput.website_url === undefined, '無 WebsiteUrl → undefined')
assert(min.preliminaryTags.length > 0,         'preliminaryTags 至少含 fallback category')
assert(defaultStayMinutes(min.category) === 90, '景點的預設停留時間有值')

section('11. mapTdxEntity 統一入口')
assert(mapTdxEntity(MANYUEYUAN, 'Attraction').entityType === 'Attraction', 'Attraction 路由正確')
assert(mapTdxEntity(RESTAURANT, 'Restaurant').entityType === 'Restaurant', 'Restaurant 路由正確')
assert(mapTdxEntity(HOTEL, 'Hotel').entityType === 'Hotel',                'Hotel 路由正確')
assert(mapTdxEntity(EVENT, 'Event').entityType === 'Event',                'Event 路由正確')
assert(
  mapTdxEntity(MANYUEYUAN, 'Attraction').poiInput.name === spot.poiInput.name,
  '統一入口與直接呼叫結果一致',
)

// ── 總結 ──────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(56))
console.log(`  TDX Pipeline 測試完成`)
console.log(`  通過 ${passed}，失敗 ${failed}，共 ${passed + failed} 項`)
console.log('═'.repeat(56) + '\n')

if (failed > 0) process.exit(1)
