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
  // link_type 刻意不放這裡：預處理只收集 URL，景點本身的性質由下游驗證流程判斷
}

interface LinkResult {
  source_id: string
  name: string
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

// ── POI 名稱清洗：去掉內部標注括號 ────────────────────────────────────────
// 例：「黃金博物館 (坑道體驗)」→「黃金博物館」
function cleanPoiName(name: string): string {
  return name.replace(/[\s　]*[（(][^）)]*[）)]/g, '').trim()
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

// ── 綜合評分：substring 命中給高分，地區錯誤歸零，否則退回 Jaccard ──────
function scoreSimilarity(cleanedName: string, title: string): number {
  if (hasRegionMismatch(title)) return 0
  const t = title.replace(/[\s\-_·／/()（）|｜【】]+/g, '')
  const n = cleanedName.replace(/[\s\-_·／/()（）|｜【】]+/g, '')
  if (n.length >= 3 && t.includes(n)) return 0.9
  return jaccard(cleanedName, title)
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
      similarity: scoreSimilarity(cleanedName, r.title),
      link_type: classifyLinkType(r.title),
      region_mismatch: hasRegionMismatch(r.title),
    }))
    .sort((a, b) => b.similarity - a.similarity)
  return { candidates, best: candidates[0] ?? null }
}

function classifyConfidence(similarity: number): 'high' | 'needs_review' | 'none' {
  if (similarity >= 0.5) return 'high'
  if (similarity >= 0.2) return 'needs_review'
  return 'none'
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
async function processOne(poiName: string, sourceId: string): Promise<LinkResult> {
  const cleanedName = cleanPoiName(poiName)

  const kkdayRaw = await serperSearch(`${cleanedName} site:kkday.com`)
  const { candidates: kkCands, best: kkBest } = pickBest(cleanedName, kkdayRaw, KKDAY_PRODUCT_PATTERN)

  await new Promise(r => setTimeout(r, SERPER_DELAY_MS))

  const klookRaw = await serperSearch(`${cleanedName} site:klook.com`)
  const { candidates: klCands, best: klBest } = pickBest(cleanedName, klookRaw, KLOOK_PRODUCT_PATTERN)

  return {
    source_id: sourceId,
    name: poiName,
    kkday: kkBest ? {
      url: kkBest.url,
      title: kkBest.title,
      confidence: classifyConfidence(kkBest.similarity),
    } : null,
    klook: klBest ? {
      url: klBest.url,
      title: klBest.title,
      confidence: classifyConfidence(klBest.similarity),
    } : null,
    candidates_kkday: kkCands,
    candidates_klook: klCands,
  }
}

// ── 統計輔助 ───────────────────────────────────────────────────────────────
function typeLabel(b: BookingLink | null): string {
  if (!b) return '-'
  return b.confidence
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
      console.log(`KK:${typeLabel(r.kkday)}  KL:${typeLabel(r.klook)}`)
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
  console.log(`${'═'.repeat(55)}`)
  console.log('\n說明：')
  console.log('  candidates 欄位保留 link_type（ticket/booking/tour），供人工複查商品性質')
  console.log('  景點本身的 booking 需求由下游驗證流程判斷，此處只收集 URL')
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

    if (Object.keys(links).length === 0) continue

    const { data: existing } = await sb.from('poi_catalog')
      .select('metadata').eq('source_id', r.source_id).single()
    if (!existing) continue

    const newMetadata = {
      ...existing.metadata,
      external_links: {
        ...(existing.metadata?.external_links ?? {}),
        ...links,
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
