/**
 * conflict-resolver.ts
 *
 * Implements the professor's two-step conflict resolution rule (2026-07-02):
 *
 *   Step 1 — CLARIFY: if one source is clearly more authoritative (higher tier)
 *            OR clearly more recent (same tier, >30 days newer), pick that value.
 *
 *   Step 2 — COEXIST: if clarification isn't possible, store ALL variants and
 *            surface the conflict to consumers (UI can show "sources disagree").
 *            The `resolved` field holds the highest-credibility guess so callers
 *            always have a usable value; `is_conflicted: true` signals the warning.
 *
 * Original quote:
 *   「你第一個是說你有辦法澄清嘛，對不對？那你沒辦法澄清，就是都並存就好了，
 *     並不是說你一定要找到真實答案，你看演算法去解決衝突這樣而已。」
 *
 * ── Per-field source priority table ──────────────────────────────────────────
 *
 *  FIELD         SOURCE              TIER           CONFIDENCE  HALF-LIFE
 *  ──────────────────────────────────────────────────────────────────────────
 *  official_name TDX ScenicSpotName  official       0.92        365 d
 *                Google Places       semi_official  0.80        —
 *                OSM (first token)   semi_official  0.70        —
 *                (official_website page_title excluded: too often a blog title)
 *
 *  address       Google Places       semi_official  0.85        —
 *                TDX Address         semi_official  0.80        180 d
 *                OSM display_name    semi_official  0.75        —
 *
 *  hours         official_website    official       0.90        —
 *                Google Places       semi_official  0.80        —
 *                TDX OpenTime        semi_official  0.65        60 d
 *                blog posts          blog_travel    0.50        —
 *
 *  is_open       official_website    official       0.90        —
 *                Google Places       semi_official  0.85        —
 *                PTT closure posts   user_feedback  0.55        —
 *                (TDX excluded: no business_status; closures lag by months)
 */

import type {
  SourceCredibility,
  SourceVariant,
  ConflictRecord,
  ConflictAnalysis,
} from './types'
import type { CrossValidationResult } from './validators/index'

// ── Tier ranking (higher = more authoritative) ─────────────────────────────

const TIER_RANK: Record<SourceCredibility, number> = {
  official:      4,
  semi_official: 3,
  blog_travel:   2,
  user_feedback: 1,
}

// A gap of ≥1 tier level is enough to clarify by source authority
const TIER_GAP_FOR_CLARIFICATION = 1

// Same-tier sources must differ by >30 days to clarify by recency
const RECENCY_GAP_DAYS = 30

// ── TDX time-decay helper ──────────────────────────────────────────────────
// TDX SrcUpdateTime tracks when the local government last pushed data.
// Names rarely change (long half-life); hours/addresses go stale faster.

function tdxDecayedConf(
  baseConf: number,
  srcUpdateTime: string | null,
  halfLifeDays: number,
): number {
  if (!srcUpdateTime) return baseConf * 0.70   // unknown age → moderate penalty
  const days = (Date.now() - new Date(srcUpdateTime).getTime()) / 86_400_000
  return baseConf * Math.exp(-(days / halfLifeDays))
}

// ── Core resolution algorithm ──────────────────────────────────────────────

function resolveField<T>(
  candidates: SourceVariant<T>[],
  equalFn: (a: T, b: T) => boolean = (a, b) => a === b,
): ConflictRecord<T> | null {
  const valid = candidates.filter(
    c => c.value !== null && c.value !== undefined && (c.value as unknown) !== '',
  )
  if (valid.length === 0) return null

  // Sort: highest tier first, then highest confidence within same tier
  const sorted = [...valid].sort((a, b) => {
    const tierDiff = TIER_RANK[b.source_tier] - TIER_RANK[a.source_tier]
    return tierDiff !== 0 ? tierDiff : b.confidence - a.confidence
  })

  const best = sorted[0]

  // ── Case 1: single source ──────────────────────────────────────────────
  if (sorted.length === 1) {
    return { resolved: best.value, resolution_method: 'single_source', is_conflicted: false, variants: sorted }
  }

  // ── Case 2: all sources agree ──────────────────────────────────────────
  if (sorted.every(c => equalFn(c.value, best.value))) {
    return { resolved: best.value, resolution_method: 'unanimous', is_conflicted: false, variants: sorted }
  }

  // ── Conflict confirmed — attempt to clarify ────────────────────────────

  // Step 1a: clarify by source tier
  const allLowerTier = sorted
    .slice(1)
    .every(c => TIER_RANK[best.source_tier] - TIER_RANK[c.source_tier] >= TIER_GAP_FOR_CLARIFICATION)

  if (allLowerTier) {
    return { resolved: best.value, resolution_method: 'clarified_by_tier', is_conflicted: true, variants: sorted }
  }

  // Step 1b: clarify by recency within the same tier
  const sameTierOthers = sorted.slice(1).filter(c => c.source_tier === best.source_tier)
  if (sameTierOthers.length > 0) {
    const bestMs   = new Date(best.last_updated_at).getTime()
    const otherMs  = Math.max(...sameTierOthers.map(c => new Date(c.last_updated_at).getTime()))
    const daysDiff = (bestMs - otherMs) / 86_400_000

    if (daysDiff > RECENCY_GAP_DAYS) {
      return { resolved: best.value, resolution_method: 'clarified_by_recency', is_conflicted: true, variants: sorted }
    }
  }

  // Step 2: coexist
  return { resolved: best.value, resolution_method: 'coexist', is_conflicted: true, variants: sorted }
}

// ── Normalisation helpers ──────────────────────────────────────────────────

function strNormEqual(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\-－—　]/g, '')
  return norm(a) === norm(b)
}

// ── Candidate builders ─────────────────────────────────────────────────────
//
// official_name
// Priority: TDX (official) > Google Places (semi_official) > OSM (semi_official)
// official_website page_title is EXCLUDED because it is too often a blog title
// rather than the actual venue name (confirmed in test run 2026-07-02).

function nameVariants(v: CrossValidationResult, now: string): SourceVariant<string>[] {
  const out: SourceVariant<string>[] = []

  // TDX — government tourism registry, most canonical name, slow to change
  if (v.tdx?.name) {
    out.push({
      value: v.tdx.name,
      source_name: 'TDX 政府觀光平台',
      source_tier: 'official',
      confidence: tdxDecayedConf(0.92, v.tdx.srcUpdateTime, 365),
      last_updated_at: v.tdx.srcUpdateTime ?? now,
    })
  }

  if (v.google?.official_name) {
    out.push({
      value: v.google.official_name,
      source_name: 'Google Places',
      source_tier: 'semi_official',
      confidence: 0.80,
      last_updated_at: now,
    })
  }

  if (v.osm?.display_name) {
    out.push({
      value: v.osm.display_name.split(',')[0].trim(),
      source_name: 'OpenStreetMap',
      source_tier: 'semi_official',
      confidence: 0.70,
      last_updated_at: now,
    })
  }

  return out
}

// address
// Priority: Google Places (semi_official, 0.85) > TDX (semi_official, decayed 0.80)
//           > OSM (semi_official, 0.75)
// Google leads because it crowdsources real-time corrections;
// TDX address is government-registered but may lag by months.

function addressVariants(v: CrossValidationResult, now: string): SourceVariant<string>[] {
  const out: SourceVariant<string>[] = []

  if (v.google?.formatted_address) {
    out.push({
      value: v.google.formatted_address,
      source_name: 'Google Places',
      source_tier: 'semi_official',
      confidence: 0.85,
      last_updated_at: now,
    })
  }

  if (v.tdx?.address) {
    out.push({
      value: v.tdx.address,
      source_name: 'TDX 政府觀光平台',
      source_tier: 'semi_official',
      confidence: tdxDecayedConf(0.80, v.tdx.srcUpdateTime, 180),
      last_updated_at: v.tdx.srcUpdateTime ?? now,
    })
  }

  if (v.osm?.display_name) {
    out.push({
      value: v.osm.display_name,
      source_name: 'OpenStreetMap',
      source_tier: 'semi_official',
      confidence: 0.75,
      last_updated_at: now,
    })
  }

  return out
}

// hours
// Priority: official_website (official, 0.90) > Google Places (semi_official, 0.80)
//           > TDX OpenTime (semi_official, decayed 0.65) > blog posts (blog_travel, 0.50)
// TDX OpenTime is government-registered but free-text and often months behind;
// apply aggressive 60-day half-life so stale TDX data doesn't beat a recent blog.

function hoursVariants(v: CrossValidationResult, now: string): SourceVariant<string>[] {
  const out: SourceVariant<string>[] = []

  if (v.official_website?.is_reachable && v.official_website.excerpt) {
    const match = v.official_website.excerpt.match(/\d{1,2}[:：]\d{2}[^。\n]{0,40}/)
    if (match) {
      out.push({
        value: match[0].trim(),
        source_name: '官方網站',
        source_tier: 'official',
        confidence: 0.90,
        last_updated_at: v.official_website.last_modified ?? now,
      })
    }
  }

  if (v.google?.opening_hours?.length) {
    out.push({
      value: v.google.opening_hours.join('; '),
      source_name: 'Google Places',
      source_tier: 'semi_official',
      confidence: 0.80,
      last_updated_at: now,
    })
  }

  if (v.tdx?.openTime) {
    out.push({
      value: v.tdx.openTime,
      source_name: 'TDX 政府觀光平台',
      source_tier: 'semi_official',
      confidence: tdxDecayedConf(0.65, v.tdx.srcUpdateTime, 60),
      last_updated_at: v.tdx.srcUpdateTime ?? now,
    })
  }

  const hoursRegex = /(?:開放|營業|開館|入場)[時間]?\s*[:：]?[^。\n]{0,50}/
  const blogsWithHours = v.blogs
    .filter(b => hoursRegex.test(b.snippet))
    .sort((a, b) => (b.published_date ?? '').localeCompare(a.published_date ?? ''))

  if (blogsWithHours.length > 0) {
    const latestBlog = blogsWithHours[0]
    const hoursSnip  = latestBlog.snippet.match(hoursRegex)?.[0]
    if (hoursSnip) {
      const blogTs = latestBlog.published_date
        ? latestBlog.published_date + 'T00:00:00Z'
        : new Date(Date.now() - 180 * 86_400_000).toISOString()
      out.push({
        value: hoursSnip.trim(),
        source_name: `部落格（${latestBlog.published_date ?? '日期未知'}）`,
        source_tier: 'blog_travel',
        confidence: 0.50,
        last_updated_at: blogTs,
      })
    }
  }

  return out
}

// is_open
// Priority: official_website (official, 0.90) > Google Places (semi_official, 0.85)
//           > PTT closure posts (user_feedback, 0.55)
// TDX is EXCLUDED: no business_status field; closures take months to be deregistered.

function isOpenVariants(v: CrossValidationResult, now: string): SourceVariant<boolean>[] {
  const out: SourceVariant<boolean>[] = []

  if (v.official_website) {
    out.push({
      value: v.official_website.is_reachable,
      source_name: '官方網站（可連線 = 仍在營運）',
      source_tier: 'official',
      confidence: 0.90,
      last_updated_at: v.official_website.last_modified ?? now,
    })
  }

  if (v.google) {
    const status = v.google.business_status
    const isOpen = status !== 'CLOSED_PERMANENTLY' && status !== 'CLOSED_TEMPORARILY'
    out.push({
      value: isOpen,
      source_name: `Google Places (status: ${status ?? 'unknown'})`,
      source_tier: 'semi_official',
      confidence: 0.85,
      last_updated_at: now,
    })
  }

  const closureKeywords = /關閉|停業|已關|拆除|不開放|永久停止/
  const closurePosts = v.ptt_posts
    .filter(p => closureKeywords.test(p.title))
    .sort((a, b) => (b.published_date ?? '').localeCompare(a.published_date ?? ''))

  if (closurePosts.length > 0) {
    const latest = closurePosts[0]
    out.push({
      value: false,
      source_name: `PTT（${latest.board}，${latest.published_date ?? '日期未知'}）`,
      source_tier: 'user_feedback',
      confidence: 0.55,
      last_updated_at: latest.published_date
        ? latest.published_date + 'T00:00:00Z'
        : new Date(Date.now() - 90 * 86_400_000).toISOString(),
    })
  }

  return out
}

// ── Public API ─────────────────────────────────────────────────────────────

export function analyzeConflicts(
  validation: CrossValidationResult,
): ConflictAnalysis {
  const now = new Date().toISOString()

  return {
    official_name: resolveField(nameVariants(validation, now), strNormEqual),
    address:       resolveField(addressVariants(validation, now), strNormEqual),
    hours:         resolveField(hoursVariants(validation, now), strNormEqual),
    is_open:       resolveField(isOpenVariants(validation, now)),
  }
}
