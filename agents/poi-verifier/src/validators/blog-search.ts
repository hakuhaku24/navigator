import type { PoiInput, BlogPostRaw } from '../types'

const API_KEY = process.env.GOOGLE_PLACES_API_KEY   // reuse same project key
const SEARCH_ENGINE_ID = process.env.GOOGLE_CSE_ID   // Custom Search Engine ID

// Fallback: DuckDuckGo Instant Answer (no key needed, limited results)
async function duckduckgoSearch(query: string): Promise<BlogPostRaw[]> {
  const q = encodeURIComponent(query)
  const url = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Navigator-POI-Verifier/0.1' },
    })
    if (!res.ok) return []
    const data = await res.json()

    const results: BlogPostRaw[] = []

    // RelatedTopics often contain travel blog snippets
    for (const topic of data.RelatedTopics ?? []) {
      if (topic.FirstURL && topic.Text) {
        results.push({
          title: topic.Text.slice(0, 80),
          url: topic.FirstURL,
          published_date: null,   // DDG doesn't expose dates
          snippet: topic.Text,
          source: 'duckduckgo',
        })
      }
      if (results.length >= 3) break
    }
    return results
  } catch {
    return []
  }
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
    if (!res.ok) return []
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

  // Try Google CSE first; fall back to DDG
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
