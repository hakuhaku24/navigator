/**
 * bench-datalayer.ts — 資料層 A/B 對照測試（教授 0722 要求的 Benchmark）
 *
 * 要證明的一件事：
 *   「同一個 LLM、同一道題目、同一種輸出格式，**只差有沒有把驗證過的景點資料
 *     餵給它**，答案的可查證程度差多少。」
 *
 * 兩組對照（唯一變因是 context，其餘完全相同）：
 *   A 組（bare）    只給模糊指令，不給任何資料 → LLM 憑記憶回答
 *   B 組（datalayer）同樣的指令 + Navigator 檢索到的已驗證景點 → 有據可查
 *
 * 三個自動可算的指標（不需要人工評分，跑完就有數字）：
 *   1. 可查證率 groundedness ── 回答提到的景點，有幾個真的存在於 poi_catalog
 *      （查不到 = 幻覺，或至少是「我們無法背書」的景點）
 *   2. 事實一致率 factual    ── 對得上的景點，室內/室外的宣稱跟資料庫是否相符
 *   3. 附來源率 sourced      ── 每筆推薦有沒有講得出依據
 *
 * ⚠️ 題目為什麼全部鎖在北海岸：
 *   `results/poi_verified.json` 45 筆裡，只有 15 筆（NCA-*，北海岸）是真的跑完
 *   LLM 驗證的；另外 30 筆（YMS-*／NEI-*）是 Gemini 免費配額耗盡後的靜默降級
 *   （facts=null、level 是預設值不是判斷），見 KNOWN_ISSUES.md 2026-07-24 條目。
 *   拿沒真的驗過的資料去證明「資料層有用」，證出來的東西不能用。
 *   等那 30 筆重跑完，把 REGION_SCOPE 打開即可涵蓋全部三區。
 *
 * 用法：
 *   npx ts-node bench-datalayer.ts run           跑兩組，結果寫進 bench-results/datalayer.json
 *   npx ts-node bench-datalayer.ts run --arm b   只跑 B 組（省 token，A 組沿用上次結果）
 *   npx ts-node bench-datalayer.ts report        讀結果印對照表（不呼叫任何 API）
 *
 * 成本：一題兩組各一次 Gemini 2.5 Flash 呼叫 + B 組一次 embedding，
 *      6 題整輪約 NT$1 以內。
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(__dirname, '../../.env.local') })
dotenv.config({ path: path.join(__dirname, '../../.env') })

// ── 設定 ────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const GEN_MODEL = 'gemini-2.5-flash'
const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIM = 768
const TOP_K = 5 // 餵給 B 組的景點筆數
const RESULT_DIR = path.join(__dirname, 'bench-results')
const RESULT_FILE = path.join(RESULT_DIR, 'datalayer.json')

// 只採計這個區域的真值（見檔頭說明）。設成 null 代表不限區域。
const REGION_SCOPE: string | null = '北海岸'

// ── 題庫 ────────────────────────────────────────────────────────────────────
// 挑題原則：都是「答錯會讓使用者白跑一趟」的題型——天氣、營運限制、季節性、
// 體力限制。教授舉的首爾地鐵站名是同一類：資訊錯了就直接害到人。

interface Question {
  id: string
  ask: string
  /** 這題想壓測什麼 */
  probes: string
}

const QUESTIONS: Question[] = [
  {
    id: 'Q1',
    ask: '我明天要去北海岸玩，下午降雨機率很高，請推薦不會淋到雨的景點。',
    probes: '天氣適配 — 室內/室外分類錯就會讓人在雨中罰站',
  },
  {
    id: 'Q2',
    ask: '北海岸有哪些景點是需要事先預約、不能說去就去的？',
    probes: '營運事實 — 憑印象答會漏掉預約制，行程當天才發現進不去',
  },
  {
    id: 'Q3',
    ask: '帶行動比較慢的長輩去北海岸，想找不用爬坡、走一小段就到的地方。',
    probes: '體力限制 — 需要停留時間與地形資訊，最容易被泛泛而談帶過',
  },
  {
    id: 'Q4',
    ask: '老梅綠石槽現在去看得到嗎？如果看不到有什麼替代方案？',
    probes: '季節性 — 綠石槽只有春季，答「隨時可去」就是實質錯誤',
  },
  {
    id: 'Q5',
    ask: '想在北海岸看海拍照，順便吃海鮮，幫我排一個下午的路線。',
    probes: '一般推薦題 — 沒有陷阱，看兩組在「安全題」上差距有多大',
  },
  {
    id: 'Q6',
    ask: '野柳附近如果天氣突然變差，有什麼室內的備案景點？',
    probes: '鄰近性 + 天氣 — 需要同時對得上地理位置與室內屬性',
  },
]

// 兩組共用的輸出格式指令。格式一致才比得出「差別來自 context 而不是格式」，
// 也才能自動判分——這是刻意讓 A 組也能被公平計分的設計。
const OUTPUT_CONTRACT = `
請只輸出 JSON，格式如下，不要有其他文字或 markdown 標記：
{"recommendations":[{"name":"景點名稱","indoor":true,"source":"你依據什麼推薦（沒有依據就填空字串）","reason":"一句話理由"}]}
最多推薦 5 個景點。indoor 是布林值：室內或有遮蔽填 true，戶外填 false。`

const SYSTEM_BARE = `你是旅遊助理，請推薦台灣北海岸的景點。${OUTPUT_CONTRACT}`

const SYSTEM_WITH_DATA = `你是旅遊助理，請推薦台灣北海岸的景點。
只能從下方「已驗證景點資料」裡挑選，不得推薦清單以外的地點；
資料裡的室內/室外、營業資訊以資料為準，不要憑印象覆寫。${OUTPUT_CONTRACT}`

// ── 型別 ────────────────────────────────────────────────────────────────────

interface Recommendation {
  name: string
  indoor?: boolean
  source?: string
  reason?: string
}

interface ArmResult {
  arm: 'bare' | 'datalayer'
  question_id: string
  raw: string
  recommendations: Recommendation[]
  parse_ok: boolean
  metrics: {
    total: number
    grounded: number // 名稱對得上 poi_catalog
    ungrounded_names: string[] // 對不上的（幻覺或無法背書）
    indoor_checked: number // 對得上、且有給 indoor 宣稱的筆數
    indoor_correct: number
    sourced: number // source 非空
  }
  tokens: number
  latency_ms: number
}

interface BenchFile {
  ran_at: string
  region_scope: string | null
  catalog_size: number
  results: ArmResult[]
}

interface CatalogPoi {
  name: string
  region: string | null
  is_indoor: boolean | null
  description: string | null
  address: string | null
  hours: string | null
  level: number | null
}

// ── 真值：poi_catalog ───────────────────────────────────────────────────────

function sb() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定')
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

async function loadCatalog(): Promise<CatalogPoi[]> {
  const { data, error } = await sb()
    .from('poi_catalog')
    .select('name, description, address, hours, metadata')
    .limit(500)
  if (error) throw new Error(`poi_catalog 讀取失敗：${error.message}`)

  return (data ?? [])
    .map((r: Record<string, unknown>) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>
      return {
        name: String(r.name ?? ''),
        region: (meta.region as string) ?? null,
        is_indoor: typeof meta.is_indoor === 'boolean' ? meta.is_indoor : null,
        description: (r.description as string) ?? null,
        address: (r.address as string) ?? null,
        hours: (r.hours as string) ?? null,
        level: typeof meta.level === 'number' ? meta.level : null,
      }
    })
    .filter((p) => !REGION_SCOPE || p.region === REGION_SCOPE)
}

// 名稱比對：中文景點名在 LLM 輸出裡常多/少括號、空白、後綴（「(預約席)」「風景區」），
// 完全相等太嚴格。正規化後用雙向包含，並要求至少 2 個字，避免「山」對到所有東西。
function normalizeName(s: string): string {
  return s
    .replace(/[\s\-—·・()（）【】「」\[\]]/g, '')
    .replace(/(風景區|遊憩區|地質公園|國家公園|園區|景點)$/g, '')
    .toLowerCase()
}

function matchCatalog(name: string, catalog: CatalogPoi[]): CatalogPoi | undefined {
  const n = normalizeName(name)
  if (n.length < 2) return undefined
  return catalog.find((p) => {
    const c = normalizeName(p.name)
    if (c.length < 2) return false
    return c === n || c.includes(n) || n.includes(c)
  })
}

// ── 檢索（B 組的 context 來源）───────────────────────────────────────────────
// 參數刻意與 src/lib/poi-search.ts 的 searchPois() 對齊（同一個 RPC、同樣的
// threshold / rrf_k / alpha），差別只在這裡不做 scenario 結構加權——benchmark
// 要量的是「有沒有資料層」，不是重排策略調參。poi-search.ts 若改動請同步。

async function embedQuery(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 未設定')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIM,
        taskType: 'RETRIEVAL_QUERY',
      }),
    },
  )
  if (!res.ok) throw new Error(`embedding ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.embedding.values
}

async function retrieve(query: string): Promise<CatalogPoi[]> {
  const embedding = await embedQuery(query)
  const { data, error } = await sb().rpc('hybrid_search_poi_catalog', {
    query_text: query,
    query_embedding: embedding,
    match_threshold: 0.3,
    rrf_k: 60,
    match_count: 20,
    alpha: 0.5,
    filter_metadata: {},
  })
  if (error) throw new Error(`hybrid_search RPC 失敗：${error.message}`)

  return (data ?? [])
    .map((r: Record<string, unknown>) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>
      return {
        name: String(r.name ?? ''),
        region: (meta.region as string) ?? null,
        is_indoor: typeof meta.is_indoor === 'boolean' ? meta.is_indoor : null,
        description: (r.description as string) ?? null,
        address: (r.address as string) ?? null,
        hours: (r.hours as string) ?? null,
        level: typeof meta.level === 'number' ? meta.level : null,
      }
    })
    .filter((p: CatalogPoi) => !REGION_SCOPE || p.region === REGION_SCOPE)
    .slice(0, TOP_K)
}

function formatContext(pois: CatalogPoi[]): string {
  if (pois.length === 0) return '（檢索沒有回傳任何景點）'
  return pois
    .map((p, i) => {
      const bits = [
        `${i + 1}. ${p.name}`,
        `   室內：${p.is_indoor === null ? '未知' : p.is_indoor ? '是' : '否'}`,
        p.level !== null ? `   分級：L${p.level}` : null,
        p.address ? `   地址：${p.address}` : null,
        p.hours ? `   營業時間：${p.hours}` : null,
        p.description ? `   說明：${p.description.slice(0, 120)}` : null,
      ].filter(Boolean)
      return bits.join('\n')
    })
    .join('\n')
}

// ── LLM ─────────────────────────────────────────────────────────────────────

async function callGemini(system: string, user: string): Promise<{ text: string; tokens: number }> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 未設定')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.3,
          // gemini-2.5-flash 預設會先「思考」，thinking token 跟輸出共用
          // maxOutputTokens 額度——不關掉的話 JSON 會在 90 字元左右被硬切斷
          // （2026-07-28 首次跑就踩到，12 題有 8 題 parse 失敗）。
          // 兩組設定完全相同，關掉 thinking 不影響 A/B 的公平性。
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    },
  )
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
    tokens: data.usageMetadata?.totalTokenCount ?? 0,
  }
}

function parseRecommendations(raw: string): { recs: Recommendation[]; ok: boolean } {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    const list = Array.isArray(parsed) ? parsed : parsed.recommendations
    if (!Array.isArray(list)) return { recs: [], ok: false }
    return {
      recs: list
        .filter((r: unknown): r is Record<string, unknown> => typeof r === 'object' && r !== null)
        .map((r) => ({
          name: String(r.name ?? ''),
          indoor: typeof r.indoor === 'boolean' ? r.indoor : undefined,
          source: typeof r.source === 'string' ? r.source : undefined,
          reason: typeof r.reason === 'string' ? r.reason : undefined,
        }))
        .filter((r) => r.name.length > 0),
      ok: true,
    }
  } catch {
    return { recs: [], ok: false }
  }
}

// ── 計分 ────────────────────────────────────────────────────────────────────

function score(recs: Recommendation[], catalog: CatalogPoi[]): ArmResult['metrics'] {
  const m: ArmResult['metrics'] = {
    total: recs.length,
    grounded: 0,
    ungrounded_names: [],
    indoor_checked: 0,
    indoor_correct: 0,
    sourced: 0,
  }
  for (const r of recs) {
    const hit = matchCatalog(r.name, catalog)
    if (hit) {
      m.grounded++
      // 只在雙方都有明確布林值時才計分，資料庫是 null 就不算它答錯
      if (typeof r.indoor === 'boolean' && typeof hit.is_indoor === 'boolean') {
        m.indoor_checked++
        if (r.indoor === hit.is_indoor) m.indoor_correct++
      }
    } else {
      m.ungrounded_names.push(r.name)
    }
    if (r.source && r.source.trim().length > 0) m.sourced++
  }
  return m
}

// ── 執行 ────────────────────────────────────────────────────────────────────

async function runArm(
  arm: 'bare' | 'datalayer',
  q: Question,
  catalog: CatalogPoi[],
): Promise<ArmResult> {
  const t0 = Date.now()
  let system = SYSTEM_BARE
  let user = q.ask

  if (arm === 'datalayer') {
    const retrieved = await retrieve(q.ask)
    system = SYSTEM_WITH_DATA
    user = `使用者問題：${q.ask}\n\n已驗證景點資料：\n${formatContext(retrieved)}`
  }

  const { text, tokens } = await callGemini(system, user)
  const { recs, ok } = parseRecommendations(text)
  return {
    arm,
    question_id: q.id,
    raw: text,
    recommendations: recs,
    parse_ok: ok,
    metrics: score(recs, catalog),
    tokens,
    latency_ms: Date.now() - t0,
  }
}

async function run(onlyArm: 'bare' | 'datalayer' | null) {
  if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR, { recursive: true })

  const catalog = await loadCatalog()
  console.log(`真值來源：poi_catalog${REGION_SCOPE ? `（${REGION_SCOPE}）` : ''} ${catalog.length} 筆`)
  if (catalog.length === 0) {
    console.error('poi_catalog 讀不到資料，先確認 Supabase 連線與 REGION_SCOPE 設定')
    process.exit(1)
  }

  const arms: ('bare' | 'datalayer')[] = onlyArm ? [onlyArm] : ['bare', 'datalayer']
  const previous: ArmResult[] = fs.existsSync(RESULT_FILE)
    ? (JSON.parse(fs.readFileSync(RESULT_FILE, 'utf-8')) as BenchFile).results
    : []
  // 只跑單組時，保留另一組上次的結果，報表才比得出來
  const results: ArmResult[] = previous.filter((r) => !arms.includes(r.arm))

  for (const q of QUESTIONS) {
    for (const arm of arms) {
      process.stdout.write(`${q.id} ${arm} ... `)
      try {
        const r = await runArm(arm, q, catalog)
        results.push(r)
        console.log(
          `${r.metrics.grounded}/${r.metrics.total} 可查證, ${r.tokens} tokens, ${r.latency_ms}ms`,
        )
      } catch (err) {
        console.log(`失敗：${err instanceof Error ? err.message : String(err)}`)
      }
      // Gemini 免費配額是每分鐘計的，跑太快會被擋（這正是 45 筆有 30 筆降級的原因）
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  const file: BenchFile = {
    ran_at: new Date().toISOString(),
    region_scope: REGION_SCOPE,
    catalog_size: catalog.length,
    results,
  }
  fs.writeFileSync(RESULT_FILE, JSON.stringify(file, null, 2))
  console.log(`\n已寫入 ${RESULT_FILE}`)
  report()
}

// ── 報表 ────────────────────────────────────────────────────────────────────

function pct(n: number, d: number): string {
  if (d === 0) return '—'
  return `${Math.round((n / d) * 100)}%`
}

function report() {
  if (!fs.existsSync(RESULT_FILE)) {
    console.error(`找不到 ${RESULT_FILE}，先跑 npx ts-node bench-datalayer.ts run`)
    process.exit(1)
  }
  const file = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf-8')) as BenchFile
  const get = (qid: string, arm: string) =>
    file.results.find((r) => r.question_id === qid && r.arm === arm)

  console.log(`\n資料層 A/B 對照（${file.ran_at}）`)
  console.log(`真值：poi_catalog${file.region_scope ? ` · ${file.region_scope}` : ''} ${file.catalog_size} 筆\n`)
  console.log('題目 │ A 裸提示 可查證      │ B 有資料層 可查證    │ A 幻覺景點')
  console.log('─────┼──────────────────────┼──────────────────────┼───────────────────────')

  for (const q of QUESTIONS) {
    const a = get(q.id, 'bare')
    const b = get(q.id, 'datalayer')
    // parse 失敗要看得出來，不然會被誤讀成「這題沒有推薦」——0/0 跟「答案壞掉」
    // 是兩件事，混在一起就是另一種靜默降級
    const fmt = (r?: ArmResult) => {
      if (!r) return '—'.padEnd(20)
      if (!r.parse_ok) return '⚠ 輸出無法解析'.padEnd(19)
      return `${r.metrics.grounded}/${r.metrics.total} (${pct(r.metrics.grounded, r.metrics.total)})`.padEnd(20)
    }
    const hallu = a?.metrics.ungrounded_names.slice(0, 2).join('、') ?? ''
    console.log(`${q.id.padEnd(4)} │ ${fmt(a)} │ ${fmt(b)} │ ${hallu}`)
  }

  const sum = (arm: string, pick: (m: ArmResult['metrics']) => number) =>
    file.results.filter((r) => r.arm === arm).reduce((s, r) => s + pick(r.metrics), 0)

  console.log('\n整體')
  for (const [label, arm] of [['A 裸提示   ', 'bare'], ['B 有資料層 ', 'datalayer']] as const) {
    const total = sum(arm, (m) => m.total)
    const grounded = sum(arm, (m) => m.grounded)
    const indoorC = sum(arm, (m) => m.indoor_checked)
    const indoorOk = sum(arm, (m) => m.indoor_correct)
    const sourced = sum(arm, (m) => m.sourced)
    const rows = file.results.filter((r) => r.arm === arm)
    const tokens = rows.reduce((s, r) => s + r.tokens, 0)
    const broken = rows.filter((r) => !r.parse_ok).length
    console.log(
      `${label} 可查證 ${pct(grounded, total)}（${grounded}/${total}）· ` +
        `室內外正確 ${pct(indoorOk, indoorC)}（${indoorOk}/${indoorC}）· ` +
        `附來源 ${pct(sourced, total)} · ${tokens} tokens` +
        (broken > 0 ? ` · ⚠ ${broken}/${rows.length} 題輸出無法解析（不計入上列比例）` : ''),
    )
  }

  const bare = file.results.filter((r) => r.arm === 'bare')
  const halluNames = [...new Set(bare.flatMap((r) => r.metrics.ungrounded_names))]
  if (halluNames.length > 0) {
    console.log(`\nA 組推薦但資料庫查無的景點（${halluNames.length} 個）：`)
    console.log(halluNames.map((n) => `  · ${n}`).join('\n'))
    console.log('  ↑ 這些不必然是「不存在的地方」，但都是 Navigator 無法背書的推薦——')
    console.log('    使用者踩到已歇業/資訊過期/季節限定時，系統沒有任何依據可以事先攔下。')
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

;(async () => {
  const mode = process.argv[2]
  const armFlag = process.argv.includes('--arm')
    ? process.argv[process.argv.indexOf('--arm') + 1]
    : null
  const onlyArm =
    armFlag === 'a' || armFlag === 'bare'
      ? ('bare' as const)
      : armFlag === 'b' || armFlag === 'datalayer'
        ? ('datalayer' as const)
        : null

  if (mode === 'run') await run(onlyArm)
  else if (mode === 'report') report()
  else {
    console.error('用法: ts-node bench-datalayer.ts run [--arm a|b] | report')
    process.exit(1)
  }
})()
