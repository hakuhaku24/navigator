import type {
  PoiInput,
  GooglePlacesRaw,
  OsmRaw,
  BlogPostRaw,
  VerificationResult,
  SourceMetadata,
  SourceCredibility,
} from '../types'
import { queryGooglePlaces } from './google-places'
import { queryOsm } from './osm'
import { searchBlogPosts, latestBlogDate } from './blog-search'

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
}

export async function crossValidate(poi: PoiInput): Promise<CrossValidationResult> {
  const now = new Date().toISOString()

  // Parallel: Google Places + Blog search; OSM after (rate-limited)
  const [google, blogs] = await Promise.all([
    queryGooglePlaces(poi),
    searchBlogPosts(poi),
  ])
  const osm = await queryOsm(poi)  // sequential due to 1 req/s limit

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

  const sources: VerificationResult['sources'] = []
  if (googleFiltered) sources.push('google_places')
  if (osm)           sources.push('osm')
  if (blogs.length)  sources.push('blog_post')

  // Permanently closed → does not exist
  if (googleFiltered?.business_status === 'CLOSED_PERMANENTLY') {
    return {
      exists: false,
      sources,
      reliability_score: 0,
      source_breakdown: {},
      google: googleFiltered,
      osm,
      blogs,
    }
  }

  // blog is a supplementary source (no coordinate anchor) — cannot prove existence alone
  const exists = !!googleFiltered || !!osm

  // Reliability score: weighted sum with dynamic normalization.
  // When only one structured source (Google or OSM) is available, its weight is boosted
  // to avoid unfairly penalizing spots with incomplete platform coverage.
  // Base: Google 0.50, OSM 0.30, Blog 0.20 (sum ≈ 1.0 when all present)
  const googleWeight = googleFiltered && osm ? 0.50 : googleFiltered ? 0.65 : 0
  const osmWeight    = googleFiltered && osm ? 0.30 : osm            ? 0.50 : 0
  if (googleFiltered && !osm) console.warn(`[crossValidate] "${poi.name}" not found on OSM — Google weight boosted to ${googleWeight}`)
  if (!googleFiltered && osm) console.warn(`[crossValidate] "${poi.name}" not found on Google — OSM weight boosted to ${osmWeight}`)

  let score = 0
  const breakdown: VerificationResult['source_breakdown'] = {}

  if (googleFiltered) {
    const meta = buildSourceMeta('semi_official', now)
    // Quality bonus: Google rating (0–0.05) + review count (0–0.05)
    const rating = googleFiltered.rating ?? 0
    const reviewCount = googleFiltered.user_ratings_total ?? 0
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
    const rawDate = latestBlogDate(blogs)
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
    // Unknown date → assume 180 days ago (conservative) to avoid inflating recency score
    const latestDate = rawDate && ISO_DATE.test(rawDate)
      ? rawDate
      : new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10)
    const meta = buildSourceMeta('blog_travel', latestDate + 'T00:00:00Z')
    // Volume bonus: more blog posts = slightly higher confidence, capped at 0.75
    const volumeBonus = blogs.length >= 3 ? 0.1 : blogs.length >= 2 ? 0.05 : 0
    const blogConfidence = Math.min(meta.confidence + volumeBonus, 0.75)
    breakdown.blog_travel = { ...meta, confidence: blogConfidence }
    score += blogConfidence * 0.25
  }

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
  }
}
