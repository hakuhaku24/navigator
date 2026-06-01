/**
 * tests/supabase-rag.test.ts — Supabase pgvector 語意搜尋整合測試
 *
 * 同 rag.test.ts 的 8 個情境，搜尋層改為真實 Supabase match_poi_catalog RPC。
 * 驗證 ingest-embeddings.ts 寫入的向量可被正確查詢。
 *
 * Usage:  npx ts-node tests/supabase-rag.test.ts
 * Output: console + tests/supabase-rag-report.md
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

dotenv.config({ path: '../../.env.local' })
dotenv.config({ path: '../../.env' })

// ── 設定 ──────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY  = process.env.GEMINI_API_KEY!
const SUPABASE_URL    = process.env.SUPABASE_URL!
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!
const EMBEDDING_MODEL = 'gemini-embedding-001'
const REPORT_FILE     = path.join(__dirname, 'supabase-rag-report.md')
const MATCH_THRESHOLD = 0.4   // 低門檻確保 S08 邊界測試也能拿到結果

// ── 型別 ──────────────────────────────────────────────────────────────────────

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
  query_tokens: number
  embed_api_calls: number
  supabase_rpc_calls: number
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
  criteria: {
    expected_poi_ids?: string[]
    min_hits?: number
    all_must_be_indoor?: boolean
    all_must_be_region?: string
    top1_similarity_above?: number
    top1_similarity_below?: number
  }
  description: string
}

interface TestResult {
  scenario: TestScenario
  results: SearchResult[]
  passed: boolean
  fail_reason?: string
  token_usage: TokenUsage
  elapsed_ms: number
}

// ── 8 個測試情境（與 rag.test.ts 相同） ───────────────────────────────────────

const SCENARIOS: TestScenario[] = [
  {
    id: 'S01', name: '雨天室內親子',
    query: '下雨天帶小孩去室內的活動景點',
    topK: 5,
    criteria: { expected_poi_ids: ['NCA-001', 'NCA-003', 'NCA-013', 'NEI-003'], min_hits: 2, top1_similarity_above: 65 },
    description: '驗證天氣敏感情境下，系統能召回室內親子景點',
  },
  {
    id: 'S02', name: '網美拍照打卡',
    query: '浪漫唯美的拍照打卡網美景點',
    topK: 5,
    criteria: { expected_poi_ids: ['NCA-012', 'NEI-009', 'NCA-004', 'NEI-008'], min_hits: 2, top1_similarity_above: 65 },
    description: '驗證 vibe 搜尋能精準命中「視覺美感」類景點',
  },
  {
    id: 'S03', name: '歷史文化深度',
    query: '有歷史故事和人文深度的文化景點導覽',
    topK: 5,
    criteria: { expected_poi_ids: ['YMS-001', 'YMS-002', 'YMS-003', 'NEI-004'], min_hits: 2, top1_similarity_above: 65 },
    description: '驗證「歷史文化」語意能召回行館、博物館類景點',
  },
  {
    id: 'S04', name: 'L3 水位調節景點',
    query: '沿途順遊快速停留的小景點，不需要花太多時間',
    topK: 5,
    criteria: { expected_poi_ids: ['NCA-010', 'NCA-012', 'NCA-015', 'YMS-012', 'NEI-010'], min_hits: 2, top1_similarity_above: 60 },
    description: '驗證「短暫停留、不耗時」的語意能對應 L3 水位調節景點',
  },
  {
    id: 'S05', name: '地質奇岩（戶外過濾）',
    query: '壯觀的岩石地質景觀海蝕地形',
    topK: 5,
    filter: { type: 'outdoor' },
    criteria: { expected_poi_ids: ['NCA-002', 'NCA-007', 'NEI-010', 'NEI-013'], min_hits: 2, all_must_be_indoor: false, top1_similarity_above: 65 },
    description: '驗證地質類 query + 戶外過濾，確保 RPC filter_metadata 正確剔除室內景點',
  },
  {
    id: 'S06', name: '陽明山火山溫泉（地區過濾）',
    query: '火山地熱硫磺溫泉放鬆療癒',
    topK: 5,
    filter: { type: 'region', value: '陽明山' },
    criteria: { expected_poi_ids: ['YMS-005', 'YMS-011', 'YMS-010'], min_hits: 2, all_must_be_region: '陽明山', top1_similarity_above: 65 },
    description: '驗證地區過濾：所有結果必須在陽明山，且語意相關',
  },
  {
    id: 'S07', name: '精準景點名稱命中',
    query: '九份山城老街霧氣迷離茶樓燈籠',
    topK: 3,
    criteria: { expected_poi_ids: ['NEI-007', 'NEI-002'], min_hits: 2, top1_similarity_above: 70 },
    description: '驗證描述極具體的情境下，精準景點排名靠前（高相似度）',
  },
  {
    id: 'S08', name: '無關語意邊界測試',
    query: '各景點的停車費用和交通方式比較',
    topK: 5,
    criteria: { top1_similarity_below: 68 },
    description: '驗證語意邊界：與旅遊 vibe 無關的查詢，相似度應明顯較低',
  },
]

// ── Gemini Embedding ──────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length
  return Math.round(chineseChars / 1.5 + (text.length - chineseChars) / 4)
}

async function embedQuery(text: string): Promise<{ embedding: number[]; tokens: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_QUERY',
    }),
  })
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return { embedding: data.embedding.values as number[], tokens: estimateTokens(text) }
}

// ── filter → filter_metadata JSONB ───────────────────────────────────────────

function buildFilterMetadata(filter?: TestScenario['filter']): Record<string, unknown> {
  if (!filter) return {}
  switch (filter.type) {
    case 'indoor':  return { is_indoor: true }
    case 'outdoor': return { is_indoor: false }
    case 'region':  return { region: filter.value }
    // level 過濾 RPC 不支援陣列成員判斷，回傳全部後客戶端過濾
    case 'level':   return {}
  }
}

// ── Supabase 搜尋 ─────────────────────────────────────────────────────────────

async function searchSupabase(
  supabase: SupabaseClient,
  embedding: number[],
  topK: number,
  filter?: TestScenario['filter'],
): Promise<SearchResult[]> {
  const filterMetadata = buildFilterMetadata(filter)

  // 1. 向量相似度搜尋
  const { data: rpcData, error: rpcError } = await supabase.rpc('match_poi_catalog', {
    query_embedding: embedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: topK * 2,   // 多取一些，讓客戶端 level 過濾後仍夠用
    filter_metadata: filterMetadata,
  })
  if (rpcError) throw new Error(`match_poi_catalog RPC 失敗：${rpcError.message}`)
  if (!rpcData || rpcData.length === 0) return []

  // 2. 補抓 source_id（RPC 只回傳 uuid，需對應回 POI ID 如 NCA-001）
  const uuids = (rpcData as { id: string }[]).map(r => r.id)
  const { data: sourceData, error: sourceError } = await supabase
    .from('poi_catalog')
    .select('id, source_id')
    .in('id', uuids)
  if (sourceError) throw new Error(`source_id 查詢失敗：${sourceError.message}`)

  const sourceMap = new Map((sourceData ?? []).map((s: { id: string; source_id: string }) => [s.id, s.source_id]))

  // 3. 組合結果
  let results: SearchResult[] = (rpcData as {
    id: string; name: string; metadata: Record<string, unknown>; similarity: number
  }[]).map(r => ({
    poi_id:              sourceMap.get(r.id) ?? r.id,
    name:                r.name,
    region:              r.metadata.region as string,
    suggested_level:     r.metadata.level as number,
    is_indoor:           r.metadata.is_indoor as boolean,
    weather_sensitivity: r.metadata.weather_sensitivity as string,
    similarity:          r.similarity,
  }))

  // 客戶端 level 過濾（RPC filter_metadata 不支援陣列成員）
  if (filter?.type === 'level' && Array.isArray(filter.value)) {
    results = results.filter(r => (filter.value as number[]).includes(r.suggested_level))
  }

  return results.slice(0, topK)
}

// ── 驗收判定 ──────────────────────────────────────────────────────────────────

function evaluate(scenario: TestScenario, results: SearchResult[]): { passed: boolean; reason?: string } {
  const c = scenario.criteria

  if (c.top1_similarity_above !== undefined && results.length > 0) {
    const pct = results[0].similarity * 100
    if (pct < c.top1_similarity_above)
      return { passed: false, reason: `Top-1 相似度 ${pct.toFixed(1)}% < 門檻 ${c.top1_similarity_above}%` }
  }

  if (c.top1_similarity_below !== undefined && results.length > 0) {
    const pct = results[0].similarity * 100
    if (pct >= c.top1_similarity_below)
      return { passed: false, reason: `Top-1 相似度 ${pct.toFixed(1)}% ≥ 上限 ${c.top1_similarity_below}%（邊界測試應低於此值）` }
  }

  if (c.expected_poi_ids && c.min_hits !== undefined) {
    const resultIds = results.map(r => r.poi_id)
    const hits = c.expected_poi_ids.filter(id => resultIds.includes(id))
    if (hits.length < c.min_hits)
      return { passed: false, reason: `命中預期景點 ${hits.length}/${c.min_hits}（需要 ${c.min_hits}，命中：${hits.join(', ') || '無'}）` }
  }

  if (c.all_must_be_indoor === false) {
    const wrong = results.filter(r => r.is_indoor)
    if (wrong.length > 0)
      return { passed: false, reason: `過濾器失效：室內景點出現在戶外結果中：${wrong.map(r => r.name).join(', ')}` }
  }

  if (c.all_must_be_region) {
    const wrong = results.filter(r => r.region !== c.all_must_be_region)
    if (wrong.length > 0)
      return { passed: false, reason: `過濾器失效：${wrong.map(r => `${r.name}(${r.region})`).join(', ')} 不屬於 ${c.all_must_be_region}` }
  }

  return { passed: true }
}

// ── 報告生成 ──────────────────────────────────────────────────────────────────

function levelLabel(l: number): string {
  return ['L0 絕對錨點', 'L1 彈性錨點', 'L2 條件變動', 'L3 水位調節'][l] ?? `L${l}`
}

function generateReport(results: TestResult[], totalMs: number): string {
  const passed         = results.filter(r => r.passed).length
  const totalTokens    = results.reduce((s, r) => s + r.token_usage.query_tokens, 0)
  const totalEmbedCall = results.reduce((s, r) => s + r.token_usage.embed_api_calls, 0)
  const totalRpcCalls  = results.reduce((s, r) => s + r.token_usage.supabase_rpc_calls, 0)

  const lines: string[] = []
  lines.push(`# Supabase RAG 語意搜尋整合測試報告`)
  lines.push(``)
  lines.push(`**執行時間**：${new Date().toISOString().replace('T', ' ').slice(0, 19)}`)
  lines.push(`**使用模型**：${EMBEDDING_MODEL}（3072 維）`)
  lines.push(`**搜尋層**：Supabase \`match_poi_catalog\` RPC（match_threshold=${MATCH_THRESHOLD}）`)
  lines.push(`**測試情境**：${results.length} 個`)
  lines.push(``)
  lines.push(`## 總覽`)
  lines.push(``)
  lines.push(`| 項目 | 數值 |`)
  lines.push(`|------|------|`)
  lines.push(`| 通過 / 總計 | ${passed} / ${results.length} |`)
  lines.push(`| 失敗情境 | ${results.length - passed} 個 |`)
  lines.push(`| 總耗時 | ${totalMs} ms |`)
  lines.push(`| Query 總 Token 數 | ${totalTokens} tokens |`)
  lines.push(`| Gemini API 呼叫次數 | ${totalEmbedCall} 次（embedContent）|`)
  lines.push(`| Supabase RPC 呼叫次數 | ${totalRpcCalls} 次（match_poi_catalog）|`)
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
    lines.push(`| 耗時 | ${r.elapsed_ms} ms |`)
    lines.push(``)

    const parts: string[] = []
    if (s.criteria.top1_similarity_above !== undefined)
      parts.push(`Top-1 相似度 **≥ ${s.criteria.top1_similarity_above}%**`)
    if (s.criteria.top1_similarity_below !== undefined)
      parts.push(`Top-1 相似度 **< ${s.criteria.top1_similarity_below}%**（上限）`)
    if (s.criteria.expected_poi_ids && s.criteria.min_hits !== undefined)
      parts.push(`預期景點中**至少 ${s.criteria.min_hits} 個**出現在 Top-${s.topK} 內`)
    if (s.criteria.all_must_be_indoor === false)
      parts.push(`**所有結果必須是戶外景點**`)
    if (s.criteria.all_must_be_region)
      parts.push(`**所有結果必須在「${s.criteria.all_must_be_region}」地區**`)
    lines.push(`**驗收條件**：${parts.join('，且 ')}。`)
    lines.push(``)

    if (s.criteria.expected_poi_ids) {
      const hits = s.criteria.expected_poi_ids.filter(id => r.results.map(res => res.poi_id).includes(id))
      lines.push(`**預期景點命中**：${hits.length} / ${s.criteria.expected_poi_ids.length} 個（需要 ≥ ${s.criteria.min_hits}）`)
      lines.push(``)
    }

    lines.push(`**搜尋結果**：`)
    lines.push(``)
    lines.push(`| 排名 | POI ID | 景點名稱 | 地區 | Level | 室內/外 | 天氣敏感度 | 相似度 |`)
    lines.push(`|------|--------|---------|------|-------|---------|-----------|--------|`)
    for (let i = 0; i < r.results.length; i++) {
      const res = r.results[i]
      const star = s.criteria.expected_poi_ids?.includes(res.poi_id) ? ' ⭐' : ''
      lines.push(`| #${i + 1} | ${res.poi_id} | ${res.name}${star} | ${res.region} | ${levelLabel(res.suggested_level)} | ${res.is_indoor ? '室內' : '戶外'} | ${res.weather_sensitivity} | **${(res.similarity * 100).toFixed(1)}%** |`)
    }
    lines.push(``)

    if (!r.passed && r.fail_reason) {
      lines.push(`> ⚠️ **失敗原因**：${r.fail_reason}`)
      lines.push(``)
    }
    lines.push(`---`)
    lines.push(``)
  }

  lines.push(`*報告由 \`tests/supabase-rag.test.ts\` 自動生成*`)
  return lines.join('\n')
}

// ── 主程式 ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!GEMINI_API_KEY)  { console.error('[fatal] GEMINI_API_KEY 未設定');  process.exit(1) }
  if (!SUPABASE_URL)    { console.error('[fatal] SUPABASE_URL 未設定');    process.exit(1) }
  if (!SUPABASE_KEY)    { console.error('[fatal] SUPABASE_SERVICE_ROLE_KEY 未設定'); process.exit(1) }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // 前置確認：poi_catalog 有資料
  const { count, error: countError } = await supabase
    .from('poi_catalog')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null)
  if (countError) { console.error('[fatal] 無法連接 Supabase：', countError.message); process.exit(1) }
  if (!count || count === 0) {
    console.error('[fatal] poi_catalog 中無向量資料，請先執行：npm run rag:ingest')
    process.exit(1)
  }
  console.log(`[supabase-rag-test] Supabase 連線正常，poi_catalog 已有 ${count} 筆向量`)
  console.log(`[supabase-rag-test] 執行 ${SCENARIOS.length} 個測試情境...\n`)

  const t0 = Date.now()
  const testResults: TestResult[] = []

  for (const scenario of SCENARIOS) {
    process.stdout.write(`  ${scenario.id} ${scenario.name} ... `)
    const ts = Date.now()
    try {
      const { embedding, tokens } = await embedQuery(scenario.query)
      const results = await searchSupabase(supabase, embedding, scenario.topK, scenario.filter)
      const { passed, reason } = evaluate(scenario, results)

      const result: TestResult = {
        scenario,
        results,
        passed,
        fail_reason: reason,
        token_usage: { query_tokens: tokens, embed_api_calls: 1, supabase_rpc_calls: 1 },
        elapsed_ms: Date.now() - ts,
      }
      testResults.push(result)

      const badge  = passed ? '✅ PASS' : '❌ FAIL'
      const topSim = results[0] ? `(top-1: ${(results[0].similarity * 100).toFixed(1)}%)` : '(no results)'
      console.log(`${badge}  ${topSim}  ${result.elapsed_ms}ms`)
      if (!passed) console.log(`       ↳ ${reason}`)
    } catch (err) {
      console.log(`💥 ERROR: ${(err as Error).message}`)
      testResults.push({
        scenario,
        results: [],
        passed: false,
        fail_reason: `執行錯誤: ${(err as Error).message}`,
        token_usage: { query_tokens: 0, embed_api_calls: 0, supabase_rpc_calls: 0 },
        elapsed_ms: Date.now() - ts,
      })
    }

    await new Promise(r => setTimeout(r, 200))
  }

  const totalMs = Date.now() - t0
  const passed  = testResults.filter(r => r.passed).length
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`結果：${passed} / ${SCENARIOS.length} 通過  |  總耗時 ${totalMs}ms`)

  const report = generateReport(testResults, totalMs)
  fs.writeFileSync(REPORT_FILE, report, 'utf-8')
  console.log(`報告儲存：${REPORT_FILE}`)
}

main().catch(err => { console.error('[fatal]', err.message); process.exit(1) })
