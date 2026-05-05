import type { PoiInput, BlogPostRaw } from '../types'
import { spawn } from 'child_process'
import * as path from 'path'

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
      published_date: r.date ?? null,
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
  const query = `${poi.name} 旅遊 心得 2024 OR 2025`

  const ddgResults = await duckduckgoSearch(query)
  if (ddgResults.length >= 2) return ddgResults

  // DDG 不夠才動用 Serper，節省額度
  console.warn(`[blog-search] DDG only ${ddgResults.length} result(s), trying Serper`)
  const serperResults = await serperSearch(query)
  return [...ddgResults, ...serperResults].slice(0, 5)
}

export function latestBlogDate(posts: BlogPostRaw[]): string | undefined {
  const dates = posts
    .map((p) => p.published_date)
    .filter((d): d is string => !!d)
    .sort()
    .reverse()
  return dates[0]
}
