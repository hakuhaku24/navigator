/**
 * P0/P1/P2 增強入庫腳本
 *
 * 從三個已有的批次結果檔案合併 P0（官網）、P1（PTT）、P2（YouTube）資料，
 * 注入每筆 POI 的 raw_sources 後重新 embed + 寫入 Supabase poi_catalog。
 *
 * Usage:
 *   npx ts-node ingest-with-p012.ts
 *
 * 前提（三個結果檔案都必須存在）：
 *   results/poi_verified.json              ← batch-verify.ts 產出
 *   results/poi_ptt_official_results.json  ← batch-new-validators.test.ts 產出
 *   results/poi_youtube_results.json       ← batch-youtube-validators.test.ts 產出
 *
 * Rate limit：Gemini embedding + insights 各 1 次 → 每筆 ≥ 11s
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })
dotenv.config({ path: '../../.env' })

import * as fs   from 'fs'
import * as path from 'path'
import { ingestToDB } from './src/ingestion'
import type { IngestSignals } from './src/ingestion'
import type {
  PoiVerifierOutput,
  PttPostRaw,
  YoutubeVideoRaw,
  OfficialWebsiteRaw,
} from './src/types'

// ── 型別（批次結果檔案的結構）────────────────────────────────────────────────

interface VerifiedEntry {
  poi_id:      string
  name:        string
  region:      string
  verified_at: string
  result:      PoiVerifierOutput | { error: string }
}

interface P01Result {
  poi_id: string
  p1_ptt: {
    posts_found:  number
    latest_date:  string | null
    boards_hit:   string[]
    sample: Array<{ title: string; url: string; board: string; date: string | null }>
  }
  p0_official_website: OfficialWebsiteRaw | null
}

interface P2Result {
  poi_id: string
  p2_youtube: {
    videos_found:       number
    latest_date:        string | null
    sample: Array<{ title: string; url: string; channel_name: string; published_at: string | null }>
  }
}

// ── 路徑設定 ─────────────────────────────────────────────────────────────────

const RESULTS_DIR    = path.join(__dirname, 'results')
const VERIFIED_PATH  = path.join(RESULTS_DIR, 'poi_verified.json')
const P01_PATH       = path.join(RESULTS_DIR, 'poi_ptt_official_results.json')
const P2_PATH        = path.join(RESULTS_DIR, 'poi_youtube_results.json')
const DELAY_MS       = 11_000   // Gemini 免費版 10 RPM → 每筆 ≥ 6s；11s 含緩衝

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── 主流程 ────────────────────────────────────────────────────────────────────

;(async () => {
  // 1. 確認三個來源檔案都存在
  for (const p of [VERIFIED_PATH, P01_PATH, P2_PATH]) {
    if (!fs.existsSync(p)) {
      console.error(`❌  找不到必要檔案：${p}`)
      process.exit(1)
    }
  }

  // 2. 讀取三份 JSON
  const verified: VerifiedEntry[] = JSON.parse(fs.readFileSync(VERIFIED_PATH, 'utf-8'))
  const p01Map = new Map<string, P01Result>(
    (JSON.parse(fs.readFileSync(P01_PATH, 'utf-8')) as P01Result[]).map(r => [r.poi_id, r])
  )
  const p2Map = new Map<string, P2Result>(
    (JSON.parse(fs.readFileSync(P2_PATH, 'utf-8')) as P2Result[]).map(r => [r.poi_id, r])
  )

  console.log(`\n載入：${verified.length} 筆 verified | ${p01Map.size} 筆 P0/P1 | ${p2Map.size} 筆 P2\n`)

  // 3. 過濾可入庫的筆數
  const valid = verified.filter(
    e => !('error' in e.result) && (e.result as PoiVerifierOutput).verification_result.exists
  )
  console.log(`可入庫：${valid.length} / ${verified.length} 筆（不存在或驗證失敗已排除）\n`)

  let success = 0
  let failed  = 0

  for (let i = 0; i < valid.length; i++) {
    const entry = valid[i]
    const poi   = entry.result as PoiVerifierOutput
    const p01   = p01Map.get(entry.poi_id)
    const p2    = p2Map.get(entry.poi_id)

    process.stdout.write(`[${String(i + 1).padStart(2, '0')}/${valid.length}] ${entry.poi_id} ${entry.name.padEnd(20)}  `)

    // 4. 將 P1 sample 重建為 PttPostRaw[]，注入 raw_sources
    const pttPosts: PttPostRaw[] = (p01?.p1_ptt.sample ?? []).map(s => ({
      title:          s.title,
      url:            s.url,
      published_date: s.date,
      board:          s.board,
      snippet:        '',
    }))

    // 5. 將 P2 sample 重建為 YoutubeVideoRaw[]（業配已在批次測試中過濾）
    const ytVideos: YoutubeVideoRaw[] = (p2?.p2_youtube.sample ?? []).map(s => ({
      video_id:            s.url.split('v=')[1] ?? '',
      title:               s.title,
      channel_name:        s.channel_name,
      published_at:        s.published_at,
      description_snippet: '',
      view_count:          null,
      is_sponsored:        false,
      url:                 s.url,
    }))

    // 6. 注入合併後的 raw_sources（不覆蓋 google_places / osm / blog_posts）
    poi.raw_sources = {
      ...poi.raw_sources,
      ptt_posts:        pttPosts,
      youtube_videos:   ytVideos,
      official_website: p01?.p0_official_website ?? poi.raw_sources?.official_website,
    }

    // 7. 提供外部批次訊號（count/date 來自完整批次結果，比 sample 長度準確）
    const signals: IngestSignals = {
      ptt_post_count:           p01?.p1_ptt.posts_found ?? pttPosts.length,
      ptt_latest_date:          p01?.p1_ptt.latest_date ?? null,
      youtube_video_count:      p2?.p2_youtube.videos_found ?? ytVideos.length,
      youtube_latest_date:      p2?.p2_youtube.latest_date ?? null,
      official_website_url:
        p01?.p0_official_website?.is_reachable ? p01.p0_official_website.url : null,
      official_website_excerpt:
        p01?.p0_official_website?.is_reachable
          ? (p01.p0_official_website.excerpt?.slice(0, 300) ?? null)
          : null,
    }

    try {
      const ir = await ingestToDB(poi, { sourceId: entry.poi_id, region: entry.region }, signals)

      if (ir.skipped) {
        console.log(`SKIP  ${ir.error}`)
      } else if (!ir.success) {
        console.log(`FAIL  ${ir.error}`)
        failed++
      } else {
        const pttInfo = signals.ptt_post_count   ? `PTT:${signals.ptt_post_count}篇` : 'PTT:—'
        const ytInfo  = signals.youtube_video_count ? `YT:${signals.youtube_video_count}支` : 'YT:—'
        const p0Info  = signals.official_website_url ? 'P0:✅' : 'P0:—'
        console.log(`✅  ${pttInfo}  ${ytInfo}  ${p0Info}  dim=${ir.embeddingDim}`)
        success++
      }
    } catch (err) {
      console.log(`ERROR  ${(err as Error).message}`)
      failed++
    }

    if (i < valid.length - 1) await sleep(DELAY_MS)
  }

  console.log('\n──────────────────────────────────────────────')
  console.log(`完成：${success} 成功 ／ ${failed} 失敗 ／ ${valid.length - success - failed} 略過`)
})()
