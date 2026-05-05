import type { PoiInput, BlogPostRaw } from '../types'
import { spawn } from 'child_process'
import * as path from 'path'

const API_KEY = process.env.GOOGLE_CSE_API_KEY
const SEARCH_ENGINE_ID = process.env.GOOGLE_CSE_ID

// Fallback: DuckDuckGo via Python ddgs (simulates browser, returns real blog results)
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
      try {
        resolve(JSON.parse(output) as BlogPostRaw[])
      } catch {
        resolve([])
      }
    })
    proc.on('error', () => resolve([]))
  })
}

// Primary: Google Custom Search API
async function googleCustomSearch(query: string): Promise<BlogPostRaw[]> {
  if (!API_KEY || !SEARCH_ENGINE_ID) return []

  const q = encodeURIComponent(query)
  const url =
    `https://www.googleapis.com/customsearch/v1` +
    `?key=${API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${q}&num=5&lr=lang_zh-TW`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.text()
      console.warn(`[blog-search] CSE HTTP ${res.status}: ${body.slice(0, 200)}`)
      return []
    }
    const data = await res.json()

    return (data.items ?? []).map((item: any) => ({
      title: item.title ?? '',
      url: item.link ?? '',
      // pagemap.metatags sometimes has article:published_time
      published_date:
        item.pagemap?.metatags?.[0]?.['article:published_time']?.slice(0, 10) ??
        item.pagemap?.metatags?.[0]?.['og:updated_time']?.slice(0, 10) ??
        null,
      snippet: item.snippet ?? '',
      source: 'google_cse',
    }))
  } catch {
    return []
  }
}

export async function searchBlogPosts(poi: PoiInput): Promise<BlogPostRaw[]> {
  const query = `${poi.name} 旅遊 心得 2024 OR 2025`

  // Try Google CSE first; fall back to DuckDuckGo (Python ddgs)
  const results = await googleCustomSearch(query)
  if (results.length > 0) return results

  console.warn('[blog-search] Google CSE unavailable, falling back to DuckDuckGo')
  return duckduckgoSearch(query)
}

// Extract the most recent published date from blog results
export function latestBlogDate(posts: BlogPostRaw[]): string | undefined {
  const dates = posts
    .map((p) => p.published_date)
    .filter((d): d is string => !!d)
    .sort()
    .reverse()
  return dates[0]
}
