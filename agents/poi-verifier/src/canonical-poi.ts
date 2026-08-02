/**
 * canonical-poi.ts — Navigator 單一標準格式（canonical schema）
 *
 * 設計依據：docs/db-organization-plan.md
 *   - 事實層對齊 TDX 涵蓋、乾淨命名（§2.1）
 *   - 智能層存 metadata + embedding，找不到給「預設」不給 null（§2.2、§6）
 *   - city 不可直接抄 TDX City（管轄單位≠位置），優先序 ZipCode → Address → City（§10 修正 1/3）
 *   - tags 靠 Class1 + enrich（Class2/3/Keyword 實測全缺，§10 修正 2）
 *   - phone 等髒資料入庫前清洗（§10 修正 5）
 *
 * 本檔只負責「TDX/任意來源 → canonical 事實層」的純函式正規化，
 * 不呼叫 DB、不呼叫 LLM（智能層由 enrich() 另外填）。
 */

import type { TdxAttraction, TdxImage, TdxEntityType } from './tdx-types'
import { categoryFromClasses } from './tdx-types'
import type { PoiVerifierOutput, EnrichmentResult } from './types'

// ── 型別 ─────────────────────────────────────────────────────────────────────

/** 事實層（對應 poi_catalog 正式 columns） */
export interface CanonicalFacts {
  source_id:          string
  name:               string
  description:        string | null
  address:            string | null
  lat:                number | null
  lng:                number | null
  category:           string | null
  city:               string | null   // 推導後的真實縣市
  zip_code:           string | null
  curated_zone:       string | null   // 策展區，TDX 來源為 null
  hours:              string | null
  phone:              string | null
  images:             string[]
  website_url:        string | null
  tags:               string[]
  source_update_time: string | null
}

/** 智能層（存 metadata JSONB）；每筆都有 → 給預設不給 null */
export interface CanonicalPoiMetadata {
  level:                0 | 1 | 2 | 3
  level_name:           string
  // ⚠️ null ＝「未判定」，不是「戶外」／「中等」。只有 LLM 判得出來，
  // 補預設值會產生看似完整的猜測資料，且下游會照單全收。見 types.ts facts 的說明。
  is_indoor:            boolean | null
  weather_sensitivity:  'low' | 'medium' | 'high' | null
  backup_strategy:      string | null                 // 沿用：strategy_type 字串（back-compat）
  backup_logic:         EnrichmentResult['backup_logic'] // 完整物件（candidate_pool_tags/proximity）；L0 為 null
  reliability_score:    number
  average_stay_minutes: number
  // 🟡 出處（optional；沒有就省略 key）
  tdx_id?:          string
  tdx_entity_type?: TdxEntityType
  sources?:         string[]
}

export const LEVEL_NAMES = ['絕對錨點', '彈性錨點', '條件變動', '水位調節'] as const

/** 智能層預設值（enrich 判不出來時用，§6） */
export const SMART_DEFAULTS: Omit<CanonicalPoiMetadata, 'tdx_id' | 'tdx_entity_type' | 'sources'> = {
  level:                2,
  level_name:           LEVEL_NAMES[2],
  // 這兩個刻意留 null——2026-05-06 那批就是因為這裡補 false/'medium'，
  // 讓 30 筆未判定的景點看起來像判定過的戶外景點，連鎖污染 metadata、tags 與
  // embedding，最終使下雨備案池（硬性 is_indoor=true）只剩 4 筆。
  is_indoor:            null,
  weather_sensitivity:  null,
  backup_strategy:      null,
  backup_logic:         null,
  reliability_score:    0,
  average_stay_minutes: 90,
}

// ── ZipCode 前 3 碼 → 縣市（範圍式，涵蓋 22 縣市；§10 修正 1）──────────────────

interface ZipRange { min: number; max: number; county: string }

const ZIP_RANGES: ZipRange[] = [
  { min: 100, max: 116, county: '臺北市' },
  { min: 200, max: 206, county: '基隆市' },
  { min: 207, max: 208, county: '新北市' },
  { min: 209, max: 212, county: '連江縣' },   // 馬祖（夾在新北 zip 中間，須先判）
  { min: 220, max: 253, county: '新北市' },
  { min: 260, max: 272, county: '宜蘭縣' },
  { min: 290, max: 290, county: '南海島'  },   // 東沙/南沙（罕見）
  { min: 300, max: 300, county: '新竹市' },
  { min: 302, max: 315, county: '新竹縣' },
  { min: 320, max: 338, county: '桃園市' },
  { min: 350, max: 369, county: '苗栗縣' },
  { min: 400, max: 439, county: '臺中市' },
  { min: 500, max: 530, county: '彰化縣' },
  { min: 540, max: 558, county: '南投縣' },
  { min: 600, max: 600, county: '嘉義市' },
  { min: 602, max: 625, county: '嘉義縣' },
  { min: 630, max: 655, county: '雲林縣' },
  { min: 700, max: 745, county: '臺南市' },
  { min: 800, max: 852, county: '高雄市' },
  { min: 880, max: 885, county: '澎湖縣' },
  { min: 890, max: 896, county: '金門縣' },
  { min: 900, max: 947, county: '屏東縣' },
  { min: 950, max: 966, county: '臺東縣' },
  { min: 970, max: 983, county: '花蓮縣' },
]

const COUNTIES = [
  '臺北市', '台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣',
  '臺中市', '台中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣',
  '臺南市', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '台東縣',
  '澎湖縣', '金門縣', '連江縣',
]

/** 統一台/臺 */
function normalizeCounty(c: string): string {
  return c.replace(/^台/, '臺')
}

/** ZipCode → 縣市；非 3 碼數字回 null */
export function cityFromZip(zip: string | null | undefined): string | null {
  if (!zip) return null
  const m = String(zip).trim().match(/^(\d{3})/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const hit = ZIP_RANGES.find(r => n >= r.min && n <= r.max)
  return hit ? hit.county : null
}

/** Address 開頭解析縣市（台/臺都接受）；找不到回 null */
export function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null
  const head = address.trim().slice(0, 4)
  const hit = COUNTIES.find(c => head.includes(c))
  return hit ? normalizeCounty(hit) : null
}

/**
 * 推導真實縣市（§10 修正 1 優先序）：
 *   ① ZipCode（3/3 最可靠）→ ② Address → ③ 最後才退回 TDX City 欄位
 */
export function deriveCity(
  zip?: string | null,
  address?: string | null,
  tdxCity?: string | null,
): string | null {
  return (
    cityFromZip(zip) ??
    cityFromAddress(address) ??
    (tdxCity ? normalizeCounty(tdxCity.trim()) : null)
  )
}

// ── Phone 清洗（§10 修正 5）─────────────────────────────────────────────────

/**
 * 清洗 TDX 電話：
 *   886-3-9312152      → 03-9312152    （舊版 ScenicSpot 格式）
 *   886-2-29603456     → 02-29603456
 *   886-886-836-56534  → 0836-56534    （collapse 重複 886）
 *   (02)26720004       → 02-26720004   （2026-08 新版 Telephones 格式）
 *   (03)9312152        → 03-9312152
 *   空字串 / null       → null
 *
 * 為什麼要收 `(0X)` 這種：新版 API 的 `Telephones[].Tel` 一律是括號格式，
 * 而既有 45 筆存的是 `0X-XXXXXXXX`。不統一的話同一個欄位會有兩種寫法，
 * 之後要比對「是不是同一家店」就多一種假不相等。
 */
export function cleanPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let p = String(raw).replace(/\s+/g, '').trim()
  if (!p) return null
  // collapse 重複的 886-886
  p = p.replace(/(886-)+/g, '886-')
  // 國碼 886- 換成本地 0
  if (p.startsWith('886-')) p = '0' + p.slice(4)
  else if (p.startsWith('+886')) p = '0' + p.slice(4).replace(/^-/, '')
  // (0X)NNNNNNN → 0X-NNNNNNN；區碼長度不固定（(02) / (037) 都有）
  const paren = p.match(/^\((0\d{1,3})\)-?(.+)$/)
  if (paren) p = `${paren[1]}-${paren[2]}`
  return p || null
}

// ── 圖片 / 分類 / 標籤 ────────────────────────────────────────────────────────

/** Images [] / null → []；只取非空 URL（2026-08-02 起 TDX 圖片改為陣列） */
export function extractImages(images: TdxImage[] | null | undefined): string[] {
  if (!images?.length) return []
  return images
    .map(i => i?.URL)
    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
}

// category 對照改由數字類型代碼推導（`categoryFromClasses`，定義在 tdx-types.ts）。
// 舊的 CLASS1_TO_CATEGORY 中文字串表已隨 ScenicSpot 端點一起作廢：新版 API 回的是
// AttractionClasses 數字陣列，一個中文 Class1 都不會再出現。

// ── 資料可信度分層（migration 010）───────────────────────────────────────────

export type VerificationTier = 'unverified' | 'tier_0' | 'tier_1' | 'tier_2'

/**
 * 判定一筆 POI 的資料可信度分層。
 *
 * 為什麼需要：TDX 批次匯入的景點只有政府單一來源、未經交叉驗證。若與交叉驗證過
 * 的資料混在同一張表、同一個 API 回應、同一個 UI，就無法回答「這 N 筆裡哪些是
 * 真的驗過的」——而「可信賴景點資料服務」正是本專案對外的核心主張。
 *
 * 判定順序由嚴到寬，第一個成立的即為答案。`unverified` 必須排最前面：
 * 一筆有三個來源的景點，只要 enrich 掛掉，它的 level／is_indoor 仍然是預設值
 * 而非判斷，不能因為來源數多就給高分。
 */
export function deriveVerificationTier(input: {
  /** enrich() 實際用到的 LLM；'fallback' 代表兩家都失敗，智能欄位不可信 */
  llmSource: string | null | undefined
  /** verification_result.sources 的長度 */
  sourceCount: number
  /** 有官方網站（P0 可連線）或政府來源（TDX） */
  hasAuthoritativeSource: boolean
  /** conflict_analysis 有產出（欄位衝突已裁決） */
  hasResolvedConflict: boolean
}): VerificationTier {
  if (input.llmSource === 'fallback') return 'unverified'
  if (input.hasAuthoritativeSource && input.hasResolvedConflict && input.sourceCount >= 2) {
    return 'tier_2'
  }
  if (input.sourceCount >= 2) return 'tier_1'
  return 'tier_0'
}

// ── 批次降級偵測 ─────────────────────────────────────────────────────────────

/** 連續幾筆走 fallback 就中止整批（batch-verify.ts 用） */
export const MAX_CONSECUTIVE_FALLBACKS = 3

/**
 * 判斷批次是否該中止。
 *
 * 為什麼需要：verifyPoi() 在 LLM 失敗時**不會拋錯**，它照常回傳結構完整的結果，
 * 只是 llm_source='fallback'。舊版 batch-verify 只計 success++，所以配額耗盡後
 * 整批繼續跑、把降級資料當正常資料寫檔＋入庫，且沒有任何訊號。2026-05-06 那批
 * 45 筆就是這樣壞掉 30 筆的（Gemini 免費層 RPD 20，跑到第 15 筆左右耗盡）。
 *
 * 門檻取 3 是刻意保守：偶發的單筆 429／逾時不該中止整批，但連續 3 筆必定是
 * 系統性問題（配額／金鑰／網路），繼續跑只會製造更多垃圾。
 */
export function shouldAbortBatch(
  consecutiveFallbacks: number,
  threshold: number = MAX_CONSECUTIVE_FALLBACKS,
): boolean {
  return consecutiveFallbacks >= threshold
}

// ── metadata 預設合併（智能層永遠補滿、出處省略 null）─────────────────────────

/**
 * 把 enrich 算出的部分智能欄位，補齊成完整 metadata：
 *   - 智能層缺的 → 套 SMART_DEFAULTS
 *   - 出處欄位 → undefined 的 key 直接省略
 *
 * ⚠️ `is_indoor` 與 `weather_sensitivity` 的 SMART_DEFAULTS 是 null，所以這兩個
 *    欄位「補完」之後仍可能是 null。這是刻意的：未判定必須看得出來是未判定。
 */
export function withMetadataDefaults(
  partial: Partial<CanonicalPoiMetadata>,
): CanonicalPoiMetadata {
  const level = (partial.level ?? SMART_DEFAULTS.level) as 0 | 1 | 2 | 3
  const md: CanonicalPoiMetadata = {
    level,
    level_name:           partial.level_name           ?? LEVEL_NAMES[level],
    is_indoor:            partial.is_indoor            ?? SMART_DEFAULTS.is_indoor,
    weather_sensitivity:  partial.weather_sensitivity  ?? SMART_DEFAULTS.weather_sensitivity,
    backup_strategy:      partial.backup_strategy      ?? SMART_DEFAULTS.backup_strategy,
    backup_logic:         partial.backup_logic         ?? SMART_DEFAULTS.backup_logic,
    reliability_score:    partial.reliability_score    ?? SMART_DEFAULTS.reliability_score,
    average_stay_minutes: partial.average_stay_minutes ?? SMART_DEFAULTS.average_stay_minutes,
  }
  // 出處欄位：有才放（省略 null/undefined key）
  if (partial.tdx_id)          md.tdx_id = partial.tdx_id
  if (partial.tdx_entity_type) md.tdx_entity_type = partial.tdx_entity_type
  if (partial.sources?.length) md.sources = partial.sources
  return md
}

/**
 * 橋接：把驗證/加值管線輸出（PoiVerifierOutput）轉成 canonical 智能層 metadata。
 * 統一映射規則，避免各 ingest 各自手動轉（suggested_level→level、
 * backup_logic.strategy_type→backup_strategy 等）而漂移。
 *
 * 註：backup_strategy 沿用現有 DB 慣例只存 strategy_type 字串；
 *     完整 backup_logic（candidate_pool_tags/proximity）是否要存，待與組員確認。
 */
export function metadataFromVerifierOutput(
  out: PoiVerifierOutput,
  provenance?: Pick<CanonicalPoiMetadata, 'tdx_id' | 'tdx_entity_type' | 'sources'>,
): CanonicalPoiMetadata {
  const f = out.verification_result.facts
  const e = out.enrichment_result
  return withMetadataDefaults({
    level:                e.suggested_level,
    is_indoor:            f.is_indoor,
    weather_sensitivity:  f.weather_sensitivity,
    average_stay_minutes: f.average_stay_minutes,
    reliability_score:    out.verification_result.reliability_score,
    backup_strategy:      e.backup_logic?.strategy_type ?? null,
    backup_logic:         e.backup_logic,
    ...provenance,
  })
}

// ── 入庫列組裝（含 back-compat）─────────────────────────────────────────────

/** poi_catalog 入庫列：事實欄位 + metadata（metadata 內含 back-compat region） */
export interface CatalogRecord extends CanonicalFacts {
  metadata: CanonicalPoiMetadata & { region?: string }
}

/**
 * 組裝最終入庫列。
 * back-compat 關鍵：舊消費者（contingency-handler poi-catalog-client、region 過濾測試）
 * 仍從 `metadata.region` 讀區域，故此處把 curated_zone 回填 metadata.region，
 * 避免事實層重構時弄壞應變 agent（見 docs §10 整合分析 問題 A）。
 */
export function buildCatalogRecord(
  facts: CanonicalFacts,
  meta: CanonicalPoiMetadata,
): CatalogRecord {
  const metadata: CanonicalPoiMetadata & { region?: string } = { ...meta }
  if (facts.curated_zone) metadata.region = facts.curated_zone
  return { ...facts, metadata }
}

// ── TDX Attraction → canonical 事實層 ────────────────────────────────────────

/**
 * 守門：POI 至少要有名稱 + 座標才可用（否則無法推薦/上地圖）。
 * 入庫前用它過濾壞記錄（TDX 偶有空殼、或誤把錯誤回應當資料）。
 */
export function isUsablePoi(f: CanonicalFacts): boolean {
  return !!f.name && typeof f.lat === 'number' && typeof f.lng === 'number'
}

/** 把一筆 TDX Attraction 正規化成 canonical 事實層 */
export function tdxAttractionToFacts(a: TdxAttraction): CanonicalFacts {
  const addr   = a.PostalAddress
  const zip    = addr?.ZipCode ?? null
  const street = addr?.StreetAddress ?? null
  // 新版地址是結構化的，組回單行時用 City+Town+Street（Town 見下方警告）
  const oneLine = [addr?.City, addr?.Town, street]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join('') || null

  return {
    source_id:          `TDX-AT-${a.AttractionID ?? ''}`,
    name:               a.AttractionName ?? '',
    description:        (a.Description ?? '').trim() || null,
    address:            oneLine,
    lat:                a.PositionLat ?? null,
    lng:                a.PositionLon ?? null,
    category:           categoryFromClasses(a.AttractionClasses),
    // ⚠️ deriveCity 的優先序是 ZipCode → Address → City，但實測新版 PostalAddress
    //    內部會自相矛盾（滿月圓的 ZipCode 是八里區 249、StreetAddress 卻是三峽區）。
    //    縣市級剛好不受影響（兩者都是新北市），鄉鎮級則不可信 Town/ZipCode。
    city:               deriveCity(zip, street, addr?.City),
    zip_code:           zip ? String(zip).trim().match(/^\d{3}/)?.[0] ?? null : null,
    curated_zone:       null,
    hours:              a.ServiceTimeInfo?.trim() || null,
    phone:              cleanPhone(a.Telephones?.[0]?.Tel ?? null),
    images:             extractImages(a.Images),
    website_url:        a.WebsiteUrl?.trim() || null,
    tags:               (a.Tags ?? []).map(t => t.trim()).filter(Boolean),
    source_update_time: a.UpdateTime ?? null,
  }
}
