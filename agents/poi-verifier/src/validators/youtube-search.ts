// TODO(下一步 1)：申請 YouTube Data API key 並執行測試
//   - GCP Console → 啟用 YouTube Data API v3 → 將 key 存入 .env.local
//   - 執行 ts-node tests/new-validators.test.ts 確認 YouTube 段落通過
//   - 再執行 ts-node tests/batch-new-validators.test.ts 取得含 P2 的完整批次結果

// TODO(下一步 2)：補充 view_count（需額外 videos.list 呼叫）
//   - 目前 view_count: null（跳過以省配額）
//   - 若需觀看數作為「熱門度」信度加權，在 searchYoutubeVideos 後執行
//   - videos.list: 1 unit/影片，45 POI × 5 影片 = 225 units（仍在免費額度）

// [優先級 P2] YouTube Data API v3
// 成本：免費（GCP 每日 10,000 units；search.list = 100 units/次；45 POI 一輪 ≈ 4,500 units）
// 法律：✅ 官方 API，完全合法
//       ⚠️ 僅可用 metadata（標題、說明欄前 200 字、縮圖 URL），不可下載影片本體
//       ❌ 禁止：下載音訊/影片本體、去除廣告、廣告收益導流（違反 YouTube ToS 第 5.B 條）
// 需要：YOUTUBE_DATA_API_KEY 環境變數（GCP Console 開啟 YouTube Data API v3，免費，不需信用卡）

import type { PoiInput, YoutubeVideoRaw } from '../types'

// YouTube paid promotion 標記不透過 API 回傳，只能靠文字辨別
const SPONSORED_KEYWORDS = [
  '廣告', '業配', 'paid partnership', '#ad', 'sponsored', '合作邀約', '贊助', '免費提供',
]

function isSponsored(title: string, description: string): boolean {
  const combined = `${title} ${description}`.toLowerCase()
  return SPONSORED_KEYWORDS.some(kw => combined.includes(kw.toLowerCase()))
}

export async function searchYoutubeVideos(poi: PoiInput): Promise<YoutubeVideoRaw[]> {
  // 大規模匯入時的關閉開關（DISABLE_YOUTUBE_VALIDATOR=1）。
  //
  // 為什麼需要：search.list 每次 100 quota units，GCP 每日免費額度 10,000
  // → **每天最多只能驗 100 筆景點**。匯入 5,000 筆要 50 天，是整條管線最硬的瓶頸。
  //
  // 而它的產出價值偏低：reliability_score 權重只有 0.10，且有相關性污染問題
  // （youtube-search 濾了業配但沒濾「這支影片到底講不講這個景點」，
  // 見 KNOWN_ISSUES.md 2026-07-28）。50 天換 0.10 權重不成比例。
  //
  // 小批量精驗時再打開即可。
  if (process.env.DISABLE_YOUTUBE_VALIDATOR === '1') return []

  const key = process.env.YOUTUBE_DATA_API_KEY
  if (!key) {
    console.warn('[youtube] YOUTUBE_DATA_API_KEY not set — skipping')
    return []
  }

  const query = `${poi.name} 旅遊 景點`
  const params = new URLSearchParams({
    key,
    q: query,
    part: 'snippet',
    type: 'video',
    regionCode: 'TW',
    relevanceLanguage: 'zh-TW',
    maxResults: '5',
    order: 'date',  // 最新優先：用上傳日期判斷景點近期活躍度
  })

  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
    if (!res.ok) {
      console.warn(`[youtube] HTTP ${res.status}`)
      return []
    }
    const data = await res.json() as {
      items?: Array<{
        id?: { videoId?: string }
        snippet?: {
          title?: string
          channelTitle?: string
          publishedAt?: string
          description?: string
        }
      }>
      error?: { message: string }
    }
    if (data.error) {
      console.warn('[youtube] API error:', data.error.message)
      return []
    }

    return (data.items ?? [])
      .map((item): YoutubeVideoRaw => {
        const snippet = item.snippet ?? {}
        const videoId = item.id?.videoId ?? ''
        const title       = snippet.title       ?? ''
        const description = snippet.description ?? ''
        return {
          video_id: videoId,
          title,
          channel_name:        snippet.channelTitle ?? '',
          published_at:        snippet.publishedAt?.slice(0, 10) ?? null,
          description_snippet: description.slice(0, 200),
          // view_count 需要額外 videos.list 呼叫（1 unit/call），暫不抓以節省配額
          view_count:   null,
          is_sponsored: isSponsored(title, description),
          url: `https://www.youtube.com/watch?v=${videoId}`,
        }
      })
      .filter(v => v.video_id && !v.is_sponsored)
  } catch (err) {
    console.warn('[youtube] fetch error:', err)
    return []
  }
}

export function latestYoutubeDate(videos: YoutubeVideoRaw[]): string | undefined {
  const dates = videos
    .map(v => v.published_at)
    .filter((d): d is string => !!d)
    .sort()
    .reverse()
  return dates[0]
}
