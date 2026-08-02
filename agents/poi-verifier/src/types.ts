// ── Input ──────────────────────────────────────────────────────────────────

export interface PoiInput {
  name: string
  location: { latitude: number; longitude: number }
  user_description?: string
  website_url?: string  // 預先已知的官方網站 URL，傳入可跳過 DDG 自動發現
}

export interface VerificationContext {
  trip_id?: string
  group_size?: number
  vibe_tags?: string[]
  scenario?: 'heavy_rain' | 'closure' | 'fatigue'
  remaining_time_minutes?: number
  user_energy?: number         // 0–100
  group_preferences?: string[] // vibe tag list
  user_budget_ntd?: number
  group_taboos?: string[]
}

// ── External API Raw Results ───────────────────────────────────────────────

export interface GooglePlacesRaw {
  place_id: string | null
  official_name: string | null
  formatted_address: string | null
  opening_hours: string[] | null
  rating: number | null
  user_ratings_total: number | null
  business_status: string | null // "OPERATIONAL" | "CLOSED_PERMANENTLY" | ...
  geometry?: { lat: number; lng: number }  // returned location for distance check
}

export interface OsmRaw {
  osm_id: string | null
  display_name: string | null
  address: Record<string, string> | null
  category: string | null
}

export interface BlogPostRaw {
  title: string
  url: string
  published_date: string | null // YYYY-MM-DD
  snippet: string
  source: string
}

// [P2] YouTube Data API v3 — 成本：免費 (10,000 units/日)；法律：✅ 官方 API
export interface YoutubeVideoRaw {
  video_id: string
  title: string
  channel_name: string
  published_at: string | null   // YYYY-MM-DD（景點近期活躍度代理指標）
  description_snippet: string   // description 前 200 字
  view_count: number | null     // 需額外 videos.list call，目前不抓以省配額
  is_sponsored: boolean         // 關鍵字過濾結果（業配影片已排除）
  url: string
}

// [P1] PTT 旅遊版 — 成本：免費；法律：✅ NTU BBS 公開資料，合理使用
export interface PttPostRaw {
  title: string
  url: string
  published_date: string | null // YYYY-MM-DD（從 MM/DD 推算年份）
  board: string                 // 所屬版別，例：travel / Hiking / Taipei
  snippet: string               // 目前為空（抓 snippet 需額外請求，略過）
}

// [P0] 景點官網 — 成本：免費；法律：✅ 遵守 robots.txt，合理使用
export interface OfficialWebsiteRaw {
  url: string
  page_title: string | null
  last_modified: string | null  // HTTP Last-Modified header（null 表示伺服器未回傳）
  excerpt: string               // meta description 或 body 前 500 字（已去除 HTML 標籤）
  is_reachable: boolean
}

// ── Source Credibility ─────────────────────────────────────────────────────

export type SourceCredibility =
  | 'official'
  | 'semi_official'
  | 'blog_travel'
  | 'user_feedback'

export interface SourceMetadata {
  source_type: SourceCredibility
  last_updated_at: string  // ISO8601
  time_decay_factor: number // 0–1
  confidence: number        // 0–1
}

// ── POI Candidate (for backup ranking) ────────────────────────────────────

export interface POICandidate {
  poi_id: string
  name: string
  rating: number
  review_count: number
  distance_km: number
  opening_hours_margin_minutes: number
  cost_within_budget: boolean
  weather_compatibility: number        // 0–1
  crowd_level: number                  // 0–1
  current_crowd_level?: 'low' | 'moderate' | 'high' | 'extremely_busy'
  energy_consumption: number           // 0–100
  space_type: 'indoor' | 'semi_outdoor' | 'outdoor'
  decision_tags: { vibe: string[]; limitations: string[] }
  source_reliability_score: number     // 0–1
  last_verified_at: string             // ISO8601
  last_update_date?: number            // timestamp ms
  level: 0 | 1 | 2 | 3
  requires_reservation: boolean
  touches_group_taboo?: boolean
}

// ── Verification Result ────────────────────────────────────────────────────

export interface VerificationResult {
  exists: boolean
  sources: Array<'google_places' | 'osm' | 'blog_post' | 'llm_inferred' | 'youtube' | 'ptt' | 'official_website' | 'tdx_api'>
  reliability_score: number // 0–1
  conflict_analysis?: ConflictAnalysis  // populated by conflict-resolver after cross-validation
  source_breakdown?: {
    official?: SourceMetadata
    semi_official?: SourceMetadata
    blog_travel?: SourceMetadata
    user_feedback?: SourceMetadata
  }
  facts: {
    official_name: string
    address: string
    hours: string
    average_stay_minutes: number
    last_verified_at: string  // ISO8601
    latest_blog_post_date?: string  // YYYY-MM-DD
    // ⚠️ null ＝「沒有判定過」，不是「戶外」。
    // 這兩個欄位只有 LLM 判得出來（Google/OSM/部落格都不提供）。LLM 失敗時若填
    // 預設值 false/'medium'，會產生一筆看起來完整、實際是猜的資料——2026-05-06
    // 那批 30 筆就是這樣壞掉的，害得線上 45 筆裡 41 筆被標成戶外，下雨備案池
    // （硬性 is_indoor=true 篩選）只剩 4 筆且全在北海岸，陽明山／東北角必然無候選。
    // 詳見 KNOWN_ISSUES.md 2026-08-02。下游拿到 null 必須顯示「未判定」而非當戶外。
    is_indoor: boolean | null
    weather_sensitivity: 'low' | 'medium' | 'high' | null
    source_citation?: Array<{
      field: string
      primary_source: SourceCredibility
      confidence: number
    }>
  }
}

// ── TDX conflict input (subset of TdxMappedPoi needed by conflict-resolver) ─
//
// Field-level trust ranking vs other sources:
//   name      → OFFICIAL tier  (government tourism registry, canonical name)
//   address   → SEMI_OFFICIAL  (government data, may lag Google on corrections)
//   openTime  → SEMI_OFFICIAL  (structured but often months behind; apply decay)
//   is_open   → NOT PROVIDED   (TDX never reflects closures promptly)
//
export interface TdxConflictInput {
  name:           string
  address:        string | null
  openTime:       string | null
  srcUpdateTime:  string | null   // ISO8601 from TDX SrcUpdateTime; used for time decay
}

// ── Conflict Resolution ────────────────────────────────────────────────────

/**
 * How a conflicting field was settled:
 *  unanimous          – all sources agreed, no conflict
 *  single_source      – only one source had a value
 *  clarified_by_tier  – higher-credibility source wins
 *  clarified_by_recency – same tier but one source is clearly newer (>30 days)
 *  coexist            – conflict unresolvable; all variants stored, best-guess picked
 */
export type ResolutionMethod =
  | 'unanimous'
  | 'single_source'
  | 'clarified_by_tier'
  | 'clarified_by_recency'
  | 'coexist'

export interface SourceVariant<T> {
  value: T
  source_name: string
  source_tier: SourceCredibility
  confidence: number        // 0–1, decay-adjusted
  last_updated_at: string   // ISO8601
}

export interface ConflictRecord<T> {
  resolved: T                         // best-guess answer (highest credibility)
  resolution_method: ResolutionMethod
  is_conflicted: boolean
  variants: SourceVariant<T>[]        // all observed values with provenance
}

export interface ConflictAnalysis {
  official_name: ConflictRecord<string> | null
  address:       ConflictRecord<string> | null
  hours:         ConflictRecord<string> | null
  is_open:       ConflictRecord<boolean> | null
}

// ── Multi-criteria Weights ─────────────────────────────────────────────────

export interface MultiCriteriaWeights {
  rating: number
  review_count: number
  distance: number
  opening_hours_margin: number
  cost_within_budget: number
  weather_compatibility: number
  crowd_capacity: number
  energy_consumption: number
  group_preference_match: number
  source_credibility_boost: number
  recency_bonus: number
}

// ── Enrichment Result ──────────────────────────────────────────────────────

export interface CandidateScore {
  poi_id: string
  name: string
  distance_km: number
  multi_criteria_score: number
  score_breakdown?: {
    rating_score: number
    distance_score: number
    hours_margin_score: number
    weather_compatibility_score: number
    source_credibility_score: number
    recency_score: number
  }
  disqualification_reasons?: string[]
}

export interface EnrichmentResult {
  suggested_level: 0 | 1 | 2 | 3
  level_reasoning: string
  candidate_pool?: CandidateScore[]
  backup_logic: {
    strategy_type: 'swap_same_level' | 'switch_time_slot' | 'cancel_with_notice'
    description: string
    candidate_pool_tags: string[]
    proximity_threshold_meters: number
    recommended_backup?: string
  } | null  // null for L0
}

// ── LLM Output (parsed from LLM response) ─────────────────────────────────

export interface LlmOutput {
  facts: {
    official_name: string
    address: string
    hours: string
    average_stay_minutes: number
    is_indoor: boolean
    weather_sensitivity: 'low' | 'medium' | 'high'
    latest_blog_post_date?: string
  }
  suggested_level: 0 | 1 | 2 | 3
  level_reasoning: string
  // 改為 optional：backup_logic 已從 enrich prompt 移除（見 enrichers/index.ts），
  // LLM 不再回傳此欄位；備案邏輯一律由規則層 generateBackupLogic() 產生。
  // 保留型別定義是為了相容舊的 poi_verified.json，但新產出不會有此欄位。
  backup_logic?: {
    strategy_type: 'swap_same_level' | 'switch_time_slot' | 'cancel_with_notice'
    description: string
    candidate_pool_tags: string[]
    proximity_threshold_meters: number
  }
  tourist_friendly_description: string
}

// ── Final Output ───────────────────────────────────────────────────────────

export interface PoiVerifierOutput {
  poi_input: PoiInput
  verification_result: VerificationResult
  enrichment_result: EnrichmentResult
  tourist_friendly_description?: string
  // 記錄本筆結果實際由哪個 LLM 產出；'fallback' 代表 LLM 全部失敗、走預設 L2 降級分支。
  // 原本 enrich() 已回傳 llm_source，但 agent.ts 沒寫進最終輸出，導致下游（ingest／explore）
  // 無法區分「真 L2」與「配額耗盡的降級 L2」——45 筆中有 30 筆屬後者卻被當驗證資料入庫。
  // 持久化此欄位讓降級狀態顯性化，是重跑那 30 筆前的必要前置。
  llm_source?: 'gemini' | 'claude' | 'fallback'
  cost_estimate: {
    tokens_used: number
    estimated_cost_ntd: number
  }
  raw_sources?: {
    google_places?: GooglePlacesRaw
    osm?: OsmRaw
    blog_posts?: BlogPostRaw[]
    youtube_videos?: YoutubeVideoRaw[]   // [P2] 過濾業配後的影片列表
    ptt_posts?: PttPostRaw[]             // [P1] PTT 旅遊相關版面文章
    official_website?: OfficialWebsiteRaw // [P0] 官網擷取結果
  }
}
