// [優先級 P0] 景點官網驗證（最高信度）
// 成本：URL 發現：1 次 DDG 搜尋（免費）+ robots.txt 確認（免費）
//       頁面抓取：HTTP GET，免費；6 秒 timeout；每週執行一次即可
// 法律：✅ 遵守 robots.txt（強制執行，不可跳過）
//       ✅ 台灣著作權法第 65 條：非商業學術研究合理使用
//       ⚠️ rate limit ≤ 3 次/天/網站；禁止繞過 CAPTCHA
//       ⚠️ 刑法第 360 條（妨礙電腦使用罪）：高頻率存取可能觸犯，務必設合理間隔

import type { PoiInput, OfficialWebsiteRaw } from '../types'
import { duckduckgoSearch } from './blog-search'

// 台灣部分 .gov.tw 網站首頁回應較慢（實測 taroko.gov.tw ~6.5s）；設 12s 以確保覆蓋
const FETCH_TIMEOUT_MS = 12000

// 略過的網域（聚合器、社群、搜尋引擎）
const SKIP_URL_FRAGMENTS = [
  'google.', 'facebook.', 'instagram.', 'youtube.', 'twitter.', 'x.com',
  'kkday.', 'klook.', 'expedia.', 'booking.', 'agoda.', 'tripadvisor.',
  'pixnet.', 'blogger.', 'tumblr.', 'wikipedia.',
]
// 優先選取台灣官方網域
const OFFICIAL_TW_DOMAINS = ['.gov.tw', '.edu.tw', '.org.tw']

async function canFetch(targetUrl: string): Promise<boolean> {
  try {
    const origin = new URL(targetUrl).origin
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return true  // 沒有 robots.txt → 預設允許
    const text = await res.text()
    // 最小化 robots.txt 解析：只看 User-agent: * 下是否有 Disallow: /
    let inWildcard = false
    for (const line of text.split('\n').map(l => l.trim())) {
      if (line.toLowerCase() === 'user-agent: *')    { inWildcard = true;  continue }
      if (/^user-agent:/i.test(line))                { inWildcard = false; continue }
      if (inWildcard && /^disallow:\s*\/\s*$/i.test(line)) return false
    }
    return true
  } catch {
    return true  // 網路錯誤 → fail open（允許）
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractMeta(html: string): { title: string | null; description: string | null } {
  const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)
  const descMatch =
    html.match(/<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']{1,300})["']/i) ??
    html.match(/<meta\s[^>]*content=["']([^"']{1,300})["'][^>]*name=["']description["']/i)
  return {
    title:       titleMatch?.[1]?.trim() ?? null,
    description: descMatch?.[1]?.trim()  ?? null,
  }
}

// 驗證抓到的頁面內容是否與景點相關
// 規則：頁面 title 或 excerpt 須包含景點名稱中至少一個 2 字以上的中文詞
// 目的：阻止 DDG 模糊搜尋把無關網頁當成官網回傳（不捏造 URL）
function isRelevantToPoi(poiName: string, pageTitle: string | null, excerpt: string): boolean {
  // 去除括號標記，例如「(預約席)」「（定時導覽）」「(門票)」
  const cleanName = poiName.replace(/[（(][^）)]*[）)]/g, '').trim()
  // 取出所有 2 字以上的中英文詞段
  const words = cleanName.match(/[一-鿿\w]{2,}/g) ?? []
  if (!words.length) return true  // 無法萃取詞段時寬鬆放行
  const pageText = `${pageTitle ?? ''} ${excerpt}`.toLowerCase()
  return words.some(w => pageText.includes(w.toLowerCase()))
}

async function discoverWebsiteUrl(poiName: string): Promise<string | null> {
  // 使用已有的 DDG 搜尋基礎設施，不另立新工具
  const results = await duckduckgoSearch(`${poiName} 官方網站 OR 官網`)

  const isSkipped  = (url: string) => SKIP_URL_FRAGMENTS.some(f => url.toLowerCase().includes(f))
  const isOfficial = (url: string) => OFFICIAL_TW_DOMAINS.some(d => url.toLowerCase().includes(d))

  // 優先：.gov.tw / .edu.tw / .org.tw 且非聚合器
  const preferred = results.find(r => isOfficial(r.url) && !isSkipped(r.url))
  // 備選：任何非聚合器結果
  const fallback  = results.find(r => !isSkipped(r.url))
  return preferred?.url ?? fallback?.url ?? null
}

export async function fetchOfficialWebsite(
  poi: PoiInput,
  websiteUrl?: string,
): Promise<OfficialWebsiteRaw | null> {
  const url = websiteUrl ?? await discoverWebsiteUrl(poi.name)
  if (!url) return null

  if (!await canFetch(url)) {
    console.warn(`[official-website] robots.txt blocks ${url}`)
    return null
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'NavigatorBot/1.0 (NCU graduation project, non-commercial research)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })

    const lastModified = res.headers.get('last-modified')

    if (!res.ok) {
      return { url, page_title: null, last_modified: null, excerpt: '', is_reachable: false }
    }

    const html = await res.text()
    const { title, description } = extractMeta(html)
    const excerpt = description ?? stripHtml(html).slice(0, 500)

    // 相關性驗證：若頁面內容與景點名稱無關，視為 DDG 誤報，回傳 null 而非假 URL
    if (!isRelevantToPoi(poi.name, title, excerpt)) {
      console.warn(`[official-website] "${title ?? url}" 與景點「${poi.name}」無關 — 捨棄，不回傳假 URL`)
      return null
    }

    return { url, page_title: title, last_modified: lastModified, excerpt, is_reachable: true }
  } catch (err) {
    console.warn(`[official-website] fetch error for ${url}:`, err)
    return { url, page_title: null, last_modified: null, excerpt: '', is_reachable: false }
  }
}
