/**
 * tests/rag.test.ts — 基礎 RAG 語意搜尋測試報告
 *
 * 8 個測試情境，涵蓋：語意準確度、過濾器正確性、
 * 相似度閾值、精準景點命中、邊界案例
 *
 * 每個情境記錄：Top-K 結果、相似度分數、Token 用量、Pass / Fail 判定
 *
 * Usage: npx ts-node tests/rag.test.ts
 * Output: console + tests/rag-report.md
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '../../.env.local' })
dotenv.config({ path: '../../.env' })

// ── 設定 ──────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY  = process.env.GEMINI_API_KEY!
const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDINGS_FILE = path.join(__dirname, '../results/poi-embeddings.json')
const REPORT_FILE     = path.join(__dirname, 'rag-report.md')

// ── 型別 ──────────────────────────────────────────────────────────────────────

interface PoiEmbeddingEntry {
  poi_id: string
  name: string
  region: string
  suggested_level: number
  is_indoor: boolean
  weather_sensitivity: string
  embed_text: string
  embedding: number[]
}

interface SearchResult {
  poi_id: string
  name: string
  region: string
  suggested_level: number
  is_indoor: boolean
  weather_sensitivity: string
  similarity: number
}

interface TokenUsage {
  query_tokens: number       // query 的估算 token 數（字元數換算）
  embed_api_calls: number    // 呼叫 embedContent 幾次
}

interface TestScenario {
  id: string
  name: string
  query: string
  topK: number
  filter?: {
    type: 'indoor' | 'outdoor' | 'region' | 'level'
    value?: string | number[]
  }
  // 驗收條件（至少一個）
  criteria: {
    // 指定 POI 應出現在 top-K 中（命中 N 個以上即 pass）
    expected_poi_ids?: string[]
    min_hits?: number
    // 所有結果必須符合的屬性
    all_must_be_indoor?: boolean
    all_must_be_region?: string
    all_must_be_level?: number[]
    // 相似度門檻
    top1_similarity_above?: number
    top1_similarity_below?: number
  }
  description: string  // 測試目的說明
}

interface TestResult {
  scenario: TestScenario
  results: SearchResult[]
  passed: boolean
  fail_reason?: string
  token_usage: TokenUsage
  elapsed_ms: number
}

// ── 8 個測試情境 ───────────────────────────────────────────────────────────────

const SCENARIOS: TestScenario[] = [
  {
    id: 'S01',
    name: '雨天室內親子',
    query: '下雨天帶小孩去室內的活動景點',
    topK: 5,
    criteria: {
      expected_poi_ids: ['NCA-001', 'NCA-003', 'NCA-013', 'NEI-003'],
      min_hits: 2,
      top1_similarity_above: 65,
    },
    description: '驗證天氣敏感情境下，系統能召回室內親子景點',
  },
  {
    id: 'S02',
    name: '網美拍照打卡',
    query: '浪漫唯美的拍照打卡網美景點',
    topK: 5,
    criteria: {
      expected_poi_ids: ['NCA-012', 'NEI-009', 'NCA-004', 'NEI-008'],
      min_hits: 2,
      top1_similarity_above: 65,
    },
    description: '驗證 vibe 搜尋能精準命中「視覺美感」類景點',
  },
  {
    id: 'S03',
    name: '歷史文化深度',
    query: '有歷史故事和人文深度的文化景點導覽',
    topK: 5,
    criteria: {
      expected_poi_ids: ['YMS-001', 'YMS-002', 'YMS-003', 'NEI-004'],
      min_hits: 2,
      top1_similarity_above: 65,
    },
    description: '驗證「歷史文化」語意能召回行館、博物館類景點',
  },
  {
    id: 'S04',
    name: 'L3 水位調節景點',
    query: '沿途順遊快速停留的小景點，不需要花太多時間',
    topK: 5,
    criteria: {
      expected_poi_ids: ['NCA-010', 'NCA-012', 'NCA-015', 'YMS-012', 'NEI-010'],
      min_hits: 2,
      top1_similarity_above: 60,
    },
    description: '驗證「短暫停留、不耗時」的語意能對應 L3 水位調節景點',
  },
  {
    id: 'S05',
    name: '地質奇岩（戶外過濾）',
    query: '壯觀的岩石地質景觀海蝕地形',
    topK: 5,
    filter: { type: 'outdoor' },
    criteria: {
      expected_poi_ids: ['NCA-002', 'NCA-007', 'NEI-010', 'NEI-013'],
      min_hits: 2,
      all_must_be_indoor: false,
      top1_similarity_above: 65,
    },
    description: '驗證地質類 query + 戶外過濾，確保過濾器正確剔除室內景點',
  },
  {
    id: 'S06',
    name: '陽明山火山溫泉（地區過濾）',
    query: '火山地熱硫磺溫泉放鬆療癒',
    topK: 5,
    filter: { type: 'region', value: '陽明山' },
    criteria: {
      expected_poi_ids: ['YMS-005', 'YMS-011', 'YMS-010'],
      min_hits: 2,
      all_must_be_region: '陽明山',
      top1_similarity_above: 65,
    },
    description: '驗證地區過濾正確性：所有結果必須在陽明山，且語意相關',
  },
  {
    id: 'S07',
    name: '精準景點名稱命中',
    query: '九份山城老街霧氣迷離茶樓燈籠',
    topK: 3,
    criteria: {
      expected_poi_ids: ['NEI-007', 'NEI-002'],
      min_hits: 2,
      top1_similarity_above: 70,
    },
    description: '驗證描述極具體的情境下，精準景點排名靠前（高相似度）',
  },
  {
    id: 'S08',
    name: '無關語意邊界測試',
    query: '各景點的停車費用和交通方式比較',
    topK: 5,
    criteria: {
      // 與 POI vibe 無關的 query，top-1 相似度應低
      top1_similarity_below: 68,
    },
    description: '驗證語意邊界：與旅遊 vibe 無關的查詢，相似度應明顯較低',
  },
]

// ── Gemini API 工具函式 ───────────────────────────────────────────────────────

// Gemini embedding 模型的 countTextTokens 端點格式與 LLM 模型不同，
// 以字元數估算 token 數（中文 ≈ 1.5 字元/token，英文 ≈ 4 字元/token）更穩定。
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length
  const otherChars   = text.length - chineseChars
  return Math.round(chineseChars / 1.5 + otherChars / 4)
}

async function embedQuery(text: string): Promise<{ embedding: number[]; tokens: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`

  const embedRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_QUERY',
    }),
  })

  if (!embedRes.ok) throw new Error(`Embed API ${embedRes.status}: ${await embedRes.text()}`)

  const embedData = await embedRes.json()
  return {
    embedding: embedData.embedding.values as number[],
    tokens: estimateTokens(text),  // 估算值
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ── 過濾器 ────────────────────────────────────────────────────────────────────

function applyFilter(entry: PoiEmbeddingEntry, filter: TestScenario['filter']): boolean {
  if (!filter) return true
  switch (filter.type) {
    case 'indoor':  return entry.is_indoor === true
    case 'outdoor': return entry.is_indoor === false
    case 'region':  return entry.region === filter.value
    case 'level':   return Array.isArray(filter.value) && filter.value.includes(entry.suggested_level)
  }
}

// ── 驗收判定 ──────────────────────────────────────────────────────────────────

function evaluate(
  scenario: TestScenario,
  results: SearchResult[],
): { passed: boolean; reason?: string } {
  const c = scenario.criteria

  if (c.top1_similarity_above !== undefined && results.length > 0) {
    if (results[0].similarity * 100 < c.top1_similarity_above) {
      return { passed: false, reason: `Top-1 相似度 ${(results[0].similarity * 100).toFixed(1)}% < 門檻 ${c.top1_similarity_above}%` }
    }
  }

  if (c.top1_similarity_below !== undefined && results.length > 0) {
    if (results[0].similarity * 100 >= c.top1_similarity_below) {
      return { passed: false, reason: `Top-1 相似度 ${(results[0].similarity * 100).toFixed(1)}% ≥ 上限 ${c.top1_similarity_below}%（邊界測試應低於此值）` }
    }
  }

  if (c.expected_poi_ids && c.min_hits !== undefined) {
    const resultIds = results.map(r => r.poi_id)
    const hits = c.expected_poi_ids.filter(id => resultIds.includes(id))
    if (hits.length < c.min_hits) {
      return { passed: false, reason: `命中預期景點 ${hits.length}/${c.min_hits}（需要 ${c.min_hits} 個，僅命中：${hits.join(', ') || '無'}）` }
    }
  }

  if (c.all_must_be_indoor === false && results.some(r => r.is_indoor)) {
    const wrongOnes = results.filter(r => r.is_indoor).map(r => r.name)
    return { passed: false, reason: `過濾器失效：以下為室內景點卻出現在戶外結果中：${wrongOnes.join(', ')}` }
  }

  if (c.all_must_be_region) {
    const wrongRegion = results.filter(r => r.region !== c.all_must_be_region)
    if (wrongRegion.length > 0) {
      return { passed: false, reason: `過濾器失效：${wrongRegion.map(r => `${r.name}(${r.region})`).join(', ')} 不屬於 ${c.all_must_be_region}` }
    }
  }

  return { passed: true }
}

// ── 執行單一情境 ──────────────────────────────────────────────────────────────

async function runScenario(
  scenario: TestScenario,
  index: PoiEmbeddingEntry[],
): Promise<TestResult> {
  const t0 = Date.now()

  const { embedding: queryEmbedding, tokens } = await embedQuery(scenario.query)

  const pool = scenario.filter
    ? index.filter(e => applyFilter(e, scenario.filter))
    : index

  const results: SearchResult[] = pool
    .map(entry => ({
      poi_id: entry.poi_id,
      name: entry.name,
      region: entry.region,
      suggested_level: entry.suggested_level,
      is_indoor: entry.is_indoor,
      weather_sensitivity: entry.weather_sensitivity,
      similarity: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, scenario.topK)

  const { passed, reason } = evaluate(scenario, results)

  return {
    scenario,
    results,
    passed,
    fail_reason: reason,
    token_usage: {
      query_tokens: tokens,
      embed_api_calls: 1,
    },
    elapsed_ms: Date.now() - t0,
  }
}

// ── 報告生成 ──────────────────────────────────────────────────────────────────

function levelLabel(l: number): string {
  return ['L0 絕對錨點', 'L1 彈性錨點', 'L2 條件變動', 'L3 水位調節'][l] ?? `L${l}`
}

function generateReport(results: TestResult[], totalMs: number): string {
  const passed = results.filter(r => r.passed).length
  const failed = results.length - passed
  const totalQueryTokens = results.reduce((s, r) => s + r.token_usage.query_tokens, 0)
  const totalEmbedCalls  = results.reduce((s, r) => s + r.token_usage.embed_api_calls, 0)
  const totalApiCalls    = totalEmbedCalls

  const lines: string[] = []

  lines.push(`# 基礎 RAG 語意搜尋測試報告`)
  lines.push(``)
  lines.push(`**執行時間**：${new Date().toISOString().replace('T', ' ').slice(0, 19)}`)
  lines.push(`**使用模型**：${EMBEDDING_MODEL}（gemini-embedding-001，3072 維）`)
  lines.push(`**測試情境**：${results.length} 個`)
  lines.push(`**向量索引**：${path.basename(EMBEDDINGS_FILE)}`)
  lines.push(``)
  lines.push(`## 總覽`)
  lines.push(``)
  lines.push(`| 項目 | 數值 |`)
  lines.push(`|------|------|`)
  lines.push(`| 通過 / 總計 | ${passed} / ${results.length} |`)
  lines.push(`| 失敗情境 | ${failed} 個 |`)
  lines.push(`| 總耗時 | ${totalMs} ms |`)
  lines.push(`| Query 總 Token 數 | ${totalQueryTokens} tokens |`)
  lines.push(`| Gemini API 呼叫次數 | ${totalApiCalls} 次（embedContent×${totalEmbedCalls}）|`)
  lines.push(`| 估計費用 | 免費（embedding API 無額外費用，在免費額度內）|`)
  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`## 符號說明`)
  lines.push(``)
  lines.push(`| 符號 | 意義 |`)
  lines.push(`|------|------|`)
  lines.push(`| ⭐ | **預期命中景點**：測試設計者根據情境語意預先指定、「應該出現在搜尋結果裡」的景點。結果表中出現 ⭐ 代表向量搜尋確實找到了目標；若指定景點未在 Top-K 範圍內，則不顯示 ⭐，並計入「未命中」。 |`)
  lines.push(`| ✅ PASS | 此情境所有驗收條件均滿足 |`)
  lines.push(`| ❌ FAIL | 至少一項驗收條件未達標，FAIL 原因會列在搜尋結果下方 |`)
  lines.push(``)
  lines.push(`### 何謂「測試通過」`)
  lines.push(``)
  lines.push(`每個情境的 PASS 定義由下列一或多項條件組合：`)
  lines.push(``)
  lines.push(`| 條件類型 | 說明 |`)
  lines.push(`|---------|------|`)
  lines.push(`| **Top-1 相似度下限** | Top-1 景點的 cosine 相似度必須高於指定百分比，確保語意搜尋不是隨機猜測 |`)
  lines.push(`| **Top-1 相似度上限** | 用於邊界測試（S08），確保無關查詢不會產生虛假的高信心召回 |`)
  lines.push(`| **預期景點命中數** | 指定的 ⭐ 景點中，至少有 N 個出現在 Top-K 結果內，驗證語意相關性 |`)
  lines.push(`| **過濾器正確性** | 若有 \`filter\`，所有返回結果必須符合過濾條件（全為室內 / 全為指定地區）|`)
  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`## 各情境詳情`)
  lines.push(``)

  for (const r of results) {
    const s = r.scenario
    const badge = r.passed ? '✅ PASS' : '❌ FAIL'
    const filterStr = s.filter
      ? `\`${s.filter.type}${s.filter.value ? ':' + s.filter.value : ''}\``
      : '無'

    lines.push(`### ${s.id} ${s.name}  ${badge}`)
    lines.push(``)
    lines.push(`**測試目的**：${s.description}`)
    lines.push(``)
    lines.push(`| 欄位 | 值 |`)
    lines.push(`|------|----|`)
    lines.push(`| 查詢語句 | \`${s.query}\` |`)
    lines.push(`| Top-K | ${s.topK} |`)
    lines.push(`| 過濾條件 | ${filterStr} |`)
    lines.push(`| Query Tokens | ${r.token_usage.query_tokens} tokens |`)
    lines.push(`| API 呼叫 | embedContent × 1 |`)
    lines.push(`| 耗時 | ${r.elapsed_ms} ms |`)
    lines.push(``)

    // 驗收條件說明
    const passCriteriaParts: string[] = []
    if (s.criteria.top1_similarity_above !== undefined)
      passCriteriaParts.push(`Top-1 相似度 **≥ ${s.criteria.top1_similarity_above}%**`)
    if (s.criteria.top1_similarity_below !== undefined)
      passCriteriaParts.push(`Top-1 相似度 **< ${s.criteria.top1_similarity_below}%**（上限，非下限）`)
    if (s.criteria.expected_poi_ids && s.criteria.min_hits !== undefined)
      passCriteriaParts.push(`預期景點中**至少 ${s.criteria.min_hits} 個**出現在 Top-${s.topK} 內`)
    if (s.criteria.all_must_be_indoor === false)
      passCriteriaParts.push(`**所有結果必須是戶外景點**`)
    if (s.criteria.all_must_be_region)
      passCriteriaParts.push(`**所有結果必須在「${s.criteria.all_must_be_region}」地區**`)
    lines.push(`**驗收條件（PASS 定義）**：${passCriteriaParts.join('，且 ')}。`)
    lines.push(``)

    if (s.criteria.expected_poi_ids) {
      const resultIds = r.results.map(res => res.poi_id)
      const hitIds = s.criteria.expected_poi_ids.filter(id => resultIds.includes(id))
      lines.push(`**預期景點命中**：${hitIds.length} / ${s.criteria.expected_poi_ids.length} 個（需要 ≥ ${s.criteria.min_hits}）`)
      lines.push(``)
    }

    lines.push(`**搜尋結果**：`)
    lines.push(``)
    lines.push(`| 排名 | POI ID | 景點名稱 | 地區 | Level | 室內/外 | 天氣敏感度 | 相似度 |`)
    lines.push(`|------|--------|---------|------|-------|---------|-----------|--------|`)

    for (let i = 0; i < r.results.length; i++) {
      const res = r.results[i]
      const isExpected = s.criteria.expected_poi_ids?.includes(res.poi_id) ? ' ⭐' : ''
      lines.push(`| #${i + 1} | ${res.poi_id} | ${res.name}${isExpected} | ${res.region} | ${levelLabel(res.suggested_level)} | ${res.is_indoor ? '室內' : '戶外'} | ${res.weather_sensitivity} | **${(res.similarity * 100).toFixed(1)}%** |`)
    }

    lines.push(``)

    if (!r.passed && r.fail_reason) {
      lines.push(`> ⚠️ **失敗原因**：${r.fail_reason}`)
      lines.push(``)
    }

    lines.push(`---`)
    lines.push(``)
  }

  lines.push(`## Token 用量明細`)
  lines.push(``)
  lines.push(`| 情境 | 查詢語句 | Query Tokens | API 呼叫 |`)
  lines.push(`|------|---------|-------------|---------|`)
  for (const r of results) {
    lines.push(`| ${r.scenario.id} ${r.scenario.name} | \`${r.scenario.query}\` | ${r.token_usage.query_tokens} | embedContent × 1 |`)
  }
  lines.push(`| **合計** | — | **${totalQueryTokens}** | **${totalApiCalls} 次** |`)
  lines.push(``)
  lines.push(`### 成本說明`)
  lines.push(``)
  lines.push(`Gemini embedding API（\`gemini-embedding-001\`）目前無額外計費，在 Google AI Studio 免費額度內使用。`)
  lines.push(`Token 數為字元數估算值（中文 ÷ 1.5，其他 ÷ 4），非 API 精確回傳值。`)
  lines.push(``)
  lines.push(`若未來移至 Supabase pgvector，搜尋成本由資料庫 query 決定，與 LLM token 無關。`)
  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`*報告由 \`tests/rag.test.ts\` 自動生成*`)

  return lines.join('\n')
}

// ── 主程式 ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const t0 = Date.now()

  if (!GEMINI_API_KEY) {
    console.error('[fatal] GEMINI_API_KEY 未設定')
    process.exit(1)
  }

  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    console.error('[fatal] 向量索引不存在，請先執行：npx ts-node basic-rag.ts --build')
    process.exit(1)
  }

  const index: PoiEmbeddingEntry[] = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'))
  console.log(`[rag-test] 載入向量索引：${index.length} 筆 POI（${index[0]?.embedding.length ?? 0} 維）`)
  console.log(`[rag-test] 執行 ${SCENARIOS.length} 個測試情境...\n`)

  const testResults: TestResult[] = []

  for (const scenario of SCENARIOS) {
    process.stdout.write(`  ${scenario.id} ${scenario.name} ... `)
    try {
      const result = await runScenario(scenario, index)
      testResults.push(result)
      const badge = result.passed ? '✅ PASS' : '❌ FAIL'
      const topSim = result.results[0] ? `(top-1: ${(result.results[0].similarity * 100).toFixed(1)}%)` : ''
      console.log(`${badge}  ${topSim}  ${result.elapsed_ms}ms  ${result.token_usage.query_tokens}tok`)
      if (!result.passed) {
        console.log(`       ↳ ${result.fail_reason}`)
      }
    } catch (err) {
      console.log(`💥 ERROR: ${(err as Error).message}`)
      testResults.push({
        scenario,
        results: [],
        passed: false,
        fail_reason: `執行錯誤: ${(err as Error).message}`,
        token_usage: { query_tokens: 0, embed_api_calls: 0 },
        elapsed_ms: 0,
      })
    }

    // 短暫延遲避免 rate limit
    await new Promise(r => setTimeout(r, 200))
  }

  const totalMs = Date.now() - t0
  const passed = testResults.filter(r => r.passed).length

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`結果：${passed} / ${SCENARIOS.length} 通過  |  總耗時 ${totalMs}ms`)

  const totalTokens = testResults.reduce((s, r) => s + r.token_usage.query_tokens, 0)
  const totalCalls  = testResults.reduce((s, r) => s + r.token_usage.embed_api_calls, 0)
  console.log(`Token 用量：Query 共 ${totalTokens} tokens（估算）|  embedContent API 呼叫 ${totalCalls} 次`)

  const report = generateReport(testResults, totalMs)
  fs.writeFileSync(REPORT_FILE, report, 'utf-8')
  console.log(`報告儲存：${REPORT_FILE}`)
}

main().catch(err => {
  console.error('[fatal]', err.message)
  process.exit(1)
})
