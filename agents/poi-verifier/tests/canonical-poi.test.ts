/**
 * canonical-poi.test.ts — canonical 正規化驗證
 *
 * 重點：用真實撈到的 3 筆新北市 ScenicSpot（含邊界問題）驗證：
 *   - 石牌縣界公園：City=新北 但實際在宜蘭（zip 261）→ city 應推成宜蘭縣
 *   - 大棟山系步道：City=新北 但實際在桃園（zip 333）→ city 應推成桃園市
 *   - 平溪天燈：無 Address、無 Class1、有 Level、Picture 有圖 → 仍能靠 zip 226 推新北市
 *   + phone 髒資料、空 Picture、缺 Class1、metadata 預設等 edge case
 *
 * 執行：npx ts-node tests/canonical-poi.test.ts
 */

import {
  deriveCity, cityFromZip, cityFromAddress, cleanPhone, extractImages,
  categoryFromClass1, withMetadataDefaults, tdxScenicSpotToFacts, isUsablePoi, SMART_DEFAULTS,
} from '../src/canonical-poi'

let pass = 0, fail = 0
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}\n       got : ${g}\n       want: ${w}`) }
}

// ── 真實 3 筆（撈自 TDX live API 2026-06-30）────────────────────────────────
const 石牌 = {
  ScenicSpotID: 'C1_376420000A_000253', ScenicSpotName: '石牌縣界公園',
  DescriptionDetail: '北宜公路...石牌縣界公園，海拔538公尺...', Description: '北宜公路...',
  Phone: '886-3-9312152', Address: '宜蘭縣261頭城鎮北宜公路56.5km處', ZipCode: '261',
  OpenTime: '全年開放', Picture: {}, Position: { PositionLon: 121.775, PositionLat: 24.865 },
  Class1: '自然風景類', City: '新北市', SrcUpdateTime: '2026-06-29T02:19:21+08:00',
}
const 大棟山 = {
  ScenicSpotID: 'C1_376430000A_001274', ScenicSpotName: '大棟山系登山步道',
  DescriptionDetail: '登高望遠405高地...', Phone: '886-3-3322101',
  Address: '桃園市333龜山區兔坑里', ZipCode: '333', OpenTime: '全年無休',
  Picture: { PictureUrl1: 'https://travel.tycg.gov.tw/x.jpg' },
  Position: { PositionLon: 121.3, PositionLat: 24.9 }, Class1: '自然風景類',
  City: '新北市', SrcUpdateTime: '2026-06-29T02:19:21+08:00',
}
const 平溪天燈 = {
  ScenicSpotID: 'C1_379000000A_000117', ScenicSpotName: '平溪天燈',
  DescriptionDetail: '天，在民間習俗中是天宮的所在...', Phone: '886-2-29603456',
  ZipCode: '226', Picture: { PictureUrl1: 'https://www.travel.taipei/image/360790' },
  Position: { PositionLon: 121.738, PositionLat: 25.025 },
  WebsiteUrl: 'http://www.pingshi.com.tw/index.aspx', City: '新北市',
  SrcUpdateTime: '2026-06-29T02:19:21+08:00',
  // 注意：無 Address、無 Class1、無 OpenTime；有 Level（古蹟分級，應被忽略）
} as any

// ── 1. deriveCity：City 不可靠，要靠 zip/address 修正 ──────────────────────
console.log('\n[1] deriveCity（City 不可靠修正）')
eq('石牌：zip261 勝過 City新北 → 宜蘭縣', deriveCity('261', 石牌.Address, 石牌.City), '宜蘭縣')
eq('大棟山：zip333 → 桃園市',           deriveCity('333', 大棟山.Address, 大棟山.City), '桃園市')
eq('平溪：無Address 靠 zip226 → 新北市', deriveCity('226', undefined, '新北市'), '新北市')
eq('全無 zip/addr → 退回 City',          deriveCity(null, null, '新北市'), '新北市')
eq('全空 → null',                        deriveCity(null, null, null), null)
eq('台→臺 正規化',                       deriveCity(null, null, '台北市'), '臺北市')

// ── 2. cityFromZip：邊界 ─────────────────────────────────────────────────
console.log('\n[2] cityFromZip 邊界')
eq('261 → 宜蘭縣', cityFromZip('261'), '宜蘭縣')
eq('209 → 連江縣（夾在新北 zip 中間）', cityFromZip('209'), '連江縣')
eq('226 → 新北市', cityFromZip('226'), '新北市')
eq('"261xyz" 取前3碼', cityFromZip('261xyz'), '宜蘭縣')
eq('2碼非法 → null', cityFromZip('26'), null)
eq('字母 → null', cityFromZip('abc'), null)
eq('空 → null', cityFromZip(''), null)

// ── 3. cleanPhone：髒資料 ────────────────────────────────────────────────
console.log('\n[3] cleanPhone 清洗')
eq('886-3 → 03', cleanPhone('886-3-9312152'), '03-9312152')
eq('886-2 → 02', cleanPhone('886-2-29603456'), '02-29603456')
eq('886-886 重複 collapse', cleanPhone('886-886-836-56534'), '0836-56534')
eq('含空白', cleanPhone(' 886-2-1234567 '), '02-1234567')
eq('空字串 → null', cleanPhone(''), null)
eq('null → null', cleanPhone(null), null)

// ── 4. extractImages：空 Picture ──────────────────────────────────────────
console.log('\n[4] extractImages')
eq('{} → []', extractImages({}), [])
eq('null → []', extractImages(null), [])
eq('取非空 URL', extractImages({ PictureUrl1: 'a', PictureUrl2: '', PictureUrl3: 'c' }), ['a', 'c'])

// ── 5. categoryFromClass1：缺 / 不認得 → fallback ─────────────────────────
console.log('\n[5] categoryFromClass1')
eq('自然風景類 → 自然景觀', categoryFromClass1('自然風景類'), '自然景觀')
eq('缺 → 景點', categoryFromClass1(undefined), '景點')
eq('不認得 → 景點', categoryFromClass1('外星類'), '景點')

// ── 6. withMetadataDefaults：智能層補滿、出處省略 ─────────────────────────
console.log('\n[6] withMetadataDefaults')
const md = withMetadataDefaults({ weather_sensitivity: 'high', tdx_id: 'X' })
eq('level 補預設 2', md.level, 2)
eq('level_name 跟 level 對齊', md.level_name, '條件變動')
eq('weather 保留傳入', md.weather_sensitivity, 'high')
eq('reliability 補預設 0', md.reliability_score, SMART_DEFAULTS.reliability_score)
eq('tdx_id 有就放', md.tdx_id, 'X')
eq('sources 沒給 → 省略 key', 'sources' in md, false)

// ── 7. tdxScenicSpotToFacts：完整整筆 ────────────────────────────────────
console.log('\n[7] tdxScenicSpotToFacts 整筆')
const f1 = tdxScenicSpotToFacts(石牌)
eq('石牌 source_id', f1.source_id, 'TDX-SS-C1_376420000A_000253')
eq('石牌 city 修正成宜蘭縣', f1.city, '宜蘭縣')
eq('石牌 zip_code', f1.zip_code, '261')
eq('石牌 phone 清洗', f1.phone, '03-9312152')
eq('石牌 空Picture → images []', f1.images, [])
eq('石牌 category', f1.category, '自然景觀')
eq('石牌 lat/lng', [f1.lat, f1.lng], [24.865, 121.775])

const f3 = tdxScenicSpotToFacts(平溪天燈)
eq('平溪 無Address 靠zip → 新北市', f3.city, '新北市')
eq('平溪 無Class1 → category 景點', f3.category, '景點')
eq('平溪 有圖', f3.images, ['https://www.travel.taipei/image/360790'])
eq('平溪 無Address → address null', f3.address, null)
eq('平溪 phone 02', f3.phone, '02-29603456')
eq('平溪 無OpenTime → hours null', f3.hours, null)

// ── 8. isUsablePoi：守門（壞記錄過濾）────────────────────────────────────
console.log('\n[8] isUsablePoi 守門')
eq('正常筆 → 可用', isUsablePoi(f1), true)
eq('無名稱 → 不可用', isUsablePoi({ ...f1, name: '' }), false)
eq('無座標 → 不可用', isUsablePoi({ ...f1, lat: null }), false)

// ── 結果 ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}\n結果：${pass} 通過 / ${fail} 失敗`)
process.exit(fail > 0 ? 1 : 0)
