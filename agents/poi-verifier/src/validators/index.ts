import type {
  PoiInput,
  GooglePlacesRaw,
  OsmRaw,
  BlogPostRaw,
  YoutubeVideoRaw,
  PttPostRaw,
  OfficialWebsiteRaw,
  VerificationResult,
  SourceMetadata,
  SourceCredibility,
} from '../types'
import { queryGooglePlaces } from './google-places'
import { queryOsm } from './osm'
import { searchBlogPosts, latestBlogDate } from './blog-search'
import { searchYoutubeVideos, latestYoutubeDate } from './youtube-search'  // [P2] 免費 API
import { searchPttPosts, latestPttDate } from './ptt-search'               // [P1] 免費 HTML
import { fetchOfficialWebsite } from './official-website'                  // [P0] 最高信度

// ── Time Decay ─────────────────────────────────────────────────────────────
// time_decay_factor = e^(-(days / halfLife))
const HALF_LIFE: Record<SourceCredibility, number> = {
  official: 60,
  semi_official: 30,
  blog_travel: 180,
  user_feedback: 1,
}

function timeDecay(lastUpdatedAt: string, tier: SourceCredibility): number {
  const days = (Date.now() - new Date(lastUpdatedAt).getTime()) / 86_400_000
  return Math.exp(-(days / HALF_LIFE[tier]))
}

function buildSourceMeta(
  tier: SourceCredibility,
  lastUpdatedAt: string,
): SourceMetadata {
  const decay = timeDecay(lastUpdatedAt, tier)
  const baseConfidence: Record<SourceCredibility, number> = {
    official: 1.0,
    semi_official: 0.8,
    blog_travel: 0.6,
    user_feedback: 0.4,
  }
  return {
    source_type: tier,
    last_updated_at: lastUpdatedAt,
    time_decay_factor: decay,
    confidence: baseConfidence[tier] * decay,
  }
}

// ── Haversine distance (km) ────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const MAX_DISTANCE_KM = 50  // result farther than this is treated as a mismatch

// ── Cross-validation ───────────────────────────────────────────────────────
export interface CrossValidationResult {
  exists: boolean
  sources: VerificationResult['sources']
  reliability_score: number
  source_breakdown: VerificationResult['source_breakdown']
  google: GooglePlacesRaw | null
  osm: OsmRaw | null
  blogs: BlogPostRaw[]
  latest_blog_date?: string
  youtube_videos: YoutubeVideoRaw[]       // [P2] 未過濾業配的原始列表（供 raw_sources 輸出）
  ptt_posts: PttPostRaw[]                 // [P1]
  official_website: OfficialWebsiteRaw | null  // [P0]
  latest_activity_date?: string           // max(blog, youtube, ptt) 日期，供 LLM 判斷時效
}

export async function crossValidate(poi: PoiInput): Promise<CrossValidationResult> {
  const now = new Date().toISOString()
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

  // Parallel: 所有無 rate limit 的來源同時發出
  // [P0] official-website 可能需要一次 DDG 搜尋發現 URL（若 poi.website_url 已知則直接抓）
  // [P1] ptt: 3 板 × 1s delay = ~3s（在 Promise.all 中不阻擋其他來源）
  // [P2] youtube: 單次 API call，通常 < 1s
  const [google, blogs, youtube, ptt, officialSite] = await Promise.all([
    queryGooglePlaces(poi),
    searchBlogPosts(poi),
    searchYoutubeVideos(poi),
    searchPttPosts(poi),
    fetchOfficialWebsite(poi, poi.website_url),
  ])
  const osm = await queryOsm(poi)  // sequential: Nominatim 嚴格 1 req/s

  // Distance filter: discard Google result if it's farther than MAX_DISTANCE_KM
  let googleFiltered = google
  if (google?.geometry) {
    const dist = haversineKm(
      poi.location.latitude, poi.location.longitude,
      google.geometry.lat, google.geometry.lng,
    )
    if (dist > MAX_DISTANCE_KM) {
      console.warn(`[crossValidate] Google Places result too far (${dist.toFixed(0)} km) — discarding`)
      googleFiltered = null
    }
  }

  // 提前計算，供後續 scoring 和 early return 共用
  const nonSponsoredVideos = youtube.filter(v => !v.is_sponsored)

  const sources: VerificationResult['sources'] = []
  if (googleFiltered)               sources.push('google_places')
  if (osm)                          sources.push('osm')
  if (blogs.length)                 sources.push('blog_post')
  if (officialSite?.is_reachable)   sources.push('official_website')  // [P0]
  if (nonSponsoredVideos.length)    sources.push('youtube')           // [P2]
  if (ptt.length)                   sources.push('ptt')               // [P1]

  // Permanently closed → does not exist（仍保留其他來源做紀錄）
  if (googleFiltered?.business_status === 'CLOSED_PERMANENTLY') {
    return {
      exists: false,
      sources,
      reliability_score: 0,
      source_breakdown: {},
      google: googleFiltered,
      osm,
      blogs,
      youtube_videos: youtube,
      ptt_posts: ptt,
      official_website: officialSite,
    }
  }

  // blog / youtube / ptt 都是輔助來源（無座標錨點），無法獨立證明景點存在
  const exists = !!googleFiltered || !!osm

  // ── Reliability scoring ──────────────────────────────────────────────────
  // 加權求和，各來源貢獻可超過 1.0，最終 clamp 至 [0, 1]
  // Google 0.50 + OSM 0.30 + Blog 0.25 + Official 0.15 + YouTube 0.10 + PTT 0.10 = 1.40 max
  const googleWeight = googleFiltered && osm ? 0.50 : googleFiltered ? 0.65 : 0
  const osmWeight    = googleFiltered && osm ? 0.30 : osm            ? 0.50 : 0
  if (googleFiltered && !osm) console.warn(`[crossValidate] "${poi.name}" not found on OSM — Google weight boosted to ${googleWeight}`)
  if (!googleFiltered && osm) console.warn(`[crossValidate] "${poi.name}" not found on Google — OSM weight boosted to ${osmWeight}`)

  let score = 0
  const breakdown: VerificationResult['source_breakdown'] = {}

  if (googleFiltered) {
    const meta = buildSourceMeta('semi_official', now)
    const rating      = googleFiltered.rating              ?? 0
    const reviewCount = googleFiltered.user_ratings_total  ?? 0
    const ratingBonus = rating >= 4.5 ? 0.05 : rating >= 4.0 ? 0.03 : rating >= 3.5 ? 0.01 : 0
    const reviewBonus = reviewCount >= 1000 ? 0.05 : reviewCount >= 100 ? 0.03 : reviewCount >= 10 ? 0.01 : 0
    const qualityConfidence = Math.min(meta.confidence + ratingBonus + reviewBonus, 0.99)
    breakdown.semi_official = { ...meta, confidence: qualityConfidence }
    score += qualityConfidence * googleWeight
  }
  if (osm) {
    const meta = buildSourceMeta('semi_official', now)
    score += meta.confidence * osmWeight
  }
  if (blogs.length) {
    const rawDate    = latestBlogDate(blogs)
    const latestDate = rawDate && ISO_DATE.test(rawDate)
      ? rawDate
      : new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10)
    const meta        = buildSourceMeta('blog_travel', latestDate + 'T00:00:00Z')
    const volumeBonus = blogs.length >= 3 ? 0.1 : blogs.length >= 2 ? 0.05 : 0
    const blogConf    = Math.min(meta.confidence + volumeBonus, 0.75)
    breakdown.blog_travel = { ...meta, confidence: blogConf }
    score += blogConf * 0.25
  }

  // [P0] 官網：信度層 official（半衰期 60 天）；存在 = 最強佐證之一
  if (officialSite?.is_reachable) {
    const siteTs   = officialSite.last_modified ?? now
    const siteMeta = buildSourceMeta('official', siteTs)
    breakdown.official = siteMeta
    score += siteMeta.confidence * 0.15
  }

  // [P2] YouTube：以最新影片日期為信度時間點；排除業配後再計分
  if (nonSponsoredVideos.length) {
    const ytDate  = latestYoutubeDate(nonSponsoredVideos)
    const ytTs    = ytDate
      ? ytDate + 'T00:00:00Z'
      : new Date(Date.now() - 90 * 86_400_000).toISOString()
    const ytMeta  = buildSourceMeta('blog_travel', ytTs)
    const ytBonus = nonSponsoredVideos.length >= 3 ? 0.05 : nonSponsoredVideos.length >= 2 ? 0.02 : 0
    score += Math.min(ytMeta.confidence + ytBonus, 0.70) * 0.10
  }

  // [P1] PTT：真人回饋，負評/踩雷資訊比 IG 更直接
  if (ptt.length) {
    const pttDate  = latestPttDate(ptt)
    const pttTs    = pttDate
      ? pttDate + 'T00:00:00Z'
      : new Date(Date.now() - 90 * 86_400_000).toISOString()
    const pttMeta  = buildSourceMeta('blog_travel', pttTs)
    const pttBonus = ptt.length >= 3 ? 0.05 : ptt.length >= 2 ? 0.02 : 0
    score += Math.min(pttMeta.confidence + pttBonus, 0.70) * 0.10
  }

  // 跨來源最新活動日期，供 LLM 判斷景點時效
  const allActivityDates = [
    latestBlogDate(blogs),
    latestYoutubeDate(nonSponsoredVideos),
    latestPttDate(ptt),
  ].filter((d): d is string => !!d && ISO_DATE.test(d)).sort().reverse()
  const latest_activity_date = allActivityDates[0]

  const reliability_score = Math.min(Math.max(score, 0), 1)

  return {
    exists,
    sources,
    reliability_score,
    source_breakdown: breakdown,
    google: googleFiltered,
    osm,
    blogs,
    latest_blog_date: latestBlogDate(blogs),
    youtube_videos: youtube,
    ptt_posts: ptt,
    official_website: officialSite,
    latest_activity_date,
  }
}
