/**
 * 45 POI 批次驗證：P2（YouTube Data API v3）
 * 執行：ts-node tests/batch-youtube-validators.test.ts
 *
 * 資料來源：results/poi_verified.json（45 筆實際 POI）
 * 輸出：
 *   results/poi_youtube_results.json       ← 每筆 POI 的 P2 原始結果
 *   tests/batch-youtube-validators-report.md ← 人讀摘要報告
 *
 * ⚠️  注意：
 *   - YouTube Data API v3 search.list = 100 units/次
 *   - 45 筆全跑 ≈ 4,500 units（免費額度 10,000 units/日，安全）
 *   - 請求間隔 800ms（避免 API rate limit）
 *   - 需設定 YOUTUBE_DATA_API_KEY 環境變數
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '../../../.env' })
dotenv.config({ path: '../.env' })

import * as fs   from 'fs'
import * as path from 'path'
import { searchYoutubeVideos, latestYoutubeDate } from '../src/validators/youtube-search'
import type { PoiInput, YoutubeVideoRaw } from '../src/types'

// ── 型別 ──────────────────────────────────────────────────────────────────────

interface PoiVerifiedEntry {
  poi_id:      string
  name:        string
  region:      string
  verified_at: string
  result:      { poi_input: PoiInput }
}

interface PoiYoutubeResult {
  poi_id:    string
  name:      string
  region:    string
  tested_at: string
  p2_youtube: {
    videos_found:       number
    sponsored_excluded: number
    latest_date:        string | null
    quota_units_used:   number
    sample:             Array<{
      title:        string
      url:          string
      channel_name: string
      published_at: string | null
    }>
  }
}

// ── 設定 ──────────────────────────────────────────────────────────────────────

const RESULTS_DIR = path.join(__dirname, '../results')
const OUT_JSON    = path.join(RESULTS_DIR, 'poi_youtube_results.json')
const OUT_REPORT  = path.join(__dirname, 'batch-youtube-validators-report.md')
const DELAY_BETWEEN_POIS_MS = 800

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── 核心：單筆 POI 驗證 ────────────────────────────────────────────────────────

async function validateOnePoi(entry: PoiVerifiedEntry): Promise<PoiYoutubeResult> {
  const poi = entry.result.poi_input

  // [P2] YouTube — search.list (100 units)，maxResults=5，過濾業配
  const videos: YoutubeVideoRaw[] = await searchYoutubeVideos(poi)
  const latest = latestYoutubeDate(videos) ?? null

  return {
    poi_id:    entry.poi_id,
    name:      entry.name,
    region:    entry.region,
    tested_at: new Date().toISOString(),
    p2_youtube: {
      videos_found:       videos.length,
      sponsored_excluded: 0,  // searchYoutubeVideos 已在內部過濾並排除，此欄位為預留
      latest_date:        latest,
      quota_units_used:   100,  // search.list 固定 100 units/次
      sample: videos.slice(0, 2).map(v => ({
        title:        v.title,
        url:          v.url,
        channel_name: v.channel_name,
        published_at: v.published_at,
      })),
    },
  }
}

// ── 報告產生 ──────────────────────────────────────────────────────────────────

function buildMarkdownReport(results: PoiYoutubeResult[], startedAt: Date): string {
  const now        = new Date()
  const elapsed    = Math.round((now.getTime() - startedAt.getTime()) / 1000)
  const ytHit      = results.filter(r => r.p2_youtube.videos_found > 0).length
  const totalVids  = results.reduce((s, r) => s + r.p2_youtube.videos_found, 0)
  const totalUnits = results.reduce((s, r) => s + r.p2_youtube.quota_units_used, 0)

  const lines: string[] = []

  lines.push('# 45 POI 批次驗證報告：P2（YouTube Data API v3）')
  lines.push('')
  lines.push('> ⚠️ **測試資料聲明**：本報告使用的 45 筆 POI 來自 `results/poi_verified.json`（專案實際資料集），非 Claude 自行選定的情境。')
  lines.push('')
  lines.push(`**執行時間**：${startedAt.toLocaleString('zh-TW')}  `)
  lines.push(`**完成時間**：${now.toLocaleString('zh-TW')}（耗時 ${elapsed} 秒）  `)
  lines.push(`**測試腳本**：\`tests/batch-youtube-validators.test.ts\`  `)
  lines.push(`**結果 JSON**：\`results/poi_youtube_results.json\``)
  lines.push('')
  lines.push('## 總覽')
  lines.push('')
  lines.push('| 項目 | 數值 |')
  lines.push('|------|------|')
  lines.push(`| 測試 POI 總數 | ${results.length} 筆 |`)
  lines.push(`| [P2] 找到 YouTube 影片的景點 | ${ytHit} / ${results.length} |`)
  lines.push(`| [P2] 影片總數（業配已排除） | ${totalVids} 支 |`)
  lines.push(`| [P2] 本次消耗 API 配額 | ${totalUnits} units（免費額度 10,000 units/日）|`)
  lines.push(`| [P2] 剩餘免費額度 | 約 ${10000 - totalUnits} units |`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // 按地區分組
  const regions = [...new Set(results.map(r => r.region))]
  for (const region of regions) {
    const group = results.filter(r => r.region === region)
    lines.push(`## ${region}（${group.length} 筆）`)
    lines.push('')
    lines.push('| POI ID | 景點名稱 | [P2] YT 影片數 | 最新影片日期 | 熱門頻道（前 2） |')
    lines.push('|--------|---------|--------------|------------|----------------|')

    for (const r of group) {
      const count      = r.p2_youtube.videos_found > 0 ? `${r.p2_youtube.videos_found} 支` : '—'
      const latest     = r.p2_youtube.latest_date ?? '—'
      const channels   = r.p2_youtube.sample.length > 0
        ? r.p2_youtube.sample.map(v => v.channel_name).join('、').slice(0, 30)
        : '—'
      lines.push(`| ${r.poi_id} | ${r.name} | ${count} | ${latest} | ${channels} |`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('## 觀察與建議')
  lines.push('')

  // YouTube 零結果景點
  const ytZero = results.filter(r => r.p2_youtube.videos_found === 0)
  if (ytZero.length) {
    lines.push(`### YouTube 零結果景點（${ytZero.length} 筆）`)
    lines.push('')
    lines.push('以下景點無非業配 YouTube 影片，可能原因：小眾景點、中文關鍵字搜尋不易命中、或景點名稱需加別名。')
    lines.push('')
    ytZero.forEach(r => lines.push(`- \`${r.poi_id}\` ${r.name}`))
    lines.push('')
  }

  // Top 5 影片最多的景點
  const top5 = [...results]
    .filter(r => r.p2_youtube.videos_found > 0)
    .sort((a, b) => b.p2_youtube.videos_found - a.p2_youtube.videos_found)
    .slice(0, 5)
  if (top5.length) {
    lines.push('### 影片數最多的景點（Top 5）')
    lines.push('')
    top5.forEach(r => {
      lines.push(`- \`${r.poi_id}\` **${r.name}**：${r.p2_youtube.videos_found} 支（最新：${r.p2_youtube.latest_date ?? '—'}）`)
    })
    lines.push('')
  }

  // 最近上傳影片的景點（近期活躍度代理）
  const recentlyActive = [...results]
    .filter(r => r.p2_youtube.latest_date !== null)
    .sort((a, b) => (b.p2_youtube.latest_date! > a.p2_youtube.latest_date! ? 1 : -1))
    .slice(0, 5)
  if (recentlyActive.length) {
    lines.push('### 最新影片上傳日期（景點近期活躍度，前 5）')
    lines.push('')
    recentlyActive.forEach(r => {
      lines.push(`- \`${r.poi_id}\` **${r.name}**：${r.p2_youtube.latest_date}`)
    })
    lines.push('')
  }

  lines.push('### 已知限制')
  lines.push('')
  lines.push('- **業配過濾**：以關鍵字（業配、廣告、sponsored 等）判斷，部分隱性業配無法偵測')
  lines.push('- **view_count 未抓取**：觀看數需額外 `videos.list` call（1 unit/支），本次省略以節省配額')
  lines.push('- **搜尋關鍵字固定**：目前用「{名稱} 旅遊 景點」，部分景點可能有更精準的別名')
  lines.push('- **regionCode=TW**：僅搜尋台灣地區上傳的影片，境外台灣旅遊影片可能遺漏')
  lines.push('- **本批次測試**：P2 獨立執行，未整合至完整 `verifyPoi()` pipeline（無 LLM enrichment）')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## 下一步（TODO）')
  lines.push('')
  lines.push('1. **補齊 view_count（選擇性）**')
  lines.push('   - 在 `searchYoutubeVideos` 後執行 `videos.list`（1 unit/支）')
  lines.push('   - 45 POI × 5 影片 = 225 units，仍在免費額度內')
  lines.push('   - 用於「熱門度」加權，提升 reliability_score 精準度')
  lines.push('')
  lines.push('2. **整合進完整 `verifyPoi()` pipeline**')
  lines.push('   - 在 `batch-verify.ts` 加入 P2 旗標，觸發完整管線')
  lines.push('   - 對比加入 YouTube 後 reliability_score 提升幅度')
  lines.push('')
  lines.push('3. **補充景點別名搜尋**')
  lines.push('   - 對零結果景點，嘗試備用搜尋詞（例如「老梅」替代「老梅綠石槽」）')
  lines.push('   - 在 `searchYoutubeVideos` 加入 `aliases` 參數支援')

  return lines.join('\n')
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date()
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║   45 POI 批次驗證：P2（YouTube Data API v3）                ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`開始時間：${startedAt.toLocaleString('zh-TW')}\n`)

  if (!process.env.YOUTUBE_DATA_API_KEY) {
    console.error('❌  YOUTUBE_DATA_API_KEY 未設定，請先在 .env 填入 API key')
    process.exit(1)
  }
  console.log('✅  YOUTUBE_DATA_API_KEY 已讀取\n')

  const poiData: PoiVerifiedEntry[] = JSON.parse(
    fs.readFileSync(path.join(RESULTS_DIR, 'poi_verified.json'), 'utf-8')
  )
  console.log(`載入 ${poiData.length} 筆 POI\n`)

  const results: PoiYoutubeResult[] = []
  let totalUnitsUsed = 0

  for (let i = 0; i < poiData.length; i++) {
    const entry  = poiData[i]
    const prefix = `[${String(i + 1).padStart(2, '0')}/${poiData.length}]`
    process.stdout.write(`${prefix} ${entry.name.padEnd(22)} `)

    try {
      const result = await validateOnePoi(entry)
      results.push(result)
      totalUnitsUsed += result.p2_youtube.quota_units_used

      const ytInfo = result.p2_youtube.videos_found > 0
        ? `YT:${result.p2_youtube.videos_found}支  最新:${result.p2_youtube.latest_date ?? '—'}`
        : 'YT:—'
      console.log(ytInfo)
    } catch (err) {
      console.log('ERROR:', (err as Error).message)
      results.push({
        poi_id:    entry.poi_id,
        name:      entry.name,
        region:    entry.region,
        tested_at: new Date().toISOString(),
        p2_youtube: {
          videos_found: 0,
          sponsored_excluded: 0,
          latest_date: null,
          quota_units_used: 100,
          sample: [],
        },
      })
      totalUnitsUsed += 100
    }

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
  const ytHit  = results.filter(r => r.p2_youtube.videos_found > 0).length
  const elapsed = Math.round((Date.now() - startedAt.getTime()) / 1000)
  console.log('\n──────────────────────────────────────────────')
  console.log(`總計：${results.length} 筆 POI`)
  console.log(`[P2] 找到 YouTube 影片：${ytHit} 筆`)
  console.log(`[P2] 消耗配額：${totalUnitsUsed} units / 10,000 units`)
  console.log(`耗時：${elapsed} 秒`)
}

main().catch(err => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
