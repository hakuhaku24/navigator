/**
 * ingest-from-tdx.ts — TDX 觀光 API 自動匯入 poi_catalog pipeline
 *
 * 整合策略來自 docs/TDX_SCHEMA_COMPARISON.md § 5：
 *   Step 1  TDX 實體欄位對映 → Navigator PoiInput
 *   Step 2  Navigator 自行生成的欄位（level / weather_sensitivity / embedding…）
 *   Step 3  upsert 進 Supabase poi_catalog
 *
 * 執行模式：
 *   npx ts-node ingest-from-tdx.ts                            # 預設：ScenicSpot，全台，top 20，完整驗證
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
  TdxScenicSpot,
  TdxRestaurant,
  TdxHotel,
  TdxActivity,
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

const TYPE: TdxEntityType = (getArg('--type') as TdxEntityType) || 'ScenicSpot'
const CITY_FILTER: string | null = getArg('--city')
const TOP: number     = parseInt(getArg('--top') ?? '20', 10)
const DELAY_MS: number = parseInt(getArg('--delay') ?? '11000', 10)
const DRY_RUN: boolean    = hasFlag('--dry-run')
const SKIP_VERIFY: boolean = hasFlag('--skip-verify')

// ── TDX API 常數 ──────────────────────────────────────────────────────────

const TDX_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'
const TDX_API_BASE  = 'https://tdx.transportdata.tw/api/basic/v2/Tourism'

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
  if (cityFilter) {
    params.set('$filter', `City eq '${cityFilter}'`)
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
  // TDX v2 回應格式：直接是陣列，或包在 { data: [] } 裡
  if (Array.isArray(json)) return json as TdxEntity[]
  const wrapper = json as TdxApiResponse<TdxEntity>
  return wrapper.data ?? wrapper.value ?? []
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
  const class1ForHeuristic = mapped.preliminaryTags[0] ?? null
  const isIndoor  = llm?.is_indoor            ?? inferIsIndoor(class1ForHeuristic)
  const weather   = llm?.weather_sensitivity  ?? inferWeatherSensitivity(class1ForHeuristic)
  const stayMins  = llm?.average_stay_minutes ?? defaultStayMinutes(mapped.category)
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

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]
    const mapped = mapTdxEntity(entity, TYPE)

    const prefix = `[${String(i + 1).padStart(2, '0')}/${entities.length}] ${mapped.sourceId}`
    process.stdout.write(`${prefix}  ${mapped.poiInput.name.slice(0, 20).padEnd(20)}  `)

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
        tdx_src_update_time: mapped.tdxSrcUpdateTime,
      }
      try {
        const ir = await ingestToDB(output, { sourceId: mapped.sourceId, region: mapped.region }, signals)
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
          tdx_src_update_time: mapped.tdxSrcUpdateTime,
        }
        const ir = await ingestToDB(output, { sourceId: mapped.sourceId, region: mapped.region }, signals)
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
  } else {
    console.log(`  完成：${successCount} 成功 ／ ${failCount} 失敗`)
  }
  console.log('═'.repeat(56) + '\n')
})()

// ── DRY-RUN 假資料（示範對映格式）──────────────────────────────────────

function makeDryRunFixture(type: TdxEntityType): TdxEntity {
  switch (type) {
    case 'Restaurant':
      return {
        RestaurantID:   'DRY-RS-000001',
        RestaurantName: '示範餐廳（dry-run）',
        Description:    '這是一筆用來驗證欄位對映的假資料。',
        Address:        '臺北市中正區範例路 1 號',
        OpenTime:       '11:00 ~ 21:00（週一公休）',
        Class:          '其他',
        City:           '臺北市',
        Position:       { PositionLon: 121.5, PositionLat: 25.04 },
      } as TdxRestaurant
    case 'Hotel':
      return {
        HotelID:   'DRY-HT-000001',
        HotelName: '示範旅宿（dry-run）',
        Address:   '臺北市中正區旅宿路 1 號',
        Class:     '民宿',
        City:      '臺北市',
        Position:  { PositionLon: 121.5, PositionLat: 25.04 },
      } as TdxHotel
    case 'Activity':
      return {
        ActivityID:   'DRY-AC-000001',
        ActivityName: '示範活動（dry-run）',
        Description:  '這是一筆假活動資料，用於驗證對映。',
        StartTime:    '2026-07-01T00:00:00+08:00',
        EndTime:      '2026-07-31T23:59:59+08:00',
        Class1:       '年度活動',
        City:         '新北市',
        Position:     { PositionLon: 121.46, PositionLat: 25.01 },
      } as TdxActivity
    default: // ScenicSpot
      return {
        ScenicSpotID:      'DRY-SS-000001',
        ScenicSpotName:    '示範景點（dry-run）',
        DescriptionDetail: '這是一筆用來驗證欄位對映的假資料。全年開放，無需門票。',
        OpenTime:          '全年開放',
        Class1:            '自然風景類',
        Keyword:           '山景,健行,攝影',
        WebsiteUrl:        'https://example.com',
        City:              '宜蘭縣',
        Position:          { PositionLon: 121.75, PositionLat: 24.86, GeoHash: 'wsqt7nd1f' },
      } as TdxScenicSpot
  }
}
