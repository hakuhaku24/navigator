import type { POI } from './types'

/**
 * `space_type` 判定 —— **本檔是唯一實作**。
 *
 * ## 為什麼要有這個檔案
 *
 * 在此之前這段邏輯**被複製成兩份**（`poi-adapter.ts` 與 `poi-catalog-client.ts`），
 * 關鍵字清單相同但各自獨立。只改一邊就會讓兩條路徑對同一個景點得出不同的
 * `space_type`，而型別完全相同、編譯器不會出聲——正是本 repo 反覆出事的形態。
 *
 * ## 為什麼這個值很重要
 *
 * `space_type` 決定期望值模型的 α（indoor 0.95 / semi_outdoor 0.50 / outdoor 0.10），
 * 是「下雨時該不該換掉這個景點」的核心參數。在 B-1 之前它是**用景點名稱關鍵字猜的**：
 * 名字裡有「寺、宮、亭、車站、碼頭、驛、商店街、老街」就當半戶外。
 *
 * ## 判定優先序
 *
 *   1. `is_indoor === true`      → indoor（驗證管線對「室內與否」的直接判斷）
 *   2. OSM 標籤有明確證據         → 依標籤
 *   3. 名稱關鍵字命中             → semi_outdoor（**猜的**，如實標記）
 *   4. 以上皆無                   → outdoor（保守預設，**也是猜的**）
 *
 * ⚠️ **OSM 標籤缺席不是否定證據**：沒有 `covered` 標籤只代表沒人填，
 * 不代表該地點沒有遮蔽。所以第 2 步只在標籤**存在**時才採信，
 * 不會因為「沒有 covered」就判定為戶外。
 *
 * ⚠️ 回傳的 `source` 必須一路帶到呈現層。數值可以保守借用，
 * 但不可以讓「猜的」看起來像「查過的」（SRS BFR20）。
 */

export type SpaceTypeSource =
  | 'osm_tag'        // OSM 貢獻者實際標註 —— 有依據
  | 'is_indoor_flag' // 驗證管線的 LLM 判斷 —— 有依據
  | 'name_keyword'   // 景點名稱關鍵字 —— 猜的
  | 'default'        // 什麼線索都沒有 —— 猜的

export interface SpaceTypeResult {
  type: POI['space_type']
  source: SpaceTypeSource
  /** 依據的標籤或關鍵字，供畫面說明「為什麼這樣判」 */
  evidence: string | null
}

/** 名稱關鍵字（沿用原有清單，行為不變，只是現在會標記為「猜的」） */
const SEMI_OUTDOOR_NAME_HINTS = ['寺', '宮', '亭', '車站', '碼頭', '驛', '商店街', '老街']

/** 有這些標籤＝有遮蔽 */
const COVERED_TAGS = ['covered', 'shelter', 'building', 'indoor']

/**
 * OSM `class`/`type` → 空間型態。**這是主力判定表。**
 *
 * ⚠️ 2026-08-04 實測 8 個真實景點後才發現：室內證據幾乎都在 class/type，
 * 不在 extratags。朱銘美術館是 `tourism/museum`（extratags 只有 fee、wikidata）、
 * 阿妹茶樓是 `amenity/restaurant`、陽明書屋是 `building/yes`、中山樓是 `building/school`。
 * 只看 extratags 的話這四筆全部判不出來——第一版就是這樣，改變 0 筆。
 *
 * `'*'` 代表該 class 底下任何 type 都適用。
 * **判不出來的組合刻意不列**（例如 `tourism/attraction`、`historic/*` 太籠統），
 * 讓它往下退回名稱推測並如實標記，而不是硬給一個答案。
 */
const CLASS_TYPE_SPACE: { class: string; types: string[] | '*'; space: POI['space_type'] }[] = [
  // ── 室內 ──
  { class: 'building', types: '*', space: 'indoor' },
  { class: 'shop', types: '*', space: 'indoor' },
  { class: 'tourism', types: ['museum', 'gallery', 'aquarium', 'hotel', 'hostel', 'guest_house', 'motel'], space: 'indoor' },
  { class: 'amenity', types: ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'food_court', 'ice_cream', 'library', 'theatre', 'cinema', 'arts_centre'], space: 'indoor' },
  { class: 'leisure', types: ['sports_centre', 'fitness_centre'], space: 'indoor' },
  // ── 半戶外（有遮蔽但不封閉）──
  // 台灣的寺廟多為「有頂的殿 ＋ 開放的埕」，與既有的名稱關鍵字（寺／宮）判定一致
  { class: 'amenity', types: ['place_of_worship', 'marketplace', 'shelter'], space: 'semi_outdoor' },
  { class: 'public_transport', types: '*', space: 'semi_outdoor' },
  // ── 戶外 ──
  { class: 'natural', types: '*', space: 'outdoor' },
  { class: 'waterway', types: '*', space: 'outdoor' },
  { class: 'leisure', types: ['park', 'garden', 'nature_reserve', 'playground', 'beach_resort'], space: 'outdoor' },
  // trailhead 是 2026-08-04 實測麟山鼻木棧道時才發現的值——沒有實跑就不會知道
  { class: 'highway', types: ['footway', 'path', 'track', 'cycleway', 'pedestrian', 'steps', 'trailhead', 'bridleway'], space: 'outdoor' },
  { class: 'tourism', types: ['viewpoint', 'picnic_site', 'camp_site', 'caravan_site'], space: 'outdoor' },
]

/** extratags 裡的 `key=value` 室內證據（少數景點會把這些放進 extratags） */
const INDOOR_TAG_VALUES: [string, string[]][] = [
  ['tourism', ['museum', 'gallery', 'aquarium']],
  ['amenity', ['cafe', 'restaurant', 'library', 'theatre', 'cinema']],
]

/** extratags 裡的 `key=value` 戶外證據 */
const OUTDOOR_TAG_VALUES: [string, string[]][] = [
  ['leisure', ['park', 'garden', 'nature_reserve']],
  ['tourism', ['viewpoint', 'picnic_site', 'camp_site']],
  ['natural', ['beach', 'peak', 'coastline', 'water', 'wood', 'cape']],
]

function fromClassType(cls: string | null | undefined, typ: string | null | undefined): SpaceTypeResult | null {
  if (!cls) return null
  const c = cls.trim().toLowerCase()
  const t = (typ ?? '').trim().toLowerCase()
  for (const rule of CLASS_TYPE_SPACE) {
    if (rule.class !== c) continue
    if (rule.types === '*' || rule.types.includes(t)) {
      return { type: rule.space, source: 'osm_tag', evidence: `${c}=${t || '*'}` }
    }
  }
  return null
}

function truthy(v: string | undefined): boolean {
  if (v === undefined) return false
  const s = v.trim().toLowerCase()
  return s !== '' && s !== 'no' && s !== 'false'
}

export interface SpaceTypeInput {
  name: string
  is_indoor: boolean | null | undefined
  /** OSM 主要特徵分類。**判定主力**，優先於 extratags 與名稱 */
  osm_class?: string | null
  osm_type?: string | null
  osm_tags?: Record<string, string> | null
}

export function inferSpaceType(input: SpaceTypeInput): SpaceTypeResult {
  const { name, is_indoor, osm_class, osm_type, osm_tags } = input

  // 1. 驗證管線已經直接判斷過「是不是室內」
  if (is_indoor === true) {
    return { type: 'indoor', source: 'is_indoor_flag', evidence: 'is_indoor=true' }
  }

  // 2. extratags 的遮蔽標籤（直接陳述有無遮蔽，最強證據）
  if (osm_tags) {
    for (const key of COVERED_TAGS) {
      if (truthy(osm_tags[key])) {
        // building / indoor 視為室內；covered / shelter 只保證有遮蔽 → 半戶外
        const type: POI['space_type'] =
          key === 'building' || key === 'indoor' ? 'indoor' : 'semi_outdoor'
        return { type, source: 'osm_tag', evidence: `${key}=${osm_tags[key]}` }
      }
    }
  }

  // 3. OSM class/type —— 實際上最常命中的一條
  const byClass = fromClassType(osm_class, osm_type)
  if (byClass) return byClass

  // 4. extratags 的 key=value（少數景點會把 tourism/amenity 放這裡）
  if (osm_tags) {
    for (const [key, values] of INDOOR_TAG_VALUES) {
      const v = osm_tags[key]
      if (v && values.includes(v.toLowerCase())) {
        return { type: 'indoor', source: 'osm_tag', evidence: `${key}=${v}` }
      }
    }
    for (const [key, values] of OUTDOOR_TAG_VALUES) {
      const v = osm_tags[key]
      if (v && values.includes(v.toLowerCase())) {
        return { type: 'outdoor', source: 'osm_tag', evidence: `${key}=${v}` }
      }
    }
  }

  // 5. 名稱關鍵字 —— 這是猜的
  const hit = SEMI_OUTDOOR_NAME_HINTS.find(k => name.includes(k))
  if (hit) {
    return { type: 'semi_outdoor', source: 'name_keyword', evidence: hit }
  }

  // 6. 保守預設 —— 也是猜的
  return { type: 'outdoor', source: 'default', evidence: null }
}

/**
 * 直接產生 POI 上的三個欄位，給兩個 adapter 共用——
 * 避免各自展開時漏掉 `source` 或 `evidence`（漏了就又回到「猜的看起來像查過的」）。
 */
export function spaceTypeFields(
  input: SpaceTypeInput,
): Pick<POI, 'space_type' | 'space_type_source' | 'space_type_evidence'> {
  const r = inferSpaceType(input)
  return {
    space_type: r.type,
    space_type_source: r.source,
    space_type_evidence: r.evidence,
  }
}
