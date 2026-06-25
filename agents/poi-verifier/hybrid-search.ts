/**
 * hybrid-search.ts — 混合式景點搜尋
 *
 * 這支程式解決一個問題：
 *   單純用「語意向量搜尋」找「天元宮」會找不準，
 *   單純用「關鍵字搜尋」找「有文藝氣息的老街」又太死板。
 *   → 把兩種方式的結果合在一起，取長補短。
 *
 * 搜尋流程：
 *   廣撒網  → 關鍵字搜尋（字元二元組比對，適合中文景點名稱）
 *   精確命中 → 語意向量搜尋（Gemini 768 維向量，抓住「想去什麼感覺的地方」）
 *   融合    → RRF 排名融合（把兩份排名清單合成一份，分數較高的排前面）
 *
 * 為什麼用 RRF 而不是直接把兩個分數相加？
 *   兩種搜尋的分數範圍不一樣（關鍵字分是 0–1 二元組重疊率，
 *   向量分也是 0–1 但分佈完全不同），直接相加會讓其中一種蓋過另一種。
 *   RRF 只看「排名第幾名」不看「幾分」，所以不會有這個問題。
 *   k=60 的意思是：名次差距越大，分數差距越小（避免第一名太強勢）。
 *
 * 執行方式：
 *   npx ts-node hybrid-search.ts --query "下雨天室內景點"
 *   npx ts-node hybrid-search.ts --query "天元宮" --top 5
 *   npx ts-node hybrid-search.ts --query "親子遊" --filter indoor --alpha 0.7
 *   npx ts-node hybrid-search.ts --query "陽明山古道" --filter region:陽明山
 *   npx ts-node hybrid-search.ts --info
 *
 * 參數說明：
 *   --alpha <0.0–1.0>  向量搜尋佔幾成比重（預設 0.5 = 各半）
 *                      0.0 = 只用關鍵字  |  1.0 = 只用語意向量
 *   --top <數字>        最多回傳幾筆結果（預設 5）
 *   --filter           篩選條件：indoor（室內）| outdoor（戶外）| region:陽明山 | level:2,3
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '../../.env.local' })
dotenv.config({ path: '../../.env' })

// ── 設定常數 ────────────────────────────────────────────────────────────────

const GEMINI_API_KEY   = process.env.GEMINI_API_KEY
const EMBEDDING_MODEL  = 'gemini-embedding-001'
const EMBEDDING_DIM    = 768
const EMBEDDINGS_FILE  = path.join(__dirname, 'results/poi-embeddings.json')
const RRF_K            = 60      // RRF 平滑參數，數字越大、第一名的優勢越小
const DEFAULT_TOP_K    = 5
const DEFAULT_ALPHA    = 0.5     // 預設語意向量與關鍵字各佔一半

// ── 型別定義 ────────────────────────────────────────────────────────────────

// 向量索引裡每一筆景點的資料結構（從 basic-rag.ts --build 產出）
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

// 混合搜尋回傳的結果結構，在 PoiEmbeddingEntry 基礎上多了三個分數欄位
export interface HybridSearchResult {
  poi_id: string
  name: string
  region: string
  suggested_level: number
  is_indoor: boolean
  weather_sensitivity: string
  embed_text: string
  vector_score: number    // 語意向量相似度（0–1，越接近 1 越像）
  keyword_score: number   // 關鍵字二元組重疊率（0–1）
  hybrid_score: number    // RRF 融合後的最終分數（無單位，越大越靠前）
  vector_rank: number | null
  keyword_rank: number | null
}

// 呼叫 hybridSearch() 時可以傳入的選項
export interface HybridSearchOptions {
  topK?: number
  alpha?: number      // 語意向量比重（0.0–1.0）
  filter?: string     // 篩選條件，語法與 basic-rag.ts 相同
}

// 篩選條件的型別（union type，只會是這四種之一）
type FilterKind =
  | { type: 'indoor' }
  | { type: 'outdoor' }
  | { type: 'region'; value: string }
  | { type: 'level'; values: number[] }

// ── 呼叫 Gemini Embedding API ───────────────────────────────────────────────
// 把一段文字轉換成 768 個數字的向量。
// taskType 有兩種：
//   RETRIEVAL_DOCUMENT = 幫「景點描述」建索引用
//   RETRIEVAL_QUERY    = 幫「使用者查詢」轉向量用
// 兩種分開設計是為了讓查詢和文件的向量空間對齊，搜尋更準確。

async function embed(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[]> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 未設定（請在 .env.local 加入）')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIM,
      taskType,
    }),
  })
  if (!res.ok) throw new Error(`Embedding API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.embedding.values as number[]
}

// ── 計算餘弦相似度 ──────────────────────────────────────────────────────────
// 餘弦相似度（Cosine Similarity）：
//   把兩段文字各自轉成向量之後，計算兩個向量的夾角有多小。
//   夾角越小（cos 值越接近 1）→ 意思越接近。
//   完全一樣的文字 = 1.0，完全無關的文字 ≈ 0。

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ── 關鍵字搜尋：字元二元組（Bigram）比對 ──────────────────────────────────
//
// 二元組的概念：把文字每兩個相鄰的字元切成一組。
// 例如：「陽明山」→「陽明」「明山」
//       「下雨天」→「下雨」「雨天」
//
// 這樣做的好處是不需要分詞工具，天然就能抓住中文詞彙。
// 比對時計算查詢和景點描述有多少二元組重疊，重疊越多分數越高。

// 把一段文字切成二元組，並記錄每個二元組出現幾次
function toBigrams(text: string): Map<string, number> {
  // 先去掉空白和標點，再全部轉小寫，避免因符號不同而錯誤不匹配
  const cleaned = text.replace(/[\s\n\r\t。、，！？：；「」【】《》\-_]/g, '').toLowerCase()
  const freq = new Map<string, number>()
  for (let i = 0; i < cleaned.length - 1; i++) {
    const bg = cleaned.slice(i, i + 2)
    freq.set(bg, (freq.get(bg) ?? 0) + 1)
  }
  return freq
}

// 計算查詢字串和文件的二元組重疊比例（0–1）
function bigramOverlap(query: string, doc: string): number {
  const qBigrams = toBigrams(query)
  if (qBigrams.size === 0) return 0
  const dBigrams = toBigrams(doc)
  let matched = 0
  qBigrams.forEach((qFreq, bg) => {
    const dFreq = dBigrams.get(bg) ?? 0
    if (dFreq > 0) matched += Math.min(qFreq, dFreq) / qFreq
  })
  return matched / qBigrams.size
}

// 計算某個景點的關鍵字分數
// 優先檢查「景點名稱是否包含查詢字串」，包含的話直接給滿分 1.0
// 沒有完全包含則算二元組重疊，景點名稱的比對權重是全文的兩倍（名稱更重要）
function computeKeywordScore(query: string, entry: PoiEmbeddingEntry): number {
  const q = query.replace(/\s/g, '').toLowerCase()
  const n = entry.name.replace(/\s/g, '').toLowerCase()

  // 名稱完全包含查詢詞（或查詢詞完全包含名稱）→ 直接給滿分
  if (n.includes(q) || q.includes(n)) return 1.0

  // 名稱二元組重疊 × 2 + 全文二元組重疊，再除以 3 取加權平均
  const nameBigram = bigramOverlap(query, entry.name)
  const textBigram = bigramOverlap(query, entry.embed_text)
  return Math.min((nameBigram * 2 + textBigram) / 3, 1.0)
}

// ── 篩選條件處理 ────────────────────────────────────────────────────────────

// 把指令列傳進來的字串（如 "indoor", "region:陽明山"）解析成結構化物件
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

// 判斷某筆景點是否符合篩選條件
function applyFilter(entry: PoiEmbeddingEntry, filter: FilterKind): boolean {
  switch (filter.type) {
    case 'indoor':  return entry.is_indoor === true
    case 'outdoor': return entry.is_indoor === false
    case 'region':  return entry.region === filter.value
    case 'level':   return filter.values.includes(entry.suggested_level)
  }
}

// ── RRF 排名融合 ────────────────────────────────────────────────────────────
// RRF（Reciprocal Rank Fusion，倒數排名融合）計算公式：
//   分數 = alpha × 1/(k + 向量排名) + (1-alpha) × 1/(k + 關鍵字排名)
//
// 如果某筆景點在某個排名清單中完全沒有出現（例如關鍵字完全沒有匹配），
// 就把它的排名設為「最後一名 + 1」（penaltyRank），讓它得到接近零的貢獻。

function rrfScore(vectorRank: number | null, keywordRank: number | null, alpha: number, penaltyRank: number): number {
  const v = vectorRank  != null ? 1 / (RRF_K + vectorRank)  : 1 / (RRF_K + penaltyRank)
  const k = keywordRank != null ? 1 / (RRF_K + keywordRank) : 1 / (RRF_K + penaltyRank)
  return alpha * v + (1 - alpha) * k
}

// ── 混合搜尋主函式（可被其他程式 import 使用）─────────────────────────────

export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {},
): Promise<HybridSearchResult[]> {
  const topK  = options.topK  ?? DEFAULT_TOP_K
  const alpha = Math.max(0, Math.min(1, options.alpha ?? DEFAULT_ALPHA))

  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    throw new Error('找不到向量索引，請先執行：npx ts-node basic-rag.ts --build')
  }

  // 從本地 JSON 檔案載入所有景點的向量索引
  const index: PoiEmbeddingEntry[] = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'))
  const filter = options.filter ? parseFilter(options.filter) : null
  // 先用硬性條件過濾（例如只要室內景點），縮小後續計算的範圍
  const pool   = filter ? index.filter(e => applyFilter(e, filter)) : index

  if (pool.length === 0) return []

  // 步驟 1：語意向量搜尋
  // 把使用者查詢轉成向量，和每個景點的向量計算相似度，按相似度排名
  const queryVec = await embed(query, 'RETRIEVAL_QUERY')
  const withVectorScore = pool
    .map(e => ({ ...e, vector_score: cosineSimilarity(queryVec, e.embedding) }))
    .sort((a, b) => b.vector_score - a.vector_score)
  const vectorRankMap = new Map(withVectorScore.map((e, i) => [e.poi_id, i + 1]))

  // 步驟 2：關鍵字搜尋
  // 計算每個景點的二元組比對分數，按分數排名
  const withKeywordScore = pool
    .map(e => ({ ...e, keyword_score: computeKeywordScore(query, e) }))
    .sort((a, b) => b.keyword_score - a.keyword_score)
  const keywordRankMap = new Map(withKeywordScore.map((e, i) => [e.poi_id, i + 1]))

  // 步驟 3：建立「景點ID → 分數」的快速查找表，方便後面融合時取用
  const vectorScoreMap  = new Map(withVectorScore.map(e => [e.poi_id, e.vector_score]))
  const keywordScoreMap = new Map(withKeywordScore.map(e => [e.poi_id, e.keyword_score]))

  // 如果某景點在某一路搜尋中完全未出現，給它「最末排名 + 1」作為懲罰
  const penaltyRank = pool.length + 1

  // 步驟 4：RRF 融合，對所有景點計算混合分數並重新排序
  const results: HybridSearchResult[] = pool.map(e => {
    const vRank = vectorRankMap.get(e.poi_id) ?? null
    const kRank = keywordRankMap.get(e.poi_id) ?? null
    return {
      poi_id: e.poi_id,
      name: e.name,
      region: e.region,
      suggested_level: e.suggested_level,
      is_indoor: e.is_indoor,
      weather_sensitivity: e.weather_sensitivity,
      embed_text: e.embed_text,
      vector_score:  Math.round((vectorScoreMap.get(e.poi_id) ?? 0) * 10000) / 10000,
      keyword_score: Math.round((keywordScoreMap.get(e.poi_id) ?? 0) * 10000) / 10000,
      hybrid_score:  Math.round(rrfScore(vRank, kRank, alpha, penaltyRank) * 100000) / 100000,
      vector_rank:   vRank,
      keyword_rank:  kRank,
    }
  })

  return results
    .sort((a, b) => b.hybrid_score - a.hybrid_score)
    .slice(0, topK)
}

// ── 終端機輸出格式化 ────────────────────────────────────────────────────────

function printResults(results: HybridSearchResult[], query: string, alpha: number): void {
  const levelLabel = ['L0 絕對錨點', 'L1 彈性錨點', 'L2 條件變動', 'L3 水位調節']
  const weatherLabel: Record<string, string> = { low: '低', medium: '中', high: '高', extreme: '極高' }

  console.log(`\nHybrid Search 結果`)
  console.log(`  查詢：「${query}」`)
  console.log(`  Alpha：${alpha} (${alpha === 0 ? '純關鍵字' : alpha === 1 ? '純語意' : `語意 ${Math.round(alpha * 100)}% / 關鍵字 ${Math.round((1 - alpha) * 100)}%`})`)
  console.log(`${'─'.repeat(70)}`)

  results.forEach((r, i) => {
    const level   = levelLabel[r.suggested_level] ?? `L${r.suggested_level}`
    const indoor  = r.is_indoor ? '室內' : '戶外'
    const weather = weatherLabel[r.weather_sensitivity] ?? r.weather_sensitivity

    console.log(`\n#${i + 1}  ${r.name}  [${r.poi_id}]`)
    console.log(`    混合分數：${r.hybrid_score.toFixed(5)}  (V排名：#${r.vector_rank ?? '—'}  K排名：#${r.keyword_rank ?? '—'})`)
    console.log(`    向量相似：${(r.vector_score * 100).toFixed(1)}%  關鍵字重疊：${(r.keyword_score * 100).toFixed(1)}%`)
    console.log(`    地區：${r.region}  |  ${level}  |  ${indoor}  |  天氣敏感：${weather}`)

    const preview = r.embed_text.split('\n').slice(1).join(' ').slice(0, 100)
    console.log(`    描述：${preview}...`)
  })

  console.log(`\n${'─'.repeat(70)}`)
  console.log(`[info] 向量搜尋覆蓋語意查詢（如「有文藝氣息的老街」）`)
  console.log(`[info] 關鍵字搜尋覆蓋精確名稱（如「天元宮」「小油坑」）`)
  console.log(`[info] RRF k=${RRF_K} 融合兩者，--alpha 調整偏好`)
}

// ── 指令列入口 ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--info')) {
    if (!fs.existsSync(EMBEDDINGS_FILE)) {
      console.log('向量索引尚未建立，請執行：npx ts-node basic-rag.ts --build')
      return
    }
    const index: PoiEmbeddingEntry[] = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'))
    const regions = [...new Set(index.map(e => e.region))]
    const indoorCount = index.filter(e => e.is_indoor).length
    console.log(`\n向量索引摘要`)
    console.log(`  總筆數：${index.length}`)
    console.log(`  地區：${regions.join('、')}`)
    console.log(`  室內：${indoorCount}  戶外：${index.length - indoorCount}`)
    return
  }

  const queryIdx = args.indexOf('--query')
  if (queryIdx === -1 || !args[queryIdx + 1]) {
    console.log(`
Navigator Hybrid Search — 使用方式

  npx ts-node hybrid-search.ts --query "查詢文字"
  npx ts-node hybrid-search.ts --query "查詢文字" --top 3
  npx ts-node hybrid-search.ts --query "查詢文字" --filter indoor
  npx ts-node hybrid-search.ts --query "查詢文字" --filter region:陽明山
  npx ts-node hybrid-search.ts --query "查詢文字" --filter level:2,3
  npx ts-node hybrid-search.ts --query "查詢文字" --alpha 0.7
    --alpha 0.0 = 純關鍵字, 1.0 = 純語意向量, 0.5 = 平衡（預設）
  npx ts-node hybrid-search.ts --info
`)
    return
  }

  const query = args[queryIdx + 1]

  const topIdx   = args.indexOf('--top')
  const topK     = topIdx !== -1 && args[topIdx + 1] ? parseInt(args[topIdx + 1], 10) : DEFAULT_TOP_K

  const filterIdx = args.indexOf('--filter')
  const filter    = filterIdx !== -1 && args[filterIdx + 1] ? args[filterIdx + 1] : undefined

  const alphaIdx = args.indexOf('--alpha')
  const alpha    = alphaIdx !== -1 && args[alphaIdx + 1] ? parseFloat(args[alphaIdx + 1]) : DEFAULT_ALPHA

  console.log(`[hybrid] 查詢：「${query}」｜alpha=${alpha}`)
  process.stdout.write('[hybrid] 生成 query embedding ... ')

  try {
    const results = await hybridSearch(query, { topK, alpha, filter })
    console.log('✓')
    printResults(results, query, alpha)
  } catch (err) {
    console.log('✗')
    console.error('[fatal]', (err as Error).message)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[fatal]', err.message)
    process.exit(1)
  })
}
