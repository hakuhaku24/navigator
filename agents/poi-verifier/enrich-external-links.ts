/**
 * enrich-external-links.ts
 *
 * 搜尋每個 POI 在 KKday / Klook 上的相關商品連結並收集 URL。
 *
 * 設計原則：
 *   預處理只負責「找到 URL + 評估匹配信心度」，不對景點本身下 booking 分類。
 *   candidates 欄位保留 link_type（ticket/booking/tour）供人工複查商品性質，
 *   但這是描述「找到的商品」，不是描述「景點需要什麼」。
 *   景點的 booking 需求由下游驗證流程（ingestion.ts）判斷。
 *
 * Usage:
 *   cd agents/poi-verifier
 *   npx ts-node enrich-external-links.ts           # dry-run
 *   npx ts-node enrich-external-links.ts --apply   # 寫入 Supabase
 *
 * 環境變數：SERPER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (apply only)
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// ── 型別 ───────────────────────────────────────────────────────────────────

type LinkType = 'direct_ticket' | 'direct_booking' | 'day_tour' | 'unknown'

interface SerperOrganicResult {
  title: string
  link: string
  snippet?: string
}

interface ProductCandidate {
  url: string
  title: string
  snippet: string
  similarity: number
  link_type: LinkType
  region_mismatch: boolean
}

interface BookingLink {
  url: string
  title: string
  confidence: 'high' | 'needs_review' | 'none'
  // price 刻意不收：票價分層複雜（全票/半票/假日/套票），snippet 只能抓到片段，
  // 下游 LLM 看到單一價格會誤判景點貴賤，影響推薦決策。
  // 正確做法是從官網或 KKday/Klook 商品頁完整抓所有票種，另立腳本處理。
  // link_type 同樣不放這裡，景點本身的性質由下游驗證流程判斷。
}

interface LinkResult {
  source_id: string
  name: string
  found_at: string           // 搜尋時間，供下游判斷資料新鮮度
  facebook_url: string | null
  kkday: BookingLink | null
  klook: BookingLink | null
  candidates_kkday: ProductCandidate[]
  candidates_klook: ProductCandidate[]
}

// ── 設定 ───────────────────────────────────────────────────────────────────

const RESULTS_PATH = path.join(__dirname, 'results', 'poi_verified.json')
const DRAFT_PATH   = path.join(__dirname, 'results', 'external-links-draft.json')

const KKDAY_PRODUCT_PATTERN = /kkday\.com\/[a-z-]+\/product\/\d+/i
const KLOOK_PRODUCT_PATTERN = /klook\.com\/[a-z-]+\/activity\/\d+/i

const SERPER_DELAY_MS = 1_500
const TOP_K_CANDIDATES = 5

// 我們的 demo 資料全在北台灣，標題出現以下地名代表搜錯地區
const WRONG_REGION_KEYWORDS = [
  '花蓮', '台中', '台南', '高雄', '屏東', '嘉義', '台東',
  '日本', '韓國', '沖繩', '首爾', '大阪', '東京', '京都', '大邱', '釜山',
  '新加坡', '泰國', '越南', '峇里', '巴厘',
]

// 直接售票：使用者需要預先購票才能入場
const DIRECT_TICKET_KW = ['門票', '入場券', '入園票', '入場票', '套票', '票券', '入場', '憑單']

// 直接預約：使用者需要預約座位或體驗活動
const DIRECT_BOOKING_KW = [
  '體驗', '預約', '訂位', '訂座', '憑證',
  '泡腳', '泡湯', '午餐', '下午茶', '餐廳', '茶樓', '茶室',
  'SUP', '立槳', '獨木舟', '浮潛', '攀岩', '自行車', '騎車', 'Rail Bike',
]

// 一日遊套裝：景點只是行程中的一站
const DAY_TOUR_KW = [
  '一日遊', '半日遊', '包車', '接送', '出發', '之旅',
  '導遊', '私人包', '拼團', '跟團', '小時遊', '獨家遊', '多站',
]

// ── 縮寫 / 別名對照表 ──────────────────────────────────────────────────────
// KKday/Klook 商品標題用全名，但 POI 可能用縮寫，需補全名才能 substring 命中
const POI_ALIASES: Record<string, string[]> = {
  '國立海科館':  ['國立海洋科技博物館', '海科館'],
  '法鼓山世界佛教園區': ['法鼓山'],
}

// ── POI 名稱處理工具 ───────────────────────────────────────────────────────

// 主名（去括號）：用於 substring 比對與 Jaccard
// 例：「黃金博物館 (坑道體驗)」→「黃金博物館」
function cleanPoiName(name: string): string {
  return name.replace(/[\s　]*[（(][^）)]*[）)]/g, '').trim()
}

// 括號內容：用於補充比對（對 CAMA 咖啡 (豆留森林) 這類品牌名不足的景點）
function extractBracketContent(name: string): string | null {
  const m = name.match(/[（(]([^）)]+)[）)]/)
  return m ? m[1].trim() : null
}

// 搜尋用查詢字串：把括號替換成空格，保留括號內容協助縮窄搜尋結果
// 例：「CAMA 咖啡 (豆留森林)」→「CAMA 咖啡 豆留森林」
function buildSearchQuery(poiName: string, cleanedName: string): string {
  const base = poiName.replace(/[（()）]/g, ' ').replace(/\s+/g, ' ').trim()
  const aliases = POI_ALIASES[cleanedName] ?? []
  return aliases.length > 0 ? `${base} ${aliases[0]}` : base
}

// ── 連結類型分類 ───────────────────────────────────────────────────────────
// 順序重要：day_tour 先判，避免「包車體驗一日遊」被誤分成 direct_booking
function classifyLinkType(title: string): LinkType {
  if (DAY_TOUR_KW.some(k => title.includes(k)))     return 'day_tour'
  if (DIRECT_TICKET_KW.some(k => title.includes(k))) return 'direct_ticket'
  if (DIRECT_BOOKING_KW.some(k => title.includes(k))) return 'direct_booking'
  return 'unknown'
}

// ── 地區錯誤偵測 ───────────────────────────────────────────────────────────
function hasRegionMismatch(title: string): boolean {
  return WRONG_REGION_KEYWORDS.some(k => title.includes(k))
}

// ── Jaccard bigram 相似度 ──────────────────────────────────────────────────
function jaccard(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const cleaned = s.toLowerCase().replace(/[\s\-_·／/()（）|｜【】]+/g, '')
    const set = new Set<string>()
    for (let i = 0; i < cleaned.length - 1; i++) set.add(cleaned.slice(i, i + 2))
    return set
  }
  const A = grams(a), B = grams(b)
  if (A.size === 0 || B.size === 0) return 0
  const inter = new Set([...A].filter(x => B.has(x)))
  return inter.size / new Set([...A, ...B]).size
}

// ── 綜合評分 ───────────────────────────────────────────────────────────────
// 優先順序：地區錯誤歸零 > 主名 substring > 別名 substring > 括號內容 substring > Jaccard
function scoreSimilarity(
  cleanedName: string,
  bracketContent: string | null,
  title: string,
): number {
  if (hasRegionMismatch(title)) return 0
  const norm = (s: string) => s.replace(/[\s\-_·／/()（）|｜【】]+/g, '')
  const t = norm(title)
  const n = norm(cleanedName)

  if (n.length >= 3 && t.includes(n)) return 0.9

  // 別名命中（例：「國立海科館」→ 標題含「國立海洋科技博物館」）
  for (const alias of POI_ALIASES[cleanedName] ?? []) {
    const a = norm(alias)
    if (a.length >= 3 && t.includes(a)) return 0.85
  }

  // 括號內容命中（例：「CAMA 咖啡 (豆留森林)」→ 標題含「豆留森林」）
  // 長度 >= 3 避免「門票」「預約」這類通用詞誤觸發
  if (bracketContent) {
    const b = norm(bracketContent)
    if (b.length >= 3 && t.includes(b)) return 0.75
  }

  return jaccard(cleanedName, title)
}

// ── Facebook 官方頁面搜尋 ──────────────────────────────────────────────────
// 過濾掉 events/groups/posts/photos 等非粉絲頁路徑
const FB_SKIP_PATTERN = /facebook\.com\/(events|groups|posts|photo|video|story|watch|marketplace|gaming)/i
const FB_PAGE_PATTERN = /facebook\.com\//i

async function findFacebookPage(searchQuery: string): Promise<string | null> {
  const results = await serperSearch(`${searchQuery} site:facebook.com`)
  const page = results.find(r =>
    FB_PAGE_PATTERN.test(r.link) &&
    !FB_SKIP_PATTERN.test(r.link)
  )
  return page?.link ?? null
}

// ── Serper 搜尋 ───────────────────────────────────────────────────────────
async function serperSearch(query: string): Promise<SerperOrganicResult[]> {
  const key = process.env.SERPER_API_KEY
  if (!key) throw new Error('SERPER_API_KEY 未設定')
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'tw', hl: 'zh-tw', num: 10 }),
  })
  if (!res.ok) { console.warn(`[serper] HTTP ${res.status}: ${query}`); return [] }
  return (await res.json()).organic ?? []
}

// ── 找最佳商品連結 ─────────────────────────────────────────────────────────
function pickBest(
  cleanedName: string,
  bracketContent: string | null,
  results: SerperOrganicResult[],
  urlPattern: RegExp,
): { candidates: ProductCandidate[]; best: ProductCandidate | null } {
  const candidates = results
    .filter(r => urlPattern.test(r.link))
    .slice(0, TOP_K_CANDIDATES)
    .map(r => ({
      url: r.link,
      title: r.title,
      snippet: r.snippet ?? '',
      similarity: scoreSimilarity(cleanedName, bracketContent, r.title),
      link_type: classifyLinkType(r.title),
      region_mismatch: hasRegionMismatch(r.title),
    }))
    .sort((a, b) => b.similarity - a.similarity)
  return { candidates, best: candidates[0] ?? null }
}

function toBookingLink(candidate: ProductCandidate | null): BookingLink | null {
  if (!candidate) return null
  return {
    url: candidate.url,
    title: candidate.title,
    confidence: classifyConfidence(candidate.similarity),
  }
}

function classifyConfidence(similarity: number): 'high' | 'needs_review' | 'none' {
  if (similarity >= 0.5) return 'high'
  if (similarity >= 0.2) return 'needs_review'
  return 'none'
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
async function processOne(poiName: string, sourceId: string): Promise<LinkResult> {
  const cleanedName    = cleanPoiName(poiName)
  const bracketContent = extractBracketContent(poiName)
  const searchQuery    = buildSearchQuery(poiName, cleanedName)

  const kkdayRaw = await serperSearch(`${searchQuery} site:kkday.com`)
  const { candidates: kkCands, best: kkBest } = pickBest(cleanedName, bracketContent, kkdayRaw, KKDAY_PRODUCT_PATTERN)

  await new Promise(r => setTimeout(r, SERPER_DELAY_MS))

  const klookRaw = await serperSearch(`${searchQuery} site:klook.com`)
  const { candidates: klCands, best: klBest } = pickBest(cleanedName, bracketContent, klookRaw, KLOOK_PRODUCT_PATTERN)

  await new Promise(r => setTimeout(r, SERPER_DELAY_MS))

  const facebookUrl = await findFacebookPage(searchQuery)

  return {
    source_id: sourceId,
    name: poiName,
    found_at: new Date().toISOString(),
    facebook_url: facebookUrl,
    kkday: toBookingLink(kkBest),
    klook: toBookingLink(klBest),
    candidates_kkday: kkCands,
    candidates_klook: klCands,
  }
}


// ── Dry-run ────────────────────────────────────────────────────────────────
async function dryRun() {
  const entries = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8')) as Array<{
    poi_id: string; name: string; result: any
  }>
  const valid = entries.filter(e => e.result?.verification_result?.exists)
  console.log(`\n搜尋 ${valid.length} 筆 POI 的 KKday/Klook 連結\n`)

  const results: LinkResult[] = []
  for (let i = 0; i < valid.length; i++) {
    const e = valid[i]
    process.stdout.write(`[${i + 1}/${valid.length}] ${e.poi_id} ${e.name}  `)
    try {
      const r = await processOne(e.name, e.poi_id)
      const fb = r.facebook_url ? 'FB:✓' : 'FB:-'
      console.log(`KK:${r.kkday?.confidence ?? '-'}  KL:${r.klook?.confidence ?? '-'}  ${fb}`)
      results.push(r)
    } catch (err: any) {
      console.log(`❌ ${err?.message ?? err}`)
    }
    await new Promise(r => setTimeout(r, SERPER_DELAY_MS))
  }

  fs.writeFileSync(DRAFT_PATH, JSON.stringify(results, null, 2))

  const stat = (platform: 'kkday' | 'klook') => ({
    high:         results.filter(r => r[platform]?.confidence === 'high').length,
    needs_review: results.filter(r => r[platform]?.confidence === 'needs_review').length,
    none:         results.filter(r => !r[platform] || r[platform]?.confidence === 'none').length,
  })

  console.log(`\n${'═'.repeat(55)}`)
  console.log('Draft 寫入:', DRAFT_PATH)
  console.log('KKday 統計:', stat('kkday'))
  console.log('Klook 統計:', stat('klook'))
  console.log('Facebook  :', `找到 ${results.filter(r => r.facebook_url).length} / ${results.length} 筆`)
  console.log(`${'═'.repeat(55)}`)
  console.log('\n說明：')
  console.log('  price_hint 從 snippet 抽取，僅供參考，實際以平台為準')
  console.log('  candidates 欄位保留 link_type（ticket/booking/tour），供人工複查')
  console.log('  景點 booking 需求由下游驗證流程判斷，此處只收集 URL')
  console.log('\n下一步：確認 needs_review 後執行 --apply 寫入 Supabase\n')
}

// ── Apply ──────────────────────────────────────────────────────────────────
async function apply() {
  if (!fs.existsSync(DRAFT_PATH)) {
    console.error(`找不到 ${DRAFT_PATH}，請先跑 dry-run`)
    process.exit(1)
  }
  const draft = JSON.parse(fs.readFileSync(DRAFT_PATH, 'utf-8')) as LinkResult[]
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  let updated = 0
  for (const r of draft) {
    const links: Record<string, { url: string; title: string }> = {}

    for (const platform of ['kkday', 'klook'] as const) {
      const b = r[platform]
      if (!b || b.confidence === 'none') continue
      links[platform] = { url: b.url, title: b.title }
    }

    const hasLinks = Object.keys(links).length > 0
    const hasFb    = !!r.facebook_url
    if (!hasLinks && !hasFb) continue

    const { data: existing } = await sb.from('poi_catalog')
      .select('metadata').eq('source_id', r.source_id).single()
    if (!existing) continue

    const newMetadata = {
      ...existing.metadata,
      external_links: {
        ...(existing.metadata?.external_links ?? {}),
        ...links,
        ...(hasFb ? { facebook: r.facebook_url } : {}),
      },
    }

    const { error } = await sb.from('poi_catalog')
      .update({ metadata: newMetadata }).eq('source_id', r.source_id)
    if (error) console.warn(`[apply] ${r.source_id} 失敗: ${error.message}`)
    else updated++
  }
  console.log(`已更新 ${updated} 筆 POI 的 external_links`)
}

// ── Entry ──────────────────────────────────────────────────────────────────
;(async () => {
  const mode = process.argv[2]
  if (mode === '--apply') await apply()
  else await dryRun()
})()
