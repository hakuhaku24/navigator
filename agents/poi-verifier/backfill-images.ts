/**
 * backfill-images.ts — 只補原始 45 筆的景點照片，不重跑驗證
 *
 * ## 為什麼需要這支腳本
 *
 * 2026-08-04 實查發現：`poi_catalog` 裡手動整理的那 45 筆（NCA/YMS/NEI）
 * **`images` 全部是空陣列**（0/45），而 explore 的 `getPicsumUrl()` 會退回
 * `picsum.photos/seed/<id>/800/600` ——也就是依 id 決定、但與景點內容完全無關的
 * 圖庫照。「擎天崗主圖是一杯檸檬薑茶」不是抓錯圖，是 45 筆全部如此。
 *
 * 對一個主張「我們的資料可被檢驗」的系統，畫面上配一張與景點無關的照片，
 * 是最傷的自打嘴巴。TDX 匯入的 55 筆則是 55/55 都有官方圖，所以來源現成。
 *
 * ## 這支腳本做什麼、不做什麼
 *
 *   ✅ 只寫 `images`、`metadata.image_url`、`image_urls`、`image_descriptions`
 *   ✅ 一併寫入出處（`image_source` / `image_match_tdx_name` / `image_match_distance_m`）
 *   ❌ 不動 `is_indoor` / `level` / `reliability_score` / `conflict_analysis` / `verification_tier`
 *   ❌ 不動 embedding、不呼叫 Gemini、不呼叫 Google Places、不花錢
 *
 * 出處欄位是刻意的：這個系統的主張就是「講得出資料哪來的」。
 * 補了一張自己也說不清楚出處的照片，等於把要證明的事情反過來證偽。
 *
 * ## 配對規則：沿用跨來源去重的雙條件，一個字都不放寬
 *
 * 「正規化後名稱相同（主名或 AlternateNames 任一）**且** 距離 ≤500 公尺」，
 * 直接重用 `canonical-poi.ts` 的 `normalizePoiName` / `DEDUP_DISTANCE_METERS`。
 *
 * ⚠️ **不要為了提高配對率而放寬。** 實測 45 筆裡嚴格配對只中 15 筆，剩下 30 筆
 * 有一半在 300 公尺內找得到「名字有點像」的 TDX 景點，很誘人——但實際查過：
 *
 *   · 陽明山花鐘 最近的有圖候選是 120m 外的「草山行館」
 *   · 報時山棧道 最近的是 34m 外的「國際終戰和平紀念園區」
 *   · 南雅奇岩   最近的是 49m 外的「南子吝步道」
 *
 * 這三組都是**不同的地方**。放寬比對的後果不是「配得多一點」，是把別的景點的
 * 照片掛到這個景點上——正好就是本專案要否證的那種錯誤，而且畫面上看不出來。
 * 漏配的後果是繼續顯示占位圖（看得見、可人工處理），誤配是靜默的假資料。
 *
 * 配不到的那些請用 `--review` 產生人工覆核清單，由人決定，不要讓腳本猜。
 *
 * ## 用法
 *
 *   npx ts-node backfill-images.ts                # 預設 dry-run：只報告，不寫入
 *   npx ts-node backfill-images.ts --apply        # 真的寫入
 *   npx ts-node backfill-images.ts --review       # 另外列出配不到者的鄰近候選（供人工判斷）
 *   npx ts-node backfill-images.ts --approved     # 套用 APPROVED_PAIRS（人工覆核通過的例外）
 *   npx ts-node backfill-images.ts --only NCA-004 # 只處理指定 source_id（可重複）
 *
 * 預設 dry-run 是刻意的：這支會動線上資料，讓「不小心跑到」的後果是零。
 *
 * ## 成本
 *
 * 只打 TDX（免費，但有速率限制，內建 429 退避）。不呼叫任何計費 API。
 */

import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(__dirname, '../../.env.local') })
dotenv.config({ path: path.join(__dirname, '../../.env') })

import { normalizePoiName, distanceMeters, DEDUP_DISTANCE_METERS } from './src/canonical-poi'
import type { TdxImage } from './src/tdx-types'

const APPLY    = process.argv.includes('--apply')
const REVIEW   = process.argv.includes('--review')
const APPROVED = process.argv.includes('--approved')
const ONLY: string[] = process.argv.reduce<string[]>((acc, a, i, arr) => {
  if (a === '--only' && arr[i + 1]) acc.push(arr[i + 1])
  return acc
}, [])

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// 與 ingest-from-tdx.ts 同一組端點。這裡刻意寫成本地副本而不是去 export 那支的
// 內部函式——那支是 596 行的匯入主線，為了一支唯讀回填腳本去動它不划算。
const TDX_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'
const TDX_API_BASE  = 'https://tdx.transportdata.tw/api/tourism/service/odata/V2/Tourism'

/** 原始 45 筆散落在這三個縣市（陽明山跨臺北／新北，東北角跨新北／基隆） */
const CITIES = ['臺北市', '新北市', '基隆市'] as const
/** 45 筆裡有餐廳（劉家肉粽、豆留森林、阿妹茶樓）與旅館（福容大飯店），所以三類都撈 */
const ENTITY_TYPES = ['Attraction', 'Restaurant', 'Hotel'] as const
const NAME_KEY: Record<string, string> = {
  Attraction: 'AttractionName',
  Restaurant: 'RestaurantName',
  Hotel:      'HotelName',
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * 人工覆核通過的配對（`--approved` 才會套用）。
 *
 * 這些是嚴格規則配不到、但人逐筆查證後確認為同一地點的例外。每一筆都必須寫下
 * **證據**（不是「看起來很像」），因為這裡繞過的正是防止誤配的那道規則。
 * 寫入時 `image_source` 會標成 `tdx_human_reviewed` 而不是 `tdx_name_geo_match`，
 * 讓「機器嚴格配對」與「人工放行」在資料層可以分辨。
 *
 * 2026-08-04 第一批覆核：候選 10 組，通過 6 組、保留 4 組。
 * 保留的 4 組不是證據不足，是**它們在 poi_catalog 裡本來就已經重複成兩筆**
 * （YMS-002 中山樓↔陽明山中山樓 171m、YMS-005 小油坑硫氣孔↔小油坑遊憩區 199m、
 * YMS-010 冷水坑溫泉浴室↔冷水坑 213m、NCA-006 臺灣最北點↔Fuguei Cape Park 167m）。
 * 補圖會讓兩張卡片長得一模一樣，把既有的重複問題放大到畫面上。
 * 先處理重複（哪一筆留、哪些欄位優先）才輪得到補圖，而那是人的決定。
 */
const APPROVED_PAIRS: Record<string, { tdxName: string; reason: string }> = {
  'NCA-005': {
    tdxName: '金山老街(金包里老街)',
    reason: '我方地址「金山區和平里金包里街71號」與 TDX「金山區金包里街」同街；TDX 描述明言「金山老街又名金包里老街」。158m',
  },
  'NCA-013': {
    tdxName: '白沙灣遊客中心（白沙灣自然中心）',
    reason: '門牌完全相同：雙方皆為「石門區德茂里(下員坑)33-6號」。北海岸遊憩探索館即該遊客中心內的展示館。121m',
  },
  'NCA-014': {
    tdxName: '麟山鼻地質景觀生態步道',
    reason: '同一岬角的步道；語意上比「麟山鼻遊憩區」（整個園區）更貼近「木棧道」。340m',
  },
  'YMS-001': {
    tdxName: '草山行館(目前暫停開放)',
    reason: '完全同名，只因括號註記使正規化結果不同而配不到（normalizePoiName 不剝括號別名）。376m',
  },
  'NEI-001': {
    tdxName: '福容大飯店 福隆',
    reason: '門牌完全相同：雙方皆為「貢寮區福隆里福隆街41號」。隔壁的「福隆貝悅」是 40 號、不同棟，已排除。315m',
  },
  'NEI-005': {
    tdxName: '舊草嶺隧道',
    reason: '完全同名、同為貢寮區福隆里。距離 3,809m 超過門檻，是因為隧道本身長 2,167m——'
          + '500m 規則假設點狀地物，對隧道／步道這類線形地物不適用。此為經人確認的距離例外。',
  },
}

interface PoiRow {
  id: string
  source_id: string
  name: string
  lat: number | null
  lng: number | null
  images: string[] | null
  metadata: Record<string, any>
}

interface TdxCandidate {
  type: string
  name: string
  lat: number
  lng: number
  images: string[]
  descriptions: string[]
  norm: string
  altNorms: string[]
}

async function fetchTdxToken(): Promise<string> {
  const clientId     = process.env.TDX_CLIENT_ID
  const clientSecret = process.env.TDX_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('TDX_CLIENT_ID / TDX_CLIENT_SECRET 未設定（.env.local）')
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret,
  })
  const res = await fetch(TDX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`TDX token 取得失敗 HTTP ${res.status}`)
  return (await res.json() as { access_token: string }).access_token
}

/**
 * 撈某縣市某實體型別的全部資料，分頁 + 429 退避。
 *
 * 429 一定要退避重試而不是跳過：實測不退避時 Hotel 三個縣市全被擋掉，
 * 候選池少一半而配對率照樣是「找不到」，看起來像資料沒有，其實是被限流。
 */
async function fetchTdxAll(type: string, city: string, token: string): Promise<any[]> {
  const out: any[] = []
  for (let skip = 0; skip < 4000; skip += 500) {
    const params = new URLSearchParams({
      $top: '500', $skip: String(skip), $format: 'JSON',
      $filter: `PostalAddress/City eq '${city}'`,
    })
    let batch: any[] | null = null
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(`${TDX_API_BASE}/${type}?${params}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
      // TDX 是分鐘級限流，短退避不夠——實測 3s 起跳的退避會讓 Hotel/新北市
      // （500 筆那批，排在最後）整批拿不到，看起來像「TDX 沒有這家飯店」，
      // 其實只是配額被前面的 Attraction 用光了。退避要跨過整個分鐘窗口。
      if (res.status === 429) { await sleep(15000 * (attempt + 1)); continue }
      if (!res.ok) {
        console.log(`   ! ${type}/${city} HTTP ${res.status}，略過`)
        return out
      }
      const json = await res.json()
      batch = Array.isArray(json) ? json : (json.value ?? json.data ?? [])
      break
    }
    if (batch === null) { console.log(`   ! ${type}/${city} 429 重試耗盡`); return out }
    out.push(...batch)
    if (batch.length < 500) break
    await sleep(1200)
  }
  return out
}

function toCandidate(entity: any, type: string): TdxCandidate | null {
  const name = entity[NAME_KEY[type]]
  // PositionLat / PositionLon 在實體頂層，不在 Position 物件底下（tdx-types.ts:169）
  const lat = entity.PositionLat
  const lng = entity.PositionLon
  if (!name || typeof lat !== 'number' || typeof lng !== 'number') return null

  const raw: TdxImage[] = entity.Images ?? []
  const valid = raw.filter(i => typeof i?.URL === 'string' && i.URL.trim().length > 0)
  return {
    type,
    name,
    lat,
    lng,
    images:       valid.map(i => i.URL as string),
    // 與 URL 同索引對齊。⚠️ TDX 的 Description 實測幾乎都是出處標註
    // （「照片提供｜宜蘭分署」）而非圖片內容，別拿它做圖文相符查核。
    descriptions: valid.map(i => (typeof i.Description === 'string' ? i.Description.trim() : '')),
    norm:         normalizePoiName(name),
    altNorms:     ((entity.AlternateNames ?? []) as string[])
                    .filter(Boolean).map(normalizePoiName),
  }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

  const { data, error } = await sb
    .from('poi_catalog')
    .select('id, source_id, name, lat, lng, images, metadata')
    .limit(1000)
  if (error) {
    console.error('讀取 poi_catalog 失敗：', error.message)
    process.exit(1)
  }

  const rows = (data ?? []) as PoiRow[]
  let todo = rows.filter(r => (r.images ?? []).length === 0 && r.lat != null && r.lng != null)
  if (ONLY.length > 0) todo = todo.filter(r => ONLY.includes(r.source_id))

  console.log(`模式：${APPLY ? '⚠️  APPLY（會寫入線上資料）' : 'dry-run（唯讀）'}`)
  console.log(`poi_catalog 共 ${rows.length} 筆，其中 ${todo.length} 筆沒有圖片\n`)
  if (todo.length === 0) { console.log('沒有需要處理的資料。'); return }

  console.log('撈 TDX 候選池…')
  const token = await fetchTdxToken()
  const pool: TdxCandidate[] = []
  for (const type of ENTITY_TYPES) {
    for (const city of CITIES) {
      const entities = await fetchTdxAll(type, city, token)
      const cands = entities.map(e => toCandidate(e, type)).filter((c): c is TdxCandidate => c !== null)
      const withImg = cands.filter(c => c.images.length > 0).length
      console.log(`  ${type} / ${city}: ${entities.length} 筆，可用座標 ${cands.length} 筆，有圖 ${withImg} 筆`)
      pool.push(...cands)
      await sleep(1200)
    }
  }
  console.log(`候選池共 ${pool.length} 筆（有圖 ${pool.filter(c => c.images.length > 0).length} 筆）\n`)

  const matched: Array<{ row: PoiRow; cand: TdxCandidate; dist: number; approved?: string }> = []
  let unmatched: PoiRow[] = []

  for (const row of todo) {
    const target = { lat: row.lat as number, lng: row.lng as number }
    const n = normalizePoiName(row.name)
    // 雙條件：名稱（主名或別名）正規化後相同 且 距離 ≤ DEDUP_DISTANCE_METERS
    const hits = pool
      .filter(c => (c.norm === n || c.altNorms.includes(n)) && c.images.length > 0)
      .map(c => ({ cand: c, dist: distanceMeters(target, c) }))
      .filter(h => h.dist <= DEDUP_DISTANCE_METERS)
      .sort((a, b) => b.cand.images.length - a.cand.images.length || a.dist - b.dist)

    if (hits.length === 0) { unmatched.push(row); continue }
    matched.push({ row, cand: hits[0].cand, dist: hits[0].dist })
  }

  console.log('═'.repeat(64))
  console.log(`嚴格配對成功 ${matched.length} 筆 / 待補 ${todo.length} 筆\n`)
  for (const m of matched) {
    console.log(`  ✓ ${m.row.source_id} ${m.row.name}`)
    console.log(`      ← TDX「${m.cand.name}」（${m.cand.type}）${Math.round(m.dist)}m，${m.cand.images.length} 張`)
    console.log(`      ${m.cand.images[0]}`)
  }

  // 人工覆核通過的例外。刻意跟嚴格配對分開計算、分開標記出處——
  // 這些是繞過防誤配規則放行的，資料層必須看得出來是誰放行的。
  if (APPROVED) {
    const stillUnmatched: PoiRow[] = []
    let approvedCount = 0
    console.log(`\n${'═'.repeat(64)}`)
    console.log('人工覆核通過的例外（APPROVED_PAIRS）：\n')
    for (const row of unmatched) {
      const pair = APPROVED_PAIRS[row.source_id]
      if (!pair) { stillUnmatched.push(row); continue }
      const target = { lat: row.lat as number, lng: row.lng as number }
      const hits = pool
        .filter(c => c.name === pair.tdxName && c.images.length > 0)
        .map(c => ({ cand: c, dist: distanceMeters(target, c) }))
        .sort((a, b) => a.dist - b.dist)
      if (hits.length === 0) {
        console.log(`  ⚠️ ${row.source_id} ${row.name} — TDX 候選池找不到「${pair.tdxName}」，略過`)
        stillUnmatched.push(row)
        continue
      }
      approvedCount++
      matched.push({ row, cand: hits[0].cand, dist: hits[0].dist, approved: pair.reason })
      console.log(`  ✓ ${row.source_id} ${row.name}`)
      console.log(`      ← TDX「${hits[0].cand.name}」（${hits[0].cand.type}）${Math.round(hits[0].dist)}m，${hits[0].cand.images.length} 張`)
      console.log(`      放行理由：${pair.reason}`)
      console.log(`      ${hits[0].cand.images[0]}`)
    }
    unmatched = stillUnmatched
    console.log(`\n  小計：人工放行 ${approvedCount} 筆`)
  }

  if (APPLY) {
    console.log('\n寫入中…')
    let ok = 0
    for (const m of matched) {
      const { error: upErr } = await sb
        .from('poi_catalog')
        .update({
          images: m.cand.images,
          metadata: {
            ...m.row.metadata,
            image_url:          m.cand.images[0],
            image_urls:         m.cand.images,
            image_descriptions: m.cand.descriptions,
            // 出處：這個系統的主張就是講得出資料哪來的，補圖也不例外。
            // 機器嚴格配對與人工放行必須分辨得出來——後者繞過了防誤配規則。
            image_source:            m.approved ? 'tdx_human_reviewed' : 'tdx_name_geo_match',
            image_match_tdx_name:    m.cand.name,
            image_match_tdx_type:    m.cand.type,
            image_match_distance_m:  Math.round(m.dist),
            image_backfilled_at:     new Date().toISOString(),
            ...(m.approved ? { image_match_review_reason: m.approved } : {}),
          },
        })
        .eq('id', m.row.id)
      if (upErr) console.error(`  ⚠️ ${m.row.source_id} 寫入失敗：${upErr.message}`)
      else ok++
    }
    console.log(`寫入成功 ${ok}/${matched.length} 筆`)
  }

  console.log(`\n${'─'.repeat(64)}`)
  console.log(`配不到、仍會顯示占位圖的 ${unmatched.length} 筆：`)
  console.log(unmatched.map(r => `${r.source_id} ${r.name}`).join('\n  '))

  if (REVIEW) {
    console.log(`\n${'═'.repeat(64)}`)
    console.log('人工覆核清單：以下是「距離很近但名字對不上」的候選。')
    console.log('⚠️ 腳本刻意不自動採用。實測這裡面確實混著不同的地方')
    console.log('   （陽明山花鐘 120m 外是草山行館、報時山棧道 34m 外是紀念園區），')
    console.log('   採用前請逐筆確認，確認後用 --only <source_id> 手動處理。\n')
    for (const row of unmatched) {
      const target = { lat: row.lat as number, lng: row.lng as number }
      const near = pool
        .filter(c => c.images.length > 0)
        .map(c => ({ c, d: distanceMeters(target, c) }))
        .filter(h => h.d <= 300)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
      if (near.length === 0) { console.log(`  ${row.source_id} ${row.name} — 300m 內無有圖候選`); continue }
      console.log(`  ${row.source_id} ${row.name}`)
      for (const h of near) {
        console.log(`      · 「${h.c.name}」（${h.c.type}）${Math.round(h.d)}m，${h.c.images.length} 張`)
      }
    }
  }

  if (!APPLY) {
    console.log(`\n這是 dry-run，沒有寫入任何資料。確認以上結果後加 --apply 才會真的寫。`)
  }
  console.log('═'.repeat(64))
}

main().catch(e => { console.error(e); process.exit(1) })
