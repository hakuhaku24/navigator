/**
 * ingest-from-tdx.ts — TDX 觀光 API 自動匯入 poi_catalog pipeline
 *
 * ⚠️ 2026-08-02 端點改版：舊的 `/api/basic/v2/Tourism/ScenicSpot` 已下架（404），
 *    改接觀光署的 `/api/tourism/service/odata/V2/Tourism/Attraction`。
 *    實體同時改名 ScenicSpot → Attraction、Activity → Event，欄位全套不同，
 *    對映細節見 `src/tdx-types.ts` 與 `src/tdx-mapper.ts` 檔頭。
 *
 * 整合策略：
 *   Step 1  TDX 實體欄位對映 → Navigator PoiInput
 *   Step 2  Navigator 自行生成的欄位（level / weather_sensitivity / embedding…）
 *   Step 3  upsert 進 Supabase poi_catalog
 *
 * 執行模式：
 *   npx ts-node ingest-from-tdx.ts                            # 預設：Attraction，全台，top 20，完整驗證
 *   npx ts-node ingest-from-tdx.ts --dry-run                  # 只印對映結果，不呼叫任何 API
 *   npx ts-node ingest-from-tdx.ts --skip-verify              # 輕量 LLM 增補（不呼叫 Google Places/OSM）
 *   npx ts-node ingest-from-tdx.ts --type Restaurant --city 宜蘭縣 --top 10
 *
 * 環境變數（.env.local）：
 *   TDX_CLIENT_ID          TDX 應用程式 Client ID
 *   TDX_CLIENT_SECRET      TDX 應用程式 Client Secret
 *   GEMINI_API_KEY         Gemini API 金鑰（輕量增補 + embedding）
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })
dotenv.config({ path: '../../.env' })

import * as fs   from 'fs'
import * as path from 'path'

import { ingestToDB } from './src/ingestion'
import { verifyPoi }  from './src/agent'
// BFR13／BFR14：降級資料不得入庫，連續降級即中止批次。
// 沿用 batch-verify.ts 已在用的同一組門檻，避免兩條匯入路徑的標準不一致。
import { shouldAbortBatch, MAX_CONSECUTIVE_FALLBACKS } from './src/canonical-poi'
import type {
  PoiVerifierOutput,
  VerificationResult,
  EnrichmentResult,
} from './src/types'
import type { IngestSignals } from './src/ingestion'

import {
  mapTdxEntity,
  inferIsIndoor,
  inferWeatherSensitivity,
  defaultStayMinutes,
} from './src/tdx-mapper'
import type { TdxMappedPoi } from './src/tdx-mapper'
import type {
  TdxEntityType,
  TdxEntity,
  TdxAttraction,
  TdxRestaurant,
  TdxHotel,
  TdxEvent,
  TdxTokenResponse,
  TdxApiResponse,
} from './src/tdx-types'

// ── CLI 引數解析 ──────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function getArg(flag: string): string | null {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : null
}
function hasFlag(flag: string): boolean { return args.includes(flag) }

/**
 * 遊憩區域 → 所屬鄉鎮。
 *
 * ## 為什麼需要這張表
 *
 * TDX 只給行政縣市，而本產品是按**遊憩區域**組織的。兩者是正交的軸：
 * 新北市同時橫跨北海岸（石門／金山／萬里／三芝）與東北角（瑞芳／貢寮／雙溪），
 * 陽明山則橫跨臺北市（北投／士林）與新北市。
 * **縣市→區域的對映在概念上不成立**，只有鄉鎮→區域成立。
 *
 * ## 為什麼要按鄉鎮匯，而不是整個縣市倒進來
 *
 * 不在三區內的景點（三峽、烏來、永和…）匯進來之後：
 * 天氣應變的候選檢索按區域走 → 找不到它們；explore 的三區篩選 → 篩不到。
 * 它們會變成「在資料庫裡但沒有任何功能會用到」的資料。
 *
 * 實測（2026-08-04）：TDX 支援 `contains(PostalAddress/Town, '瑞芳')` 篩選。
 */
const ZONE_TOWNS: Record<string, { city: string; towns: string[] }[]> = {
  '北海岸': [{ city: '新北市', towns: ['石門區', '金山區', '萬里區', '三芝區', '淡水區'] }],
  '東北角': [
    { city: '新北市', towns: ['瑞芳區', '貢寮區', '雙溪區'] },
    { city: '宜蘭縣', towns: ['頭城鎮'] },
  ],
  '陽明山': [
    { city: '臺北市', towns: ['北投區', '士林區'] },
    { city: '新北市', towns: ['萬里區'] }, // 陽明山國家公園北緣跨入萬里
  ],
}

const TYPE: TdxEntityType = (getArg('--type') as TdxEntityType) || 'Attraction'
const CITY_FILTER: string | null = getArg('--city')
/** 按遊憩區域匯入：自動展開為該區的鄉鎮篩選，並把 curated_zone 設為此值 */
const ZONE: string | null = getArg('--zone')
const TOP: number     = parseInt(getArg('--top') ?? '20', 10)
/**
 * OData `$skip`。續匯用：沒有這個參數的話，`--top` 永遠從第一筆開始，
 * 想多匯 N 筆就得把前面已匯過的全部重跑一遍（浪費 LLM 呼叫），
 * 而且會把先前手動刪掉的重複資料又建回來。
 */
const SKIP: number    = parseInt(getArg('--skip') ?? '0', 10)
const DELAY_MS: number = parseInt(getArg('--delay') ?? '11000', 10)
const DRY_RUN: boolean    = hasFlag('--dry-run')
const SKIP_VERIFY: boolean = hasFlag('--skip-verify')

if (ZONE && !ZONE_TOWNS[ZONE]) {
  console.error(`--zone 只接受：${Object.keys(ZONE_TOWNS).join('、')}（收到「${ZONE}」）`)
  process.exit(1)
}

// ── TDX API 常數 ──────────────────────────────────────────────────────────

const TDX_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'
// 2026-08-02 起的正確路徑。舊的 `/api/basic/v2/Tourism` 已下架，用同一把 token
// 打舊路徑回 404、打 `/api/basic/v2/Rail/TRA/Station` 回 200——不是憑證問題。
const TDX_API_BASE  = 'https://tdx.transportdata.tw/api/tourism/service/odata/V2/Tourism'

// ── 結果快取目錄 ──────────────────────────────────────────────────────────

const RESULTS_DIR = path.join(__dirname, 'results')
fs.mkdirSync(RESULTS_DIR, { recursive: true })

// ── sleep ──────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── TDX OAuth2 取 token ──────────────────────────────────────────────────

async function fetchTdxToken(): Promise<string> {
  const clientId     = process.env.TDX_CLIENT_ID
  const clientSecret = process.env.TDX_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error(
      'TDX_CLIENT_ID / TDX_CLIENT_SECRET 未設定\n' +
      '請至 https://tdx.transportdata.tw 申請應用程式後，將金鑰寫入 .env.local'
    )
  }

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(TDX_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`TDX token 取得失敗 HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  const data: TdxTokenResponse = await res.json()
  return data.access_token
}

// ── TDX 資料拉取（支援分頁、City 過濾）──────────────────────────────────

async function fetchTdxData(
  type: TdxEntityType,
  token: string,
  top: number,
  cityFilter: string | null,
): Promise<TdxEntity[]> {
  const params = new URLSearchParams({
    $top:    String(top),
    $format: 'JSON',
  })
  if (SKIP > 0) params.set('$skip', String(SKIP))
  if (ZONE) {
    // 按遊憩區域：展開成 (City eq A and Town in [...]) or (City eq B and Town in [...])
    // 用 contains 而非 eq，因為 TDX 的 Town 偶有「金山區」/「金山」兩種寫法
    const groups = ZONE_TOWNS[ZONE].map(g => {
      const towns = g.towns.map(t => `contains(PostalAddress/Town,'${t.replace(/[區鎮市]$/, '')}')`).join(' or ')
      return `(PostalAddress/City eq '${g.city}' and (${towns}))`
    })
    params.set('$filter', groups.join(' or '))
  } else if (cityFilter) {
    // 縣市要走 PostalAddress/City。新版另有 LocatedCities，但實測填充率只有 2%，
    // 拿它篩會漏掉 98% 的資料；PostalAddress/City 則是 100% 有值。
    params.set('$filter', `PostalAddress/City eq '${cityFilter}'`)
  }

  const url = `${TDX_API_BASE}/${type}?${params.toString()}`
  console.log(`\n  → GET ${url}\n`)

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        'application/json',
    },
  })

  if (res.status === 401) throw new Error('TDX token 已過期，請重試')
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`TDX API HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = await res.json()
  // OData 回應包在 { value: [] }；保留裸陣列與 { data: [] } 的相容路徑
  if (Array.isArray(json)) return json as TdxEntity[]
  const wrapper = json as TdxApiResponse<TdxEntity>
  return wrapper.value ?? wrapper.data ?? []
}

// ── 輕量 LLM 增補（skip-verify 模式）────────────────────────────────────
// 一次 Gemini Flash call，解析 OpenTime + 推斷 is_indoor/weather + 生成描述

interface TdxLlmEnrichment {
  is_indoor:                  boolean
  weather_sensitivity:        'low' | 'medium' | 'high'
  average_stay_minutes:       number
  requires_reservation:       boolean
  suggested_level:            0 | 1 | 2 | 3
  level_reasoning:            string
  backup_strategy:            'swap_same_level' | 'switch_time_slot' | 'cancel_with_notice'
  candidate_pool_tags:        string[]
  tourist_friendly_description: string
}

async function tdxLlmEnrich(mapped: TdxMappedPoi): Promise<TdxLlmEnrichment | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  const prompt = `你是台灣旅遊行程規劃 AI。根據以下 TDX 政府觀光資料，推斷景點的規劃屬性。

景點名稱：${mapped.poiInput.name}
類別：${mapped.category}（${mapped.preliminaryTags.slice(0, 5).join('、')}）
地區：${mapped.region}
開放時間：${mapped.openTime ?? '不明'}
描述：${(mapped.poiInput.user_description ?? '').slice(0, 400)}

請輸出 JSON（不加 markdown 圍欄）：
{
  "is_indoor": boolean,
  "weather_sensitivity": "low"|"medium"|"high",
  "average_stay_minutes": number,
  "requires_reservation": boolean,
  "suggested_level": 1|2|3,
  "level_reasoning": "一行中文說明，為何是這個等級",
  "backup_strategy": "swap_same_level"|"switch_time_slot"|"cancel_with_notice",
  "candidate_pool_tags": ["最多 5 個字串，用於備援景點搜尋"],
  "tourist_friendly_description": "60–120 字，給旅客看的中文景點簡介"
}

規則：
- suggested_level 只能是 1、2、3（L0 保留給人工指定的必去錨點）
- L1 = 主要目的地（如知名景點）；L2 = 順遊（一般景點）；L3 = 填充（小眾）
- tourist_friendly_description 要自然、口語，不要照抄 TDX 描述`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:       0.1,
          maxOutputTokens:   1024,
          responseMimeType:  'application/json',
          thinkingConfig:    { thinkingBudget: 0 },
        },
      }),
    })

    if (res.status === 429) {
      if (attempt < 3) {
        process.stdout.write(` [LLM 429 retry ${attempt}/3, 等 15s]`)
        await sleep(15_000)
        continue
      }
      console.error(`  LLM rate limit exceeded`)
      return null
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`  LLM HTTP ${res.status}: ${text.slice(0, 200)}`)
      return null
    }

    const data  = await res.json()
    const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!raw.trim()) {
      console.error(`  LLM empty response`)
      return null
    }

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    try {
      return JSON.parse(cleaned) as TdxLlmEnrichment
    } catch (e: any) {
      console.error(`  LLM JSON parse error: ${e.message}; raw: ${cleaned.slice(0, 100)}`)
      return null
    }
  }

  return null
}

// ── 從 TDX 對映結果 + LLM 結果組裝 PoiVerifierOutput ────────────────────
// （skip-verify 模式用，不含 Google Places / OSM / blog 資料）

function buildTdxOnlyOutput(
  mapped: TdxMappedPoi,
  llm: TdxLlmEnrichment | null,
): PoiVerifierOutput {
  // 啟發式改吃數字類型代碼（新版 AttractionClasses），不再猜 tag 字串。
  // ⚠️ inferIsIndoor 可能回 null（未判定）——這裡刻意不補 false，
  //    見 tdx-mapper.ts 該函式的註解與 CLAUDE.md §9 的 is_indoor 事故。
  const isIndoor  = llm?.is_indoor            ?? inferIsIndoor(mapped.classCodes)
  const weather   = llm?.weather_sensitivity  ?? inferWeatherSensitivity(mapped.classCodes)
  // 官方 VisitDuration 是權威值，優先於 LLM 推估與類別預設（實測填充率 0%，備而不用）
  const stayMins  = mapped.visitDuration
                 ?? llm?.average_stay_minutes
                 ?? defaultStayMinutes(mapped.category)
  const level     = llm?.suggested_level      ?? 2
  const levelNames = ['絕對錨點', '彈性錨點', '條件變動', '水位調節'] as const

  const facts: VerificationResult['facts'] = {
    official_name:         mapped.poiInput.name,
    address:               mapped.address ?? '請洽 TDX 原始資料',
    hours:                 mapped.openTime ?? '請洽官方資訊',
    average_stay_minutes:  stayMins,
    last_verified_at:      new Date().toISOString(),
    is_indoor:             isIndoor,
    weather_sensitivity:   weather,
  }

  const backupLogic: EnrichmentResult['backup_logic'] = {
    strategy_type:              llm?.backup_strategy      ?? 'swap_same_level',
    description:                `TDX 匯入，${llm?.level_reasoning ?? levelNames[level]}`,
    candidate_pool_tags:        llm?.candidate_pool_tags  ?? [mapped.region, mapped.category],
    proximity_threshold_meters: 3000,
  }

  return {
    poi_input: mapped.poiInput,
    verification_result: {
      exists:            true,
      sources:           ['tdx_api' as any],  // 'tdx_api' 已加入 types.ts
      reliability_score: 0.3,                 // 單一政府來源，尚未多源交叉驗證
      facts,
    },
    enrichment_result: {
      suggested_level: level,
      level_reasoning: llm?.level_reasoning ?? `TDX ${mapped.category} 類景點，預設 L${level}`,
      backup_logic:    backupLogic,
    },
    tourist_friendly_description: llm?.tourist_friendly_description ?? undefined,
    cost_estimate: { tokens_used: 400, estimated_cost_ntd: 0.001 },
    raw_sources:   { blog_posts: [], ptt_posts: [], youtube_videos: [] },
    // ⚠️ 在此之前這個欄位完全沒設，於是輕量增補失敗（llm 為 null）時，
    // 產出的物件與成功時**長得一模一樣**——上面每個欄位都有 `?? 預設值` 接住，
    // 所以 is_indoor／level／level_reasoning 全是規則推的，卻沒有任何地方標記這件事。
    // 這正是 2026-05-06 那批 30/45 靜默降級的同一種形態。
    llm_source: llm ? 'gemini' : 'fallback',
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────

;(async () => {
  console.log('═'.repeat(56))
  console.log('  TDX → poi_catalog  匯入 pipeline')
  console.log('═'.repeat(56))
  console.log(`  類型：${TYPE}  |  城市：${CITY_FILTER ?? '全台'}  |  筆數：${TOP}`)
  console.log(`  模式：${DRY_RUN ? 'DRY-RUN（不寫入 DB）' : SKIP_VERIFY ? 'SKIP-VERIFY（輕量 LLM）' : '完整驗證'}`)
  console.log('═'.repeat(56) + '\n')

  // 1. DRY_RUN 不需要 TDX token，可用假資料示範對映
  let entities: TdxEntity[] = []
  if (!DRY_RUN) {
    const token = await fetchTdxToken()
    entities    = await fetchTdxData(TYPE, token, TOP, CITY_FILTER)
    console.log(`  TDX 回傳 ${entities.length} 筆\n`)
  } else {
    // dry-run：用一筆假資料示範對映格式
    entities = [makeDryRunFixture(TYPE)]
    console.log(`  DRY-RUN 模式：使用假資料 1 筆\n`)
  }

  if (entities.length === 0) {
    console.log('  沒有資料，結束。')
    return
  }

  // 2. 逐筆處理
  const runLog: Array<{ sourceId: string; name: string; status: string; uuid?: string }> = []
  let successCount = 0
  let failCount    = 0
  // BFR13／BFR14：降級 ≠ 失敗也 ≠ 成功，必須是第三種結果並單獨計數。
  // 先前這兩條路徑都沒有這個概念，於是 LLM 全掛的那筆照樣入庫、
  // 還被算進「成功」——2026-08-04 實際發生過一次（新北市立淡水古蹟博物館行政中心）。
  let fallbackCount        = 0
  let consecutiveFallbacks = 0
  let aborted              = false
  let closedCount  = 0

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]
    const mapped = mapTdxEntity(entity, TYPE)

    const prefix = `[${String(i + 1).padStart(2, '0')}/${entities.length}] ${mapped.sourceId}`
    process.stdout.write(`${prefix}  ${mapped.poiInput.name.slice(0, 20).padEnd(20)}  `)

    // ── BFR17 營運狀態守門 ───────────────────────────────────────────────
    //
    // ServiceStatus 0 ＝ 官方標記為永久停止營業。這種景點入庫只會變成
    // 「推薦一個已經倒了的地方」——正是本專案宣稱要解決的問題本身。
    //
    // 只擋 0（永久停止）。3（暫時停止營運）不擋，因為它會恢復，而且
    // 「暫時停業」本身是有用的資訊，應該入庫讓應變管線與前端看得到。
    // null（未提供）也不擋——沒有資料不等於已停業（BFR12 的同一個原則）。
    if (mapped.serviceStatus === 0) {
      console.log(`SKIP  官方標記永久停止營業（ServiceStatus=0）`)
      runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'permanently_closed' })
      closedCount++
      continue
    }

    // ── DRY-RUN ──────────────────────────────────────────────────────────
    if (DRY_RUN) {
      console.log(`\n  region=${mapped.region}  category=${mapped.category}`)
      console.log(`  tags: [${mapped.preliminaryTags.slice(0, 5).join(', ')}]`)
      console.log(`  coord: (${mapped.poiInput.location.latitude}, ${mapped.poiInput.location.longitude})`)
      console.log(`  openTime: ${mapped.openTime ?? '—'}`)
      console.log(`  address: ${mapped.address ?? '—'}`)
      runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'dry-run' })
      continue
    }

    // ── SKIP-VERIFY ───────────────────────────────────────────────────────
    if (SKIP_VERIFY) {
      const llm    = await tdxLlmEnrich(mapped)
      const output = buildTdxOnlyOutput(mapped, llm)
      if (output.llm_source === 'fallback') {
        console.log(`⏭  跳過入庫：輕量增補失敗（llm_source=fallback），is_indoor／level 非真實判斷`)
        runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'fallback' })
        fallbackCount++
        consecutiveFallbacks++
        if (shouldAbortBatch(consecutiveFallbacks)) { aborted = true; break }
        if (i < entities.length - 1) await sleep(DELAY_MS)
        continue
      }
      consecutiveFallbacks = 0
      const signals: IngestSignals = {
        category:            mapped.category,
        requires_reservation: llm?.requires_reservation ?? null,
        tdx_id:              mapped.tdxId,
        tdx_entity_type:     mapped.entityType,
        phone:               mapped.phone,
        open_time:           mapped.openTime,
        website_url:         mapped.poiInput.website_url ?? null,
        travel_info:         mapped.travelInfo,
        image_url:           mapped.imageUrls[0] ?? null,
        image_urls:          mapped.imageUrls.length > 0 ? mapped.imageUrls : null,
        image_descriptions:  mapped.imageDescriptions.length > 0 ? mapped.imageDescriptions : null,
        parking_info:        mapped.parkingInfo,
        service_status:      mapped.serviceStatus,
        service_status_label: mapped.serviceStatusLabel,
        is_accessible_for_free: mapped.isAccessibleForFree,
        fee_info:            mapped.feeInfo,
        tdx_src_update_time: mapped.tdxSrcUpdateTime,
        zip_code:            mapped.zipCode,
      }
      try {
        const ir = await ingestToDB(output, { sourceId: mapped.sourceId, region: mapped.region, curatedZone: ZONE }, signals)
        if (ir.skipped) {
          console.log(`SKIP  ${ir.error}`)
          runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'skip' })
        } else if (!ir.success) {
          console.log(`FAIL  ${ir.error}`)
          runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'fail' })
          failCount++
        } else {
          console.log(`✅  L${output.enrichment_result.suggested_level}  dim=${ir.embeddingDim}  tdx_id=${mapped.tdxId.slice(0, 20)}`)
          runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'ok', uuid: ir.uuid })
          successCount++
        }
      } catch (err: any) {
        console.log(`ERROR  ${err?.message ?? err}`)
        runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'error' })
        failCount++
      }
    } else {
      // ── 完整驗證模式 ────────────────────────────────────────────────────
      try {
        const output = await verifyPoi(mapped.poiInput)
        if (!output.verification_result.exists) {
          console.log(`NOT_FOUND`)
          runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'not_found' })
          continue
        }
        // BFR14：`verifyPoi()` 在 LLM 失敗時不拋錯，而是回傳結構完整的降級結果——
        // 每個欄位都有值、型別都對，唯一的線索就是這個旗標。不擋下就是量產垃圾。
        if (output.llm_source === 'fallback') {
          console.log(`⏭  跳過入庫：llm_source=fallback，非真實驗證結果`)
          runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'fallback' })
          fallbackCount++
          consecutiveFallbacks++
          if (shouldAbortBatch(consecutiveFallbacks)) { aborted = true; break }
          if (i < entities.length - 1) await sleep(DELAY_MS)
          continue
        }
        consecutiveFallbacks = 0
        // TDX 原生欄位透過 signals 傳入，讓 ingestToDB 寫進 metadata JSONB
        const signals: IngestSignals = {
          category:            mapped.category,
          tdx_id:              mapped.tdxId,
          tdx_entity_type:     mapped.entityType,
          phone:               mapped.phone,
          open_time:           mapped.openTime,
          website_url:         mapped.poiInput.website_url ?? null,
          travel_info:         mapped.travelInfo,
          image_url:           mapped.imageUrls[0] ?? null,
          image_urls:          mapped.imageUrls.length > 0 ? mapped.imageUrls : null,
          image_descriptions:  mapped.imageDescriptions.length > 0 ? mapped.imageDescriptions : null,
          parking_info:        mapped.parkingInfo,
          service_status:      mapped.serviceStatus,
          service_status_label: mapped.serviceStatusLabel,
          is_accessible_for_free: mapped.isAccessibleForFree,
          fee_info:            mapped.feeInfo,
          tdx_src_update_time: mapped.tdxSrcUpdateTime,
          zip_code:            mapped.zipCode,
        }
        const ir = await ingestToDB(output, { sourceId: mapped.sourceId, region: mapped.region, curatedZone: ZONE }, signals)
        if (ir.skipped) {
          console.log(`SKIP  ${ir.error}`)
          runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'skip' })
        } else if (!ir.success) {
          console.log(`FAIL  ${ir.error}`)
          runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'fail' })
          failCount++
        } else {
          const r = output.verification_result.reliability_score
          console.log(`✅  L${output.enrichment_result.suggested_level}  r=${r.toFixed(2)}  dim=${ir.embeddingDim}`)
          runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'ok', uuid: ir.uuid })
          successCount++
        }
      } catch (err: any) {
        console.log(`ERROR  ${err?.message ?? err}`)
        runLog.push({ sourceId: mapped.sourceId, name: mapped.poiInput.name, status: 'error' })
        failCount++
      }
    }

    if (i < entities.length - 1) await sleep(DELAY_MS)
  }

  // 3. 寫入執行紀錄
  if (!DRY_RUN) {
    const logPath = path.join(RESULTS_DIR, `tdx_ingest_${TYPE}_${Date.now()}.json`)
    fs.writeFileSync(logPath, JSON.stringify(runLog, null, 2), 'utf-8')
    console.log(`\n  執行紀錄已儲存：${logPath}`)
  }

  console.log('\n' + '═'.repeat(56))
  if (DRY_RUN) {
    console.log(`  DRY-RUN 完成：${entities.length} 筆對映印出，未寫入 DB`)
  } else if (aborted) {
    console.error(`  ⛔ 已中止：連續 ${consecutiveFallbacks} 筆走降級分支（門檻 ${MAX_CONSECUTIVE_FALLBACKS}）`)
    console.error(`     最可能的原因是 LLM 配額耗盡或金鑰失效。修正後重跑即可，`)
    console.error(`     已入庫的 ${successCount} 筆不受影響。`)
    console.error(`  結果：${successCount} 成功 ／ ${fallbackCount} 降級未入庫 ／ ${failCount} 失敗`)
  } else {
    console.log(
      `  完成：${successCount} 成功 ／ ${fallbackCount} 降級未入庫 ／ ` +
      `${failCount} 失敗 ／ ${closedCount} 筆因永久停業未入庫`,
    )
  }
  console.log('═'.repeat(56) + '\n')
  // 降級或中止都要讓 exit code 非 0——CI／腳本串接時「有東西沒進去」不能安靜通過
  if (aborted || fallbackCount > 0) process.exitCode = 1
})()

// ── DRY-RUN 假資料（示範對映格式）──────────────────────────────────────

function makeDryRunFixture(type: TdxEntityType): TdxEntity {
  switch (type) {
    case 'Restaurant':
      return {
        RestaurantID:   'DRY-RS-000001',
        RestaurantName: '示範餐廳（dry-run）',
        Description:    '這是一筆用來驗證欄位對映的假資料。',
        PositionLat:    25.04,
        PositionLon:    121.5,
        PostalAddress:  { City: '臺北市', Town: '中正區', ZipCode: '100', StreetAddress: '範例路1號' },
        Telephones:     [{ Tel: '(02)23456789', Ext: null }],
        ServiceTimeInfo: '11:00 ~ 21:00（週一公休）',
        ServiceStatus:  1,
        UpdateTime:     '2026-08-02T12:00:00+08:00',
      } as TdxRestaurant
    case 'Hotel':
      return {
        HotelID:       'DRY-HT-000001',
        HotelName:     '示範旅宿（dry-run）',
        PositionLat:   25.04,
        PositionLon:   121.5,
        PostalAddress: { City: '臺北市', Town: '中正區', ZipCode: '100', StreetAddress: '旅宿路1號' },
        ServiceInfo:   '無線網路,停車場',
        ServiceStatus: 1,
        UpdateTime:    '2026-08-02T12:00:00+08:00',
      } as TdxHotel
    case 'Event':
      return {
        EventID:       'DRY-EV-000001',
        EventName:     '示範活動（dry-run）',
        Description:   '這是一筆假活動資料，用於驗證對映。',
        PositionLat:   25.01,
        PositionLon:   121.46,
        PostalAddress: { City: '新北市', Town: '板橋區', ZipCode: '220', StreetAddress: '範例街1號' },
        EventClasses:  [1],
        StartDateTime: '2026-07-01T00:00:00+08:00',
        EndDateTime:   '2026-07-31T23:59:59+08:00',
        Tags:          ['節慶', '親子'],
        UpdateTime:    '2026-08-02T12:00:00+08:00',
      } as TdxEvent
    default: // Attraction
      return {
        AttractionID:      'DRY-AT-000001',
        AttractionName:    '示範景點（dry-run）',
        Description:       '這是一筆用來驗證欄位對映的假資料。全年開放，無需門票。',
        PositionLat:       24.86,
        PositionLon:       121.75,
        AttractionClasses: [11, 12],
        PostalAddress:     { City: '宜蘭縣', Town: '頭城鎮', ZipCode: '261', StreetAddress: '北宜公路56.5km處' },
        Telephones:        [{ Tel: '(03)9312152', Ext: null }],
        Images:            [{ Name: '示範圖', Description: '照片提供｜示範', URL: 'https://example.com/a.jpg' }],
        ServiceTimeInfo:   '全年開放',
        ServiceStatus:     1,
        IsAccessibleForFree: 1,
        WebsiteUrl:        'https://example.com',
        Tags:              ['山景', '健行', '攝影'],
        UpdateTime:        '2026-08-02T12:00:00+08:00',
      } as TdxAttraction
  }
}
