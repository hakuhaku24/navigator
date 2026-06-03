/**
 * basic-rag.ts — Navigator 基礎 RAG 原型
 *
 * 流程：
 *   poi_verified.json（知識庫原料）
 *     → Gemini text-embedding-004（向量化）
 *     → results/poi-embeddings.json（本地向量索引）
 *     → cosine similarity（相似度搜尋）
 *     → top-K POI（可注入 Architect Agent prompt）
 *
 * 使用方式：
 *   npx ts-node basic-rag.ts --build                          # 建向量索引（一次性）
 *   npx ts-node basic-rag.ts --query "想找有文藝氣息的老街"    # 語意搜尋
 *   npx ts-node basic-rag.ts --query "下雨天室內景點" --top 3  # 指定返回數量
 *   npx ts-node basic-rag.ts --query "親子" --filter indoor   # 只搜室內景點
 *   npx ts-node basic-rag.ts --query "陽明山" --filter region:陽明山
 *
 * pgvector 遷移路徑（本地索引驗證正確後）：
 *   1. 在 Supabase 執行：CREATE EXTENSION IF NOT EXISTS vector;
 *   2. CREATE TABLE poi_embeddings (poi_id text, embedding vector(768), ...);
 *   3. 把 buildIndex() 的 save 步驟改成 supabase.from('poi_embeddings').upsert(...)
 *   4. 把 search() 的 cosine 計算改成 <=> 運算子（Supabase pgvector 語法）
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// 嘗試 .env.local 再退回 .env（統一跟 batch-verify.ts 等腳本一致）
dotenv.config({ path: '../../.env.local' })
dotenv.config({ path: '../../.env' })

// ── 設定 ──────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY   = process.env.GEMINI_API_KEY
const EMBEDDING_MODEL  = 'gemini-embedding-001'  // 768 維（與主管線 src/ingestion.ts 對齊），支援中文
const EMBEDDING_DIM    = 768                      // 統一維度：可建 HNSW index，且避免與 query 端維度不符
const EMBEDDINGS_FILE  = path.join(__dirname, 'results/poi-embeddings.json')
const VERIFIED_FILE    = path.join(__dirname, 'results/poi_verified.json')
const DEFAULT_TOP_K    = 5

// ── 型別 ──────────────────────────────────────────────────────────────────────

interface PoiEmbeddingEntry {
  poi_id: string
  name: string
  region: string
  suggested_level: number
  is_indoor: boolean
  weather_sensitivity: string
  embed_text: string   // 儲存原始文字以便除錯
  embedding: number[]  // 768 維向量
}

interface VerifiedPoi {
  poi_id: string
  name: string
  region: string
  result: {
    poi_input: { user_description: string }
    verification_result: {
      exists: boolean
      facts: {
        is_indoor: boolean
        weather_sensitivity: string
      }
    }
    enrichment_result: { suggested_level: number }
    tourist_friendly_description?: string
  }
}

interface SearchResult extends Omit<PoiEmbeddingEntry, 'embedding'> {
  similarity: number
}

type FilterKind =
  | { type: 'indoor' }
  | { type: 'outdoor' }
  | { type: 'region'; value: string }
  | { type: 'level'; values: number[] }

// ── Gemini Embedding API ──────────────────────────────────────────────────────

async function embed(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[]> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 未設定（請在 .env.local 加入）')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIM,   // 對齊主管線 768 維（不設會回滿 3072）
      taskType,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Embedding API ${res.status}: ${body}`)
  }
  const data = await res.json()
  return data.embedding.values as number[]
}

// ── 數學工具 ──────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ── 建立向量索引 ──────────────────────────────────────────────────────────────

function buildEmbedText(poi: VerifiedPoi): string {
  const desc = poi.result.poi_input.user_description ?? ''
  const touristDesc = poi.result.tourist_friendly_description ?? ''
  // 組合：景點名稱 + 地區 + semantic_description（來自 pois.ts）+ LLM 生成的旅客描述
  // 兩段描述語意互補：前者是人工撰寫的 vibe，後者是 LLM 整合多來源後的細節
  return `景點名稱：${poi.name} 地區：${poi.region}\n${desc}\n${touristDesc}`.trim()
}

async function buildIndex(): Promise<void> {
  if (!fs.existsSync(VERIFIED_FILE)) {
    console.error(`找不到 ${VERIFIED_FILE}，請先執行 npx ts-node batch-verify.ts`)
    process.exit(1)
  }

  const rawPois: VerifiedPoi[] = JSON.parse(fs.readFileSync(VERIFIED_FILE, 'utf-8'))
  const validPois = rawPois.filter(p => p.result.verification_result.exists)

  console.log(`[build] 載入 ${validPois.length} 筆已驗證 POI，開始生成 embedding...`)
  console.log(`[build] 使用模型：${EMBEDDING_MODEL}（${EMBEDDING_DIM} 維）`)
  console.log(`[build] 預估成本：幾乎為零（Gemini embedding 免費額度極大）\n`)

  const entries: PoiEmbeddingEntry[] = []
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < validPois.length; i++) {
    const poi = validPois[i]
    const embedText = buildEmbedText(poi)
    process.stdout.write(`  [${i + 1}/${validPois.length}] ${poi.name} ... `)

    try {
      // RETRIEVAL_DOCUMENT：為知識庫建索引時使用，與 RETRIEVAL_QUERY 配對使用
      const embedding = await embed(embedText, 'RETRIEVAL_DOCUMENT')
      // 維度防呆：換模型 / 漏設 outputDimensionality 時立刻擋下，避免混入不同維度向量
      if (embedding.length !== EMBEDDING_DIM) {
        throw new Error(`維度異常：收到 ${embedding.length} 維，預期 ${EMBEDDING_DIM} 維`)
      }
      entries.push({
        poi_id: poi.poi_id,
        name: poi.name,
        region: poi.region,
        suggested_level: poi.result.enrichment_result.suggested_level,
        is_indoor: poi.result.verification_result.facts.is_indoor,
        weather_sensitivity: poi.result.verification_result.facts.weather_sensitivity,
        embed_text: embedText,
        embedding,
      })
      console.log(`✓ (${embedding.length}維)`)
      successCount++
    } catch (err) {
      console.log(`✗ 失敗: ${(err as Error).message}`)
      failCount++
    }

    // Gemini embedding API 無嚴格速率限制，但加短暫延遲避免 429
    if (i < validPois.length - 1) await new Promise(r => setTimeout(r, 100))
  }

  fs.writeFileSync(EMBEDDINGS_FILE, JSON.stringify(entries, null, 2), 'utf-8')

  console.log(`\n[build] 完成`)
  console.log(`  成功：${successCount} 筆`)
  console.log(`  失敗：${failCount} 筆`)
  console.log(`  索引儲存至：${EMBEDDINGS_FILE}`)

  if (failCount > 0) {
    console.warn(`\n[warn] 有 ${failCount} 筆失敗，重新執行 --build 會覆蓋整個索引`)
  }
}

// ── 語意搜尋 ──────────────────────────────────────────────────────────────────

function parseFilter(raw: string): FilterKind | null {
  if (raw === 'indoor')  return { type: 'indoor' }
  if (raw === 'outdoor') return { type: 'outdoor' }
  if (raw.startsWith('region:')) return { type: 'region', value: raw.slice(7) }
  if (raw.startsWith('level:')) {
    const values = raw.slice(6).split(',').map(Number).filter(n => !isNaN(n))
    return values.length ? { type: 'level', values } : null
  }
  console.warn(`[warn] 不認識的 filter：${raw}，已忽略`)
  return null
}

function applyFilter(entry: PoiEmbeddingEntry, filter: FilterKind): boolean {
  switch (filter.type) {
    case 'indoor':  return entry.is_indoor === true
    case 'outdoor': return entry.is_indoor === false
    case 'region':  return entry.region === filter.value
    case 'level':   return filter.values.includes(entry.suggested_level)
  }
}

async function search(query: string, topK: number, filterArg?: string): Promise<void> {
  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    console.error('找不到向量索引，請先執行：npx ts-node basic-rag.ts --build')
    process.exit(1)
  }

  const index: PoiEmbeddingEntry[] = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'))

  // 解析過濾條件
  const filter = filterArg ? parseFilter(filterArg) : null
  const pool = filter ? index.filter(e => applyFilter(e, filter)) : index

  if (pool.length === 0) {
    console.log(`[search] 過濾後無符合景點（filter: ${filterArg}）`)
    return
  }

  console.log(`[search] 查詢：「${query}」`)
  if (filter) console.log(`[search] 過濾條件：${filterArg}（符合 ${pool.length}/${index.length} 筆）`)
  process.stdout.write('[search] 生成 query embedding ... ')

  // RETRIEVAL_QUERY：查詢時使用，與 RETRIEVAL_DOCUMENT 配對使用
  const queryEmbedding = await embed(query, 'RETRIEVAL_QUERY')
  console.log('✓\n')

  // 計算與所有 POI 的 cosine similarity，取 top-K
  const results: SearchResult[] = pool
    .map(entry => ({
      poi_id: entry.poi_id,
      name: entry.name,
      region: entry.region,
      suggested_level: entry.suggested_level,
      is_indoor: entry.is_indoor,
      weather_sensitivity: entry.weather_sensitivity,
      embed_text: entry.embed_text,
      similarity: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)

  // 顯示結果
  console.log(`Top ${topK} 語意相似景點\n${'─'.repeat(60)}`)
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const levelLabel = ['L0 絕對錨點', 'L1 彈性錨點', 'L2 條件變動', 'L3 水位調節'][r.suggested_level] ?? `L${r.suggested_level}`
    const indoorLabel = r.is_indoor ? '室內' : '戶外'
    const weatherLabel = { low: '低', medium: '中', high: '高', extreme: '極高' }[r.weather_sensitivity] ?? r.weather_sensitivity

    console.log(`\n#${i + 1}  ${r.name}  [${r.poi_id}]`)
    console.log(`    相似度：${(r.similarity * 100).toFixed(1)}%`)
    console.log(`    地區：${r.region}  |  ${levelLabel}  |  ${indoorLabel}  |  天氣敏感：${weatherLabel}`)

    // 顯示 embed_text 的前 100 字作為預覽
    const preview = r.embed_text.split('\n').slice(1).join(' ').slice(0, 100)
    console.log(`    描述：${preview}...`)
  }

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`[info] 以上結果可直接注入 Architect Agent prompt 作為候選 POI 池`)
  console.log(`[info] pgvector 遷移後，此搜尋可改用 SQL：`)
  console.log(`       SELECT poi_id, name, 1 - (embedding <=> query_vec) AS similarity`)
  console.log(`       FROM poi_embeddings ORDER BY embedding <=> query_vec LIMIT ${topK};`)
}

// ── 顯示索引摘要 ──────────────────────────────────────────────────────────────

function showIndexInfo(): void {
  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    console.log('向量索引尚未建立，請執行：npx ts-node basic-rag.ts --build')
    return
  }

  const index: PoiEmbeddingEntry[] = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'))
  const regions = [...new Set(index.map(e => e.region))]
  const levels = [0, 1, 2, 3].map(l => ({ level: l, count: index.filter(e => e.suggested_level === l).length }))
  const indoorCount = index.filter(e => e.is_indoor).length

  console.log(`\n向量索引摘要`)
  console.log(`  總筆數：${index.length}`)
  console.log(`  向量維度：${index[0]?.embedding.length ?? 'N/A'}`)
  console.log(`  地區分布：${regions.join('、')}`)
  console.log(`  Level 分布：${levels.map(l => `L${l.level}×${l.count}`).join(' | ')}`)
  console.log(`  室內景點：${indoorCount} 筆  |  戶外景點：${index.length - indoorCount} 筆`)
  console.log(`  索引路徑：${EMBEDDINGS_FILE}`)
}

// ── CLI 入口 ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--build')) {
    await buildIndex()
    return
  }

  if (args.includes('--info')) {
    showIndexInfo()
    return
  }

  const queryIdx = args.indexOf('--query')
  if (queryIdx !== -1 && args[queryIdx + 1]) {
    const query = args[queryIdx + 1]

    const topIdx = args.indexOf('--top')
    const topK = topIdx !== -1 && args[topIdx + 1] ? parseInt(args[topIdx + 1], 10) : DEFAULT_TOP_K

    const filterIdx = args.indexOf('--filter')
    const filterArg = filterIdx !== -1 && args[filterIdx + 1] ? args[filterIdx + 1] : undefined

    await search(query, topK, filterArg)
    return
  }

  console.log(`
Navigator 基礎 RAG — 使用方式

  npx ts-node basic-rag.ts --build
    建立向量索引（需要 GEMINI_API_KEY，約 45 次 embedding API 呼叫）

  npx ts-node basic-rag.ts --info
    顯示索引摘要（不需要 API key）

  npx ts-node basic-rag.ts --query "查詢文字"
    語意搜尋，返回 top-5 相似景點

  npx ts-node basic-rag.ts --query "查詢文字" --top 3
    指定返回 top-3

  npx ts-node basic-rag.ts --query "查詢文字" --filter indoor
    只搜室內景點

  npx ts-node basic-rag.ts --query "查詢文字" --filter outdoor
    只搜戶外景點

  npx ts-node basic-rag.ts --query "查詢文字" --filter region:陽明山
    只搜特定地區（陽明山 | 北海岸 | 東北角）

  npx ts-node basic-rag.ts --query "查詢文字" --filter level:2,3
    只搜特定 Level

Filter 可與 --top 組合使用。
`)
}

main().catch(err => {
  console.error('[fatal]', err.message)
  process.exit(1)
})
