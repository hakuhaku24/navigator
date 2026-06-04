// [優先級 P1] PTT 旅遊版爬蟲
// 成本：完全免費；純 HTTP GET，不需 Playwright 或任何 API key
//       rate limit: 每板請求間隔 ≥ 1 秒（3 板合計約 3 秒）
// 法律：✅ PTT 為 NTU 公開 BBS，台灣多所大學 NLP 研究長期使用（著作權法第 65 條合理使用）
//       ⚠️ 僅儲存標題 + 連結 + 日期，不整段複製文章內容（文章著作權屬原作者）
//       User-Agent 標明非商業目的；over18=1 cookie 跳過確認頁（不碰需要 18+ 的板）

import type { PoiInput, PttPostRaw } from '../types'

const PTT_BASE   = 'https://www.ptt.cc'
// 只搜旅遊相關版別；不碰 Gossiping 等高噪音 / 18+ 板
const PTT_BOARDS = ['travel', 'Hiking', 'Taipei']

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

function parsePttDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{2})$/)
  if (!m) return null
  const month = parseInt(m[1], 10)
  const day   = parseInt(m[2], 10)
  const now   = new Date()
  let year    = now.getFullYear()
  // PTT 列表日期格式為 MM/DD，無年份
  // 若推算出的日期超過今天 7 天以上，視為上一年（跨年邊界保護）
  const candidate = new Date(year, month - 1, day)
  if (candidate.getTime() > now.getTime() + 7 * 86_400_000) year -= 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parsePttSearchHtml(html: string, board: string): PttPostRaw[] {
  const results: PttPostRaw[] = []
  // 以 <div class="r-ent"> 分割（比嵌套 div regex 更穩定）
  const entries = html.split('<div class="r-ent">')
  entries.shift()  // 丟棄第一個分割前的 header 內容

  for (const block of entries) {
    // 刪除的文章沒有 <a> 標籤，自然跳過
    const linkMatch = block.match(/<a href="(\/bbs\/[^"]+\.html)">([^<]+)<\/a>/)
    if (!linkMatch) continue

    const relUrl = linkMatch[1]
    const title  = linkMatch[2].trim()

    const dateMatch   = block.match(/<div class="date">\s*(\S+)\s*<\/div>/)
    const publishedDate = dateMatch ? parsePttDate(dateMatch[1]) : null

    results.push({
      title,
      url: `${PTT_BASE}${relUrl}`,
      published_date: publishedDate,
      board,
      snippet: '',  // 抓 snippet 需額外請求文章頁；跳過以降低伺服器負擔
    })
  }
  return results
}

export async function searchPttPosts(poi: PoiInput): Promise<PttPostRaw[]> {
  const results: PttPostRaw[] = []

  for (const board of PTT_BOARDS) {
    const url = `${PTT_BASE}/bbs/${board}/search?q=${encodeURIComponent(poi.name)}`
    try {
      const res = await fetch(url, {
        headers: {
          Cookie: 'over18=1',
          'User-Agent': 'NavigatorBot/1.0 (NCU graduation project, non-commercial research)',
        },
      })
      if (!res.ok) {
        console.warn(`[ptt] HTTP ${res.status} on board ${board}`)
      } else {
        results.push(...parsePttSearchHtml(await res.text(), board))
      }
    } catch (err) {
      console.warn(`[ptt] fetch error for board ${board}:`, err)
    }
    await delay(1000)  // 遵守 PTT 隱性 rate limit，避免對 NTU 伺服器造成負擔
  }

  return results
}

export function latestPttDate(posts: PttPostRaw[]): string | undefined {
  const dates = posts
    .map(p => p.published_date)
    .filter((d): d is string => !!d)
    .sort()
    .reverse()
  return dates[0]
}
