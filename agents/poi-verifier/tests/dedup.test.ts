/**
 * 跨來源去重的單元測試。
 *
 * 背景：`poi_catalog` 的唯一鍵是 `source_id`，所以同一個真實地點從兩個來源進來
 * （手動整理的 `NCA-010` 與 TDX 的 `TDX-AT-…109624`）會變成兩筆。
 * 2026-08-04 實際踩到兩次，四個地點（石門洞、朱銘美術館、野柳地質公園、法鼓山）
 * 都是靠人工比對名稱才發現，而刪掉後只要重跑匯入又會回來。
 *
 * 這批測試要守住的核心性質：**寧可漏判，不可誤判**。
 * 漏判 → 多一筆重複，看得見、可人工處理。
 * 誤判 → 兩個不同的地方被當成同一個，資料被靜默蓋掉，沒有人會發現。
 *
 * 跑法：npx ts-node tests/dedup.test.ts
 */

import {
  normalizePoiName, distanceMeters, DEDUP_DISTANCE_METERS,
} from '../src/canonical-poi'

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log('  ✅', msg) }
  else { failed++; console.error('  ❌', msg) }
}
function section(t: string) { console.log(`\n${t}`) }

// ── [1] 名稱正規化：同一地點的不同寫法要對得上 ───────────────────────────────

section('[1] 同一地點的不同寫法 → 正規化後相同')

const SAME: [string, string][] = [
  ['野柳地質公園', '野柳'],
  ['石門洞', '石門洞 '],
  ['朱銘美術館', '朱銘美術館'],
  ['北海岸及觀音山國家風景區', '北海岸及觀音山'],
  ['東北角及宜蘭海岸國家風景區', '東北角及宜蘭海岸'],
  ['陽明山國家公園_冷水坑', '陽明山國家公園冷水坑'], // TDX 用 _ 當分隔符
  ['紅樹林自然保留區', '紅樹林'],
  ['社子島環島與二重疏洪道自行車道', '社子島環島與二重疏洪道自行車道'],
]
for (const [a, b] of SAME) {
  assert(normalizePoiName(a) === normalizePoiName(b),
    `「${a}」≡「${b}」→ ${normalizePoiName(a)}`)
}

section('[1b] 刻意**不**處理的情況（處理了風險大於好處）')

// 括號內常是別名，但也常是分店／館別。剝掉括號內容會把
// 「福容大飯店(福隆)」與「福容大飯店(淡水)」合併成同一間，代價太高。
assert(
  normalizePoiName('紅毛城園區(新北市立淡水古蹟博物館)') !== normalizePoiName('新北市立淡水古蹟博物館'),
  '括號內的別名不剝除——剝了會讓「福容大飯店(福隆)」與「(淡水)」變同一間',
)

// 「鼻頭角」是岬角、「鼻頭角步道」是步道，可能是兩個不同的 POI；
// 而步道是線狀地物、中心點座標本來就任意，500 公尺的距離守門不一定擋得住。
assert(
  normalizePoiName('鼻頭角步道') !== normalizePoiName('鼻頭角'),
  '「步道」不移除——岬角與步道可能是不同 POI，且線狀地物的座標不可靠',
)

// ── [2] 不同地點不可被合併（誤判的代價最高）─────────────────────────────────

section('[2] 不同地點 → 正規化後必須不同')

const DIFFERENT: [string, string][] = [
  ['金山老街', '九份老街'],
  ['野柳地質公園', '野柳漁港'],
  ['朱銘美術館', '國立海洋科技博物館'],
  ['大屯山系_中正山步道', '大屯山系_軍艦岩親山步道'],
  ['淡水老街', '淡水漁人碼頭'],
  ['石門洞', '石門婚紗廣場'],
]
for (const [a, b] of DIFFERENT) {
  assert(normalizePoiName(a) !== normalizePoiName(b),
    `「${a}」≠「${b}」`)
}

section('[2b] 名稱相同但實際是不同地點的情況，靠距離擋下')
// 全台有多個「老街」「福德宮」，名稱比對一定會撞——所以判定必須是名稱＋距離雙條件
assert(normalizePoiName('福德宮') === normalizePoiName('福德宮'),
  '同名的「福德宮」正規化後相同（所以不能只看名稱）')
const 台北福德宮 = { lat: 25.033, lng: 121.565 }
const 宜蘭福德宮 = { lat: 24.757, lng: 121.753 }
assert(distanceMeters(台北福德宮, 宜蘭福德宮) > DEDUP_DISTANCE_METERS,
  `相距 ${Math.round(distanceMeters(台北福德宮, 宜蘭福德宮) / 1000)} km，遠超門檻 → 不會被誤判為同一個`)

// ── [3] 距離計算 ─────────────────────────────────────────────────────────────

section('[3] distanceMeters')

const 野柳 = { lat: 25.2065, lng: 121.6906 }
assert(distanceMeters(野柳, 野柳) === 0, '同一點距離為 0')

// 同一景點在不同來源被標在入口／停車場／中心點的誤差，應落在門檻內
const 野柳停車場 = { lat: 25.2040, lng: 121.6890 }
const d1 = distanceMeters(野柳, 野柳停車場)
assert(d1 < DEDUP_DISTANCE_METERS,
  `同景點的入口與中心點相距 ${Math.round(d1)} m < 門檻 ${DEDUP_DISTANCE_METERS} m → 判為同一個`)

// 相鄰但不同的景點應超過門檻
const 龜吼漁港 = { lat: 25.2028, lng: 121.6608 }
const d2 = distanceMeters(野柳, 龜吼漁港)
assert(d2 > DEDUP_DISTANCE_METERS,
  `野柳與龜吼漁港相距 ${Math.round(d2)} m > 門檻 → 不判為同一個`)

// 對稱性與已知距離的合理性
assert(Math.abs(distanceMeters(野柳, 龜吼漁港) - distanceMeters(龜吼漁港, 野柳)) < 0.001,
  '距離計算對稱')
const 台北101 = { lat: 25.0340, lng: 121.5645 }
const 高雄85 = { lat: 22.6127, lng: 120.3003 }
const km = distanceMeters(台北101, 高雄85) / 1000
assert(km > 280 && km < 320, `台北–高雄 ${km.toFixed(0)} km（實際約 300 km）`)

// ── [4] 邊界與防呆 ───────────────────────────────────────────────────────────

section('[4] 邊界')

assert(normalizePoiName('') === '', '空字串不拋錯')
assert(normalizePoiName(null as any) === '', 'null 不拋錯')
assert(normalizePoiName(undefined as any) === '', 'undefined 不拋錯')
// 尾綴只去一次、且只去尾巴——「步道」在中間不該被吃掉
assert(normalizePoiName('步道咖啡館') === '步道咖啡館', '尾綴詞出現在開頭不被移除')

// ── 收尾 ────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(55)}`)
console.log(`通過 ${passed} 項，失敗 ${failed} 項`)
console.log('═'.repeat(55))
if (failed > 0) process.exitCode = 1
