/**
 * 45 POI 批次驗證：P0（官網）+ P1（PTT）
 * 執行：ts-node tests/batch-new-validators.test.ts
 *
 * 資料來源：results/poi_verified.json（45 筆實際 POI）
 * 輸出：
 *   results/poi_ptt_official_results.json  ← 每筆 POI 的 P0/P1 原始結果
 *   tests/batch-new-validators-report.md   ← 人讀摘要報告
 *
 * ⚠️  注意：
 *   - PTT 每版間隔 1s（3 版 ≈ 3s/POI）
 *   - 官網 DDG 發現 + 抓取最長 12s
 *   - 45 筆全跑約 5–10 分鐘
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '../../../.env.local' })

import * as fs   from 'fs'
import * as path from 'path'
import { searchPttPosts, latestPttDate } from '../src/validators/ptt-search'
import { fetchOfficialWebsite }          from '../src/validators/official-website'
import type { PoiInput, PttPostRaw, OfficialWebsiteRaw } from '../src/types'

// ── 型別 ──────────────────────────────────────────────────────────────────────

interface PoiVerifiedEntry {
  poi_id:      string
  name:        string
  region:      string
  verified_at: string
  result:      { poi_input: PoiInput }
}

interface PoiSourceResult {
  poi_id:    string
  name:      string
  region:    string
  tested_at: string
  p1_ptt: {
    posts_found:  number
    latest_date:  string | null
    boards_hit:   string[]
    sample:       Array<{ title: string; url: string; board: string; date: string | null }>
  }
  p0_official_website: OfficialWebsiteRaw | null
}

// ── 設定 ──────────────────────────────────────────────────────────────────────

const RESULTS_DIR = path.join(__dirname, '../results')
const OUT_JSON    = path.join(RESULTS_DIR, 'poi_ptt_official_results.json')
const OUT_REPORT  = path.join(__dirname, 'batch-new-validators-report.md')
const DELAY_BETWEEN_POIS_MS = 1500  // DDG 請求間距，避免 rate limit

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── 核心：單筆 POI 驗證 ────────────────────────────────────────────────────────

async function validateOnePoi(entry: PoiVerifiedEntry): Promise<PoiSourceResult> {
  const poi = entry.result.poi_input

  // [P1] PTT — 同時搜尋 travel / Hiking / Taipei 三版
  const pttPosts: PttPostRaw[] = await searchPttPosts(poi)
  const boardsHit = [...new Set(pttPosts.map(p => p.board))]

  // [P0] 官網 — DDG 自動發現 + 相關性驗證（若頁面與景點無關自動回傳 null）
  const officialSite = await fetchOfficialWebsite(poi, poi.website_url)

  return {
    poi_id:    entry.poi_id,
    name:      entry.name,
    region:    entry.region,
    tested_at: new Date().toISOString(),
    p1_ptt: {
      posts_found: pttPosts.length,
      latest_date: latestPttDate(pttPosts) ?? null,
      boards_hit:  boardsHit,
      sample:      pttPosts.slice(0, 2).map(p => ({
        title: p.title,
        url:   p.url,
        board: p.board,
        date:  p.published_date,
      })),
    },
    p0_official_website: officialSite,
  }
}

// ── 報告產生 ──────────────────────────────────────────────────────────────────

function buildMarkdownReport(results: PoiSourceResult[], startedAt: Date): string {
  const now         = new Date()
  const elapsed     = Math.round((now.getTime() - startedAt.getTime()) / 1000)
  const pttHit      = results.filter(r => r.p1_ptt.posts_found > 0).length
  const websiteHit  = results.filter(r => r.p0_official_website?.is_reachable).length
  const totalPttPosts = results.reduce((s, r) => s + r.p1_ptt.posts_found, 0)

  const lines: string[] = []

  lines.push('# 45 POI 批次驗證報告：P0（官網）+ P1（PTT）')
  lines.push('')
  lines.push(`> ⚠️ **測試資料聲明**：本報告使用的 45 筆 POI 來自 \`results/poi_verified.json\`（專案實際資料集），非 Claude 自行選定的情境。`)
  lines.push('')
  lines.push(`**執行時間**：${startedAt.toLocaleString('zh-TW')}  `)
  lines.push(`**完成時間**：${now.toLocaleString('zh-TW')}（耗時 ${elapsed} 秒）  `)
  lines.push(`**測試腳本**：\`tests/batch-new-validators.test.ts\`  `)
  lines.push(`**結果 JSON**：\`results/poi_ptt_official_results.json\``)
  lines.push('')
  lines.push('## 總覽')
  lines.push('')
  lines.push('| 項目 | 數值 |')
  lines.push('|------|------|')
  lines.push(`| 測試 POI 總數 | ${results.length} 筆 |`)
  lines.push(`| [P1] 有 PTT 文章的景點 | ${pttHit} / ${results.length} |`)
  lines.push(`| [P1] PTT 文章總篇數 | ${totalPttPosts} 篇 |`)
  lines.push(`| [P0] 找到官網且可連線 | ${websiteHit} / ${results.length} |`)
  lines.push(`| [P0] 官網不相關自動拒絕 | ${results.filter(r => r.p0_official_website === null).length} 筆回傳 null（含真的無官網）|`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // 按地區分組
  const regions = [...new Set(results.map(r => r.region))]
  for (const region of regions) {
    const group = results.filter(r => r.region === region)
    lines.push(`## ${region}（${group.length} 筆）`)
    lines.push('')
    lines.push('| POI ID | 景點名稱 | [P1] PTT 篇數 | PTT 最新 | [P0] 官網 | 官網標題 |')
    lines.push('|--------|---------|--------------|---------|-----------|---------|')

    for (const r of group) {
      const pttCount  = r.p1_ptt.posts_found > 0 ? `${r.p1_ptt.posts_found} 篇` : '—'
      const pttDate   = r.p1_ptt.latest_date ?? '—'
      const siteUrl   = r.p0_official_website?.is_reachable
        ? `[連結](${r.p0_official_website.url})`
        : '—'
      const siteTitle = r.p0_official_website?.is_reachable
        ? (r.p0_official_website.page_title ?? '（無標題）').slice(0, 20)
        : '—'
      lines.push(`| ${r.poi_id} | ${r.name} | ${pttCount} | ${pttDate} | ${siteUrl} | ${siteTitle} |`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('## 觀察與建議')
  lines.push('')

  // 自動觀察：PTT 零結果景點
  const pttZero = results.filter(r => r.p1_ptt.posts_found === 0)
  if (pttZero.length) {
    lines.push(`### PTT 零結果景點（${pttZero.length} 筆）`)
    lines.push('')
    lines.push('以下景點在 travel / Hiking / Taipei 三版均無搜尋結果，可能原因：冷門景點、PTT 討論用不同名稱、或屬商業設施（討論在其他版）。')
    lines.push('')
    pttZero.forEach(r => lines.push(`- \`${r.poi_id}\` ${r.name}`))
    lines.push('')
  }

  // 官網有效景點
  const withSite = results.filter(r => r.p0_official_website?.is_reachable)
  if (withSite.length) {
    lines.push(`### 成功找到官網的景點（${withSite.length} 筆）`)
    lines.push('')
    withSite.forEach(r => {
      lines.push(`- \`${r.poi_id}\` **${r.name}** → ${r.p0_official_website!.url}`)
    })
    lines.push('')
  }

  lines.push('### 已知限制')
  lines.push('')
  lines.push('- **DDG 相關性驗證**：`fetchOfficialWebsite` 已加入景點名稱比對，頁面不含景點名稱詞段則回傳 `null`，不捏造 URL')
  lines.push('- **PTT 連線不穩**：偶發 ECONNRESET（尤其 Hiking 版），已由 try/catch 容錯')
  lines.push('- **官網 JavaScript-only**：部分 .gov.tw 頁面需 JS 渲染，`excerpt` 品質較差（僅顯示「需開啟 JavaScript」提示）')
  lines.push('- **本批次測試**：P0/P1 獨立執行，未整合至完整 `verifyPoi()` pipeline（無 LLM enrichment）')

  return lines.join('\n')
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date()
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║   45 POI 批次驗證：P0（官網）+ P1（PTT）                   ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`開始時間：${startedAt.toLocaleString('zh-TW')}\n`)

  const poiData: PoiVerifiedEntry[] = JSON.parse(
    fs.readFileSync(path.join(RESULTS_DIR, 'poi_verified.json'), 'utf-8')
  )
  console.log(`載入 ${poiData.length} 筆 POI\n`)

  const results: PoiSourceResult[] = []

  for (let i = 0; i < poiData.length; i++) {
    const entry  = poiData[i]
    const prefix = `[${String(i + 1).padStart(2, '0')}/${poiData.length}]`
    process.stdout.write(`${prefix} ${entry.name.padEnd(20)} `)

    try {
      const result = await validateOnePoi(entry)
      results.push(result)

      const pttInfo  = result.p1_ptt.posts_found > 0
        ? `PTT:${result.p1_ptt.posts_found}篇`
        : 'PTT:—'
      const siteInfo = result.p0_official_website?.is_reachable
        ? `官網:✅`
        : 'official:—'
      console.log(`${pttInfo}  ${siteInfo}`)
    } catch (err) {
      console.log('ERROR:', (err as Error).message)
      // 錯誤不中斷，繼續下一筆
      results.push({
        poi_id:    entry.poi_id,
        name:      entry.name,
        region:    entry.region,
        tested_at: new Date().toISOString(),
        p1_ptt:    { posts_found: 0, latest_date: null, boards_hit: [], sample: [] },
        p0_official_website: null,
      })
    }

    // POI 間隔，避免 DDG rate limit
    if (i < poiData.length - 1) await delay(DELAY_BETWEEN_POIS_MS)
  }

  // 寫入 JSON 結果
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`\n✅ JSON 結果已寫入：${OUT_JSON}`)

  // 產生 Markdown 報告
  const report = buildMarkdownReport(results, startedAt)
  fs.writeFileSync(OUT_REPORT, report, 'utf-8')
  console.log(`✅ 報告已寫入：${OUT_REPORT}`)

  // 終端摘要
  const pttHit     = results.filter(r => r.p1_ptt.posts_found > 0).length
  const websiteHit = results.filter(r => r.p0_official_website?.is_reachable).length
  const elapsed    = Math.round((Date.now() - startedAt.getTime()) / 1000)
  console.log('\n──────────────────────────────────────────────')
  console.log(`總計：${results.length} 筆 POI`)
  console.log(`[P1] PTT 有文章：${pttHit} 筆`)
  console.log(`[P0] 官網可連線：${websiteHit} 筆`)
  console.log(`耗時：${elapsed} 秒`)
}

main().catch(err => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
