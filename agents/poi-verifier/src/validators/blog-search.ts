import type { PoiInput, BlogPostRaw } from '../types'

const API_KEY = process.env.GOOGLE_PLACES_API_KEY   // reuse same project key
const SEARCH_ENGINE_ID = process.env.GOOGLE_CSE_ID   // Custom Search Engine ID

// Fallback: Wikipedia zh API (no key needed, returns factual POI summary)
async function wikipediaSearch(poiName: string): Promise<BlogPostRaw[]> {
  const title = encodeURIComponent(poiName)
  const url =
    `https://zh.wikipedia.org/w/api.php?action=query&titles=${title}` +
    `&prop=extracts&exintro=true&explaintext=true&format=json&origin=*`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Navigator-POI-Verifier/0.1' },
    })
    if (!res.ok) return []
    const data = await res.json()

    const pages = data.query?.pages ?? {}
    const page = Object.values(pages)[0] as any

    // page id -1 means not found
    if (!page || page.pageid === -1 || !page.extract) return []

    return [{
      title: page.title,
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      published_date: null,
      snippet: (page.extract as string).slice(0, 300),
      source: 'wikipedia',
    }]
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

  // Try Google CSE first; fall back to Wikipedia
  const results = await googleCustomSearch(query)
  if (results.length > 0) return results

  console.warn('[blog-search] Google CSE unavailable, falling back to Wikipedia')
  return wikipediaSearch(poi.name)
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
