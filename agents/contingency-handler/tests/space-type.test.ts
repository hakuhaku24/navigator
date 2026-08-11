/**
 * B-1 的回歸測試：`space_type` 判定。
 *
 * 要證明三件事：
 *   1. **合併兩份重複實作後，沒有 OSM 標籤時的判定與舊版逐點相同**
 *      （既有 45 筆都沒有 osm_tags，所以這條就是「重構是安全的」的依據）
 *   2. OSM 標籤存在時會被優先採信，且 `source` 標記為有依據
 *   3. **標籤缺席不會被當成「戶外」的證據** —— 這是 is_indoor ?? false 的同型錯誤
 *
 * 跑法：npx ts-node tests/space-type.test.ts
 */

import { inferSpaceType, spaceTypeFields } from '../src/space-type'

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log('  ✅', msg) }
  else { failed++; console.error('  ❌', msg) }
}
function section(t: string) { console.log(`\n${t}`) }

/** 修改前的實作（兩份複本內容相同），逐點比對用 */
function legacyInferSpaceType(name: string, isIndoor: boolean): string {
  if (isIndoor) return 'indoor'
  const semiHints = ['寺', '宮', '亭', '車站', '碼頭', '驛', '商店街', '老街']
  if (semiHints.some(k => name.includes(k))) return 'semi_outdoor'
  return 'outdoor'
}

// ── [1] 與舊實作等價（無 OSM 標籤時）─────────────────────────────────────────

section('[1] 無 OSM 標籤時必須與舊實作逐點相同（重構安全性的依據）')

const REAL_NAMES = [
  '野柳地質公園', '老梅綠石槽', '富貴角燈塔', '朱銘美術館', '陽明書屋',
  '龜吼漁港', '擎天崗', '金山財神廟', '九份老街', '瑞芳車站',
  '阿妹茶樓', '基隆廟口夜市', '和平島公園', '神秘海岸', '中山樓',
  '國立海洋科技博物館', '白沙灣海水浴場', '象鼻岩', '南雅奇岩', '福隆海水浴場',
]
for (const name of REAL_NAMES) {
  for (const isIndoor of [true, false]) {
    const now = inferSpaceType({ name, is_indoor: isIndoor })
    const before = legacyInferSpaceType(name, isIndoor)
    assert(now.type === before, `${name}（is_indoor=${isIndoor}）→ ${now.type}（舊版 ${before}）`)
  }
}

// ── [2] OSM 標籤優先且標記為有依據 ───────────────────────────────────────────

section('[2] OSM 標籤存在時優先採信')

const covered = inferSpaceType({ name: '某廣場', is_indoor: false, osm_tags: { covered: 'yes' } })
assert(covered.type === 'semi_outdoor' && covered.source === 'osm_tag',
  `covered=yes → semi_outdoor（來源 ${covered.source}、依據 ${covered.evidence}）`)

const building = inferSpaceType({ name: '某中心', is_indoor: false, osm_tags: { building: 'yes' } })
assert(building.type === 'indoor' && building.source === 'osm_tag',
  `building=yes → indoor（來源 ${building.source}）`)

const museum = inferSpaceType({ name: '某館', is_indoor: false, osm_tags: { tourism: 'museum' } })
assert(museum.type === 'indoor' && museum.source === 'osm_tag',
  `tourism=museum → indoor（來源 ${museum.source}）`)

const beach = inferSpaceType({ name: '某灣', is_indoor: false, osm_tags: { natural: 'beach' } })
assert(beach.type === 'outdoor' && beach.source === 'osm_tag',
  `natural=beach → outdoor（**有依據的戶外**，來源 ${beach.source}）`)

// OSM 標籤要贏過名稱關鍵字：名字有「亭」但標籤說是公園
const conflict = inferSpaceType({ name: '涼亭公園', is_indoor: false, osm_tags: { leisure: 'park' } })
assert(conflict.type === 'outdoor' && conflict.source === 'osm_tag',
  `名稱含「亭」但 leisure=park → 採信標籤判 outdoor（先前會因名稱誤判 semi_outdoor）`)

// ── [2b] class/type 是主力訊號（第一版漏了，導致改變 0 筆）────────────────────

section('[2b] OSM class/type —— 真實景點實測值')

// 以下 class/type 全部取自 2026-08-04 對 Nominatim 的實際查詢結果
const REAL_CLASS_TYPE: [string, string, string, string][] = [
  // 名稱, class, type, 期望 space_type
  ['朱銘美術館', 'tourism', 'museum', 'indoor'],
  ['國立海洋科技博物館', 'tourism', 'museum', 'indoor'],
  ['本山五坑', 'tourism', 'museum', 'indoor'],
  ['草山行館', 'tourism', 'museum', 'indoor'],
  ['陽明書屋', 'building', 'yes', 'indoor'],
  ['中山樓', 'building', 'school', 'indoor'],
  ['阿妹茶樓', 'amenity', 'restaurant', 'indoor'],
  ['卯澳小吃', 'amenity', 'restaurant', 'indoor'],
  ['南雅奇岩', 'natural', 'stone', 'outdoor'],
  ['夢幻湖', 'natural', 'wetland', 'outdoor'],
  ['鼻頭角步道', 'highway', 'footway', 'outdoor'],
  ['麟山鼻木棧道', 'highway', 'trailhead', 'outdoor'],
]
for (const [name, cls, typ, want] of REAL_CLASS_TYPE) {
  // is_indoor 傳 null，才看得出 class/type 自己判不判得出來
  const r = inferSpaceType({ name, is_indoor: null, osm_class: cls, osm_type: typ })
  const ok = r.type === want && r.source === 'osm_tag'
  assert(ok, `${name}（${cls}/${typ}）→ ${r.type}/${r.source}，期望 ${want}/osm_tag`)
}

section('[2c] 判不出來的 class/type 不可硬給答案')
const generic = inferSpaceType({ name: '某景點', is_indoor: null, osm_class: 'tourism', osm_type: 'attraction' })
assert(generic.source !== 'osm_tag',
  `tourism/attraction 太籠統 → 不宣稱有依據（實際 ${generic.source}）`)
const historic = inferSpaceType({ name: '某遺址', is_indoor: null, osm_class: 'historic', osm_type: 'ruins' })
assert(historic.source !== 'osm_tag',
  `historic/ruins 可能室內可能戶外 → 不硬判（實際 ${historic.source}）`)

section('[2d] class/type 與 extratags 的優先序')
// extratags 直接陳述遮蔽狀態，應勝過 class/type 的概括分類
const coveredMarket = inferSpaceType({
  name: '某市場', is_indoor: null,
  osm_class: 'natural', osm_type: 'stone',
  osm_tags: { covered: 'yes' },
})
assert(coveredMarket.type === 'semi_outdoor' && coveredMarket.evidence === 'covered=yes',
  `covered=yes 勝過 natural/stone（實際 ${coveredMarket.type}／依據 ${coveredMarket.evidence}）`)

// ── [3] 標籤缺席 ≠ 戶外（is_indoor ?? false 的同型錯誤）──────────────────────

section('[3] 標籤缺席不是否定證據')

// 野柳的真實 extratags（2026-08-04 實測）：只有 tourism=attraction / wikidata / wikipedia，
// 沒有任何 covered / shelter —— 但那只代表沒人填。
const yehliuReal = inferSpaceType({
  name: '野柳地質公園',
  is_indoor: false,
  osm_tags: { tourism: 'attraction', wikidata: 'Q716932', wikipedia: 'zh:野柳風景特定區' },
})
assert(yehliuReal.source !== 'osm_tag',
  `有標籤但無相關標籤 → 不可宣稱來源是 osm_tag（實際 ${yehliuReal.source}）`)
assert(yehliuReal.type === 'outdoor',
  `退回既有推測，結果仍是 outdoor（值不變，只是誠實標記為 ${yehliuReal.source}）`)

const emptyTags = inferSpaceType({ name: '慈天宮', is_indoor: false, osm_tags: {} })
assert(emptyTags.source === 'name_keyword' && emptyTags.type === 'semi_outdoor',
  `空標籤物件 → 退回名稱關鍵字（來源 ${emptyTags.source}）`)

const nullTags = inferSpaceType({ name: '無名景點', is_indoor: false, osm_tags: null })
assert(nullTags.source === 'default' && nullTags.type === 'outdoor',
  `標籤為 null 且名稱無線索 → default（**猜的**，不是查過的）`)

section('[3b] is_indoor 未判定不可當成 false')

const unknownIndoor = inferSpaceType({ name: '某咖啡廳', is_indoor: null, osm_tags: { amenity: 'cafe' } })
assert(unknownIndoor.type === 'indoor' && unknownIndoor.source === 'osm_tag',
  `is_indoor=null 但 amenity=cafe → 仍判 indoor（標籤補上了未判定的洞）`)

const unknownNoTag = inferSpaceType({ name: '某地方', is_indoor: null })
assert(unknownNoTag.source === 'default',
  `is_indoor=null 且無標籤 → default，來源如實標記（不是宣稱查過）`)

// ── [4] spaceTypeFields 三個欄位齊全 ─────────────────────────────────────────

section('[4] spaceTypeFields 不漏欄位')

const fields = spaceTypeFields({ name: '朱銘美術館', is_indoor: true })
assert(fields.space_type === 'indoor', 'space_type 有值')
assert(fields.space_type_source === 'is_indoor_flag', `space_type_source 有值（${fields.space_type_source}）`)
assert('space_type_evidence' in fields, 'space_type_evidence 欄位存在（可為 null）')

// ── 收尾 ────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(55)}`)
console.log(`通過 ${passed} 項，失敗 ${failed} 項`)
console.log('═'.repeat(55))
if (failed > 0) process.exitCode = 1
