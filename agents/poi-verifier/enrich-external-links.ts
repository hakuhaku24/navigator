/**
 * enrich-external-links.ts
 *
 * 用 Serper 搜尋每個 POI 在 KKday / Klook 上的對應商品連結。
 *
 * 設計考量：
 *   - 不直接寫進 Supabase，先輸出 dry-run JSON 給使用者人工確認
 *   - 用 URL pattern filter 排除 blog 文章
 *   - 用 Jaccard 相似度評估「POI 名 vs 商品標題」匹配度
 *   - 標出 confidence：high / needs_review / none
 *
 * Usage:
 *   cd agents/poi-verifier
 *   npx ts-node enrich-external-links.ts           # dry-run，輸出到 results/external-links-draft.json
 *   npx ts-node enrich-external-links.ts --apply   # 確認後寫入 Supabase metadata.booking.external_links
 *
 * 環境變數需求：
 *   SERPER_API_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (僅 --apply 時用)
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// ── 型別 ───────────────────────────────────────────────────────────────────

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
}

interface LinkResult {
  source_id: string
  name: string
  kkday: { url: string; title: string; confidence: 'high' | 'needs_review' | 'none' } | null
  klook: { url: string; title: string; confidence: 'high' | 'needs_review' | 'none' } | null
  candidates_kkday: ProductCandidate[]  // 給人工複查用
  candidates_klook: ProductCandidate[]
}

// ── 設定 ───────────────────────────────────────────────────────────────────

const RESULTS_PATH = path.join(__dirname, 'results', 'poi_verified.json')
const DRAFT_PATH = path.join(__dirname, 'results', 'external-links-draft.json')

// URL pattern：只要商品頁，過濾 blog 文章
const KKDAY_PRODUCT_PATTERN = /kkday\.com\/[a-z-]+\/product\/\d+/i
const KLOOK_PRODUCT_PATTERN = /klook\.com\/[a-z-]+\/activity\/\d+/i

const SERPER_DELAY_MS = 1_500  // 對 Serper 友善的間隔
const TOP_K_CANDIDATES = 5

// ── Jaccard 字串相似度 ─────────────────────────────────────────────────────
// 把字串切成 bigram set，算交集/聯集
function jaccard(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const cleaned = s.toLowerCase().replace(/[\s\-_·／/()（）|｜]+/g, '')
    const set = new Set<string>()
    for (let i = 0; i < cleaned.length - 1; i++) {
      set.add(cleaned.slice(i, i + 2))
    }
    return set
  }
  const A = grams(a)
  const B = grams(b)
  if (A.size === 0 || B.size === 0) return 0
  const inter = new Set([...A].filter(x => B.has(x)))
  const union = new Set([...A, ...B])
  return inter.size / union.size
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
  if (!res.ok) {
    console.warn(`[serper] HTTP ${res.status}: ${query}`)
    return []
  }
  const data = await res.json()
  return data.organic ?? []
}

// ── 找最佳商品連結 ─────────────────────────────────────────────────────────
function pickBest(
  poiName: string,
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
      similarity: jaccard(poiName, r.title),
    }))
    .sort((a, b) => b.similarity - a.similarity)

  return { candidates, best: candidates[0] ?? null }
}

function classifyConfidence(similarity: number): 'high' | 'needs_review' | 'none' {
  if (similarity >= 0.5) return 'high'
  if (similarity >= 0.3) return 'needs_review'
  return 'none'
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
async function processOne(poiName: string, sourceId: string): Promise<LinkResult> {
  // KKday
  const kkdayRaw = await serperSearch(`${poiName} site:kkday.com`)
  const { candidates: kkCands, best: kkBest } = pickBest(poiName, kkdayRaw, KKDAY_PRODUCT_PATTERN)

  await new Promise(r => setTimeout(r, SERPER_DELAY_MS))

  // Klook
  const klookRaw = await serperSearch(`${poiName} site:klook.com`)
  const { candidates: klCands, best: klBest } = pickBest(poiName, klookRaw, KLOOK_PRODUCT_PATTERN)

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
      const kk = r.kkday ? `KK:${r.kkday.confidence}` : 'KK:-'
      const kl = r.klook ? `KL:${r.klook.confidence}` : 'KL:-'
      console.log(`${kk}  ${kl}`)
      results.push(r)
    } catch (err: any) {
      console.log(`❌ ${err?.message ?? err}`)
    }
    await new Promise(r => setTimeout(r, SERPER_DELAY_MS))
  }

  fs.writeFileSync(DRAFT_PATH, JSON.stringify(results, null, 2))

  // 統計
  const stats = {
    total: results.length,
    kkday_high: results.filter(r => r.kkday?.confidence === 'high').length,
    kkday_review: results.filter(r => r.kkday?.confidence === 'needs_review').length,
    kkday_none: results.filter(r => !r.kkday).length,
    klook_high: results.filter(r => r.klook?.confidence === 'high').length,
    klook_review: results.filter(r => r.klook?.confidence === 'needs_review').length,
    klook_none: results.filter(r => !r.klook).length,
  }
  console.log(`\n${'═'.repeat(50)}`)
  console.log('Draft 寫入:', DRAFT_PATH)
  console.log('統計:', stats)
  console.log(`${'═'.repeat(50)}\n`)
  console.log('下一步：人工檢查 needs_review，確認後執行 --apply 寫入 Supabase')
}

async function apply() {
  if (!fs.existsSync(DRAFT_PATH)) {
    console.error(`找不到 ${DRAFT_PATH}，請先跑 dry-run`)
    process.exit(1)
  }
  const draft = JSON.parse(fs.readFileSync(DRAFT_PATH, 'utf-8')) as LinkResult[]
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  let updated = 0
  for (const r of draft) {
    // 只寫 high confidence 的（needs_review 等人工處理）
    const links: Record<string, string> = {}
    if (r.kkday?.confidence === 'high') links.kkday = r.kkday.url
    if (r.klook?.confidence === 'high') links.klook = r.klook.url
    if (Object.keys(links).length === 0) continue

    const { data: existing } = await sb.from('poi_catalog')
      .select('metadata').eq('source_id', r.source_id).single()
    if (!existing) continue

    const newMetadata = {
      ...existing.metadata,
      booking: {
        ...(existing.metadata?.booking ?? {}),
        external_links: {
          ...(existing.metadata?.booking?.external_links ?? {}),
          ...links,
        },
      },
    }

    const { error } = await sb.from('poi_catalog')
      .update({ metadata: newMetadata })
      .eq('source_id', r.source_id)
    if (error) {
      console.warn(`[apply] ${r.source_id} 失敗: ${error.message}`)
    } else {
      updated++
    }
  }
  console.log(`已更新 ${updated} 筆 POI 的 external_links`)
}

// ── Entry ──────────────────────────────────────────────────────────────────
;(async () => {
  const mode = process.argv[2]
  if (mode === '--apply') {
    await apply()
  } else {
    await dryRun()
  }
})()
