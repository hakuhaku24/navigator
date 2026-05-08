import type { PoiInput, BlogPostRaw } from '../types'
import { spawn } from 'child_process'
import * as path from 'path'

const TW_REGIONS = [
  '台北', '新北', '基隆', '宜蘭', '花蓮', '台東', '澎湖', '金門', '馬祖',
  '桃園', '新竹', '苗栗', '台中', '彰化', '南投', '雲林', '嘉義', '台南',
  '高雄', '屏東', '陽明山', '北海岸', '東北角',
]

// Extract date from snippet text – covers formats that Python may not capture
export function extractDateFromSnippet(text: string): string | null {
  const cnMatch = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/)
  if (cnMatch) {
    const [, y, m, d] = cnMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (isoMatch) return isoMatch[0]
  const slashMatch = text.match(/\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/)
  if (slashMatch) {
    const [, y, m, d] = slashMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

// Remove posts that are clearly about a same-name spot in a different region.
// Strategy: if we can identify a region from description, keep only posts that mention it.
// Falls back to full list when filtering would leave nothing.
function filterByLocation(posts: BlogPostRaw[], poi: PoiInput): BlogPostRaw[] {
  const regionInDesc = poi.user_description
    ? TW_REGIONS.find(r => poi.user_description!.includes(r))
    : undefined
  if (!regionInDesc) return posts

  const relevant = posts.filter(p => {
    const text = `${p.title} ${p.snippet}`
    return text.includes(regionInDesc) || text.includes(poi.name)
  })
  return relevant.length > 0 ? relevant : posts
}

// ── DuckDuckGo via Python ddgs (primary, no quota) ────────────────────────
async function duckduckgoSearch(query: string): Promise<BlogPostRaw[]> {
  const scriptPath = path.join(__dirname, '../../scripts/ddg_search.py')
  return new Promise((resolve) => {
    const proc = spawn('python', [scriptPath, query], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    let output = ''
    proc.stdout.on('data', (d) => { output += d.toString() })
    proc.stderr.on('data', (d) => console.warn('[ddg]', d.toString().trim()))
    proc.on('close', () => {
      try { resolve(JSON.parse(output) as BlogPostRaw[]) }
      catch { resolve([]) }
    })
    proc.on('error', () => resolve([]))
  })
}

// ── Serper (fallback, use only when DDG < 2 results) ──────────────────────
async function serperSearch(query: string): Promise<BlogPostRaw[]> {
  const key = process.env.SERPER_API_KEY
  if (!key) return []

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'tw', hl: 'zh-tw', num: 5 }),
    })
    if (!res.ok) {
      console.warn(`[serper] HTTP ${res.status}`)
      return []
    }
    const data = await res.json()
    return (data.organic ?? []).map((r: any) => ({
      title: r.title ?? '',
      url: r.link ?? '',
      published_date: r.date ?? extractDateFromSnippet(r.snippet ?? '') ?? null,
      snippet: r.snippet ?? '',
      source: 'serper',
    }))
  } catch (err) {
    console.warn('[serper] error:', err)
    return []
  }
}

// ── Main entry ─────────────────────────────────────────────────────────────
export async function searchBlogPosts(poi: PoiInput): Promise<BlogPostRaw[]> {
  // Include region hint to avoid returning same-name spots in wrong location
  const regionHint = poi.user_description
    ? (TW_REGIONS.find(r => poi.user_description!.includes(r)) ?? '')
    : ''
  const query = `${poi.name} ${regionHint} 旅遊 心得 2024 OR 2025`.trim()

  const ddgResults = await duckduckgoSearch(query)
  if (ddgResults.length >= 2) return filterByLocation(ddgResults, poi)

  // DDG 不夠才動用 Serper，節省額度
  console.warn(`[blog-search] DDG only ${ddgResults.length} result(s), trying Serper`)
  const serperResults = await serperSearch(query)
  return filterByLocation([...ddgResults, ...serperResults].slice(0, 5), poi)
}

export function latestBlogDate(posts: BlogPostRaw[]): string | undefined {
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
  const dates = posts
    .map((p) => p.published_date ?? extractDateFromSnippet(p.snippet))
    .filter((d): d is string => !!d && ISO_DATE.test(d))
    .sort()
    .reverse()
  return dates[0]
}
