/**
 * rag-reranker.ts — RAG 景點重新排序流程
 *
 * 這支程式做的事情是：先用混合搜尋撒一張大網，再把候選景點重新精排。
 * 整個流程分兩個階段：
 *
 *   第一階段 — 混合搜尋（廣撒網）
 *     呼叫 hybridSearch()，預設撈回前 20 筆候選景點。
 *     故意撈比最終需要還多的筆數，讓後面的排序有足夠材料可以篩選。
 *
 *   第二階段 A — 規則加權（不需要呼叫 AI）
 *     按照行程規劃的硬性規則直接調整分數：
 *     ・L0 絕對錨點：系統規則不允許自動替換，往後推
 *     ・下雨（heavy_rain）：室內景點大幅加分、高天氣敏感戶外景點大幅扣分
 *     ・景點關閉（closure）：L2/L3 候補景點加分（更容易被選為備援）
 *     ・旅客疲勞（fatigue）：輕鬆的室內景點加分
 *     ・偏好標籤（--vibe）：描述中包含偏好關鍵字的景點加分
 *
 *   第二階段 B — AI 交叉評分（可用 --no-llm 跳過）
 *     把所有候選景點一次送進 Gemini，請 AI 對每個景點打 0–10 分並說明原因。
 *     這個做法叫「交叉編碼器（Cross-encoder）」，比純向量搜尋更能理解
 *     「適合帶爸媽去不用爬太多路的地方」這種複雜的自然語言條件。
 *
 * 向量搜尋（雙編碼器）vs AI 重排（交叉編碼器）的差別：
 *   ・向量搜尋：查詢和景點各自轉成向量，再比較兩個向量有多像。
 *     → 速度快，但看不見「查詢和景點之間的細節關係」。
 *   ・AI 重排：把查詢和景點「放在一起」給 AI 讀，AI 同時理解兩者的關係。
 *     → 理解力更強，但每次需要呼叫一次 AI。
 *     → 成本控制：不是每個景點各呼叫一次，而是所有候選一次送完。
 *
 * 執行方式：
 *   npx ts-node rag-reranker.ts --query "下雨天想找安靜的室內景點"
 *   npx ts-node rag-reranker.ts --query "適合拍照的地方" --scenario heavy_rain
 *   npx ts-node rag-reranker.ts --query "親子友善" --vibe 親子,自然
 *   npx ts-node rag-reranker.ts --query "陽明山附近" --filter region:陽明山 --no-llm
 *   npx ts-node rag-reranker.ts --query "下午茶" --top 3 --pool 15
 *
 * 參數說明：
 *   --scenario <heavy_rain|closure|fatigue>  觸發哪種應變場景加權
 *   --vibe <標籤1,標籤2>                     群組偏好風格標籤（逗號分隔）
 *   --no-llm                                 跳過 AI 評分，只做規則加權
 *   --top <數字>                             最終輸出幾筆（預設 5）
 *   --pool <數字>                            混合搜尋候選池大小（預設 20）
 *   --alpha <0.0–1.0>                        傳給混合搜尋的語意向量比重
 *   --filter                                 篩選條件，傳給混合搜尋
 */

import * as dotenv from 'dotenv'
import { hybridSearch, HybridSearchResult } from './hybrid-search'

dotenv.config({ path: '../../.env.local' })
dotenv.config({ path: '../../.env' })

// ── 設定常數 ────────────────────────────────────────────────────────────────

const GEMINI_API_KEY   = process.env.GEMINI_API_KEY
const GEMINI_MODEL     = 'gemini-1.5-flash'    // 用最便宜快速的 Flash 版本，評分用途夠了
const DEFAULT_TOP_K    = 5
const DEFAULT_POOL     = 20
const DEFAULT_ALPHA    = 0.5

// ── 型別定義 ────────────────────────────────────────────────────────────────

// 應變場景的三種類型
type Scenario = 'heavy_rain' | 'closure' | 'fatigue' | null

// 呼叫重排函式時傳入的場景脈絡
export interface RerankerContext {
  scenario?: Scenario
  vibe_tags?: string[]   // 群組偏好風格標籤（如 ["親子", "自然"]）
}

// 重排後的景點結果，在 HybridSearchResult 基礎上增加排序相關欄位
export interface RankedResult extends HybridSearchResult {
  // 第二階段 A 的規則加權結果
  structural_boost: number   // 加分 +1.0 / 不動 0.0 / 扣分 -1.0
  boost_reasons: string[]    // 加扣分的原因說明（方便 debug 和展示）

  // 第二階段 B 的 AI 評分結果（若使用 --no-llm 則為 null）
  llm_score: number | null   // AI 給的 0–10 分
  llm_reason: string | null  // AI 說明為什麼給這個分數

  // 最終綜合分數（用來決定最後順序）
  final_score: number
}

// AI 重排 API 回傳的單筆格式
interface LLMRerankerResponse {
  poi_id: string
  score: number    // 0–10
  reason: string
}

// ── 第二階段 A：規則加權 ────────────────────────────────────────────────────

function applyStructuralBoost(
  result: HybridSearchResult,
  context: RerankerContext,
): { boost: number; reasons: string[] } {
  let boost = 0
  const reasons: string[] = []

  const scenario = context.scenario

  // L0 絕對錨點不能自動被替換（系統設計核心規則），在備援候補搜尋中往後推
  if (result.suggested_level === 0) {
    boost -= 0.5
    reasons.push('L0 絕對錨點：不應自動替換')
  }

  // 下雨場景：室內大加分，高天氣敏感戶外大扣分，中天氣敏感景點小扣分
  if (scenario === 'heavy_rain') {
    if (result.is_indoor) {
      boost += 1.0
      reasons.push('下雨場景：室內景點強力優先')
    } else if (result.weather_sensitivity === 'high') {
      boost -= 1.0
      reasons.push('下雨場景：高天氣敏感戶外景點降權')
    } else if (result.weather_sensitivity === 'medium') {
      boost -= 0.3
      reasons.push('下雨場景：中天氣敏感景點輕微降權')
    }
  }

  // 景點關閉場景：優先推 L2/L3 候補景點（它們本來就是備案設計）
  if (scenario === 'closure') {
    if (result.suggested_level === 2 || result.suggested_level === 3) {
      boost += 0.5
      reasons.push('景點關閉場景：L2/L3 候補池優先')
    }
  }

  // 旅客疲勞場景：推薦天氣影響低且為室內的輕鬆景點
  if (scenario === 'fatigue') {
    if (result.weather_sensitivity === 'low' && result.is_indoor) {
      boost += 0.8
      reasons.push('疲勞場景：輕鬆室內景點優先')
    }
  }

  // 群組偏好標籤比對：景點描述裡包含幾個偏好關鍵字，就加對應比例的分數
  if (context.vibe_tags?.length) {
    const embedLower = result.embed_text.toLowerCase()
    const matchCount = context.vibe_tags.filter(tag => embedLower.includes(tag.toLowerCase())).length
    if (matchCount > 0) {
      const vibeBoost = (matchCount / context.vibe_tags.length) * 0.5
      boost += vibeBoost
      reasons.push(`偏好標籤匹配 ${matchCount}/${context.vibe_tags.length}：+${vibeBoost.toFixed(2)}`)
    }
  }

  // 把加成值限制在 −2 到 +2 之間，避免極端值破壞排序
  return { boost: Math.max(-2, Math.min(2, boost)), reasons }
}

// ── 第二階段 B：組裝送給 AI 的 Prompt ─────────────────────────────────────
// 把使用者查詢、應變場景、偏好標籤、所有候選景點資訊整理成一段說明文字，
// 送給 Gemini 讓它評分。

function buildLLMPrompt(
  query: string,
  context: RerankerContext,
  candidates: HybridSearchResult[],
): string {
  // 各場景對應的中文說明，讓 AI 知道現在是什麼狀況
  const scenarioContext: Record<string, string> = {
    heavy_rain: '現在下大雨，需要優先推薦室內或防雨景點。',
    closure:    '目前原定景點臨時關閉，需要備選替代方案。',
    fatigue:    '旅客已疲憊，需要推薦輕鬆、低體力消耗的景點。',
  }

  const ctxNote  = context.scenario ? `\n情境說明：${scenarioContext[context.scenario]}` : ''
  const vibeNote = context.vibe_tags?.length
    ? `\n旅客偏好風格：${context.vibe_tags.join('、')}`
    : ''

  // L0–L3 的中文說明，幫助 AI 理解各景點的定位
  const levelDesc: Record<number, string> = {
    0: 'L0（預訂好、不可動）',
    1: 'L1（主要目的地）',
    2: 'L2（條件景點）',
    3: 'L3（填空 buffer）',
  }

  // 把每個候選景點整理成一段文字供 AI 閱讀
  const candidateList = candidates
    .map((c, i) => {
      const indoor = c.is_indoor ? '室內' : '戶外'
      const weather = { low: '天氣影響低', medium: '天氣影響中', high: '天氣影響高' }[c.weather_sensitivity] ?? ''
      const preview = c.embed_text.split('\n').slice(1).join(' ').slice(0, 120)
      return [
        `${i + 1}. POI_ID: ${c.poi_id}`,
        `   名稱：${c.name}（${c.region}）`,
        `   屬性：${levelDesc[c.suggested_level] ?? `L${c.suggested_level}`} | ${indoor} | ${weather}`,
        `   簡介：${preview}`,
      ].join('\n')
    })
    .join('\n\n')

  return `你是旅遊行程規劃助手。請根據使用者需求，對以下景點進行相關性評分。

使用者查詢：「${query}」${ctxNote}${vibeNote}

請為每個景點給出 0–10 的相關性分數和一句評分理由（繁體中文）。

景點列表：
${candidateList}

評分標準：
10 = 完全符合查詢，強烈推薦
7–9 = 高度相關，非常適合
4–6 = 部分符合，可以考慮
1–3 = 關聯性低，不太推薦
0  = 完全不適合（如大雨天的高山健行）

請回傳 JSON 陣列，格式如下（直接輸出 JSON，不要加 markdown code block）：
[
  { "poi_id": "YM-001", "score": 8, "reason": "..." },
  ...
]`
}

// 實際呼叫 Gemini API 取得 AI 評分結果
async function callGeminiRerank(prompt: string): Promise<LLMRerankerResponse[]> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 未設定')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,    // 溫度調低，讓 AI 給分更穩定、不亂飄
        maxOutputTokens: 1024,
      },
    }),
  })

  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`)

  const data = await res.json()
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // AI 有時會在 JSON 外面加 markdown code block（```json ... ```），需要把它剝掉
  const jsonMatch = rawText.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error(`Gemini 回傳格式異常：${rawText.slice(0, 200)}`)

  return JSON.parse(jsonMatch[0]) as LLMRerankerResponse[]
}

// ── 重排主流程（可被其他程式 import 使用）─────────────────────────────────

export async function rerankResults(
  query: string,
  context: RerankerContext = {},
  options: {
    topK?: number
    poolSize?: number
    alpha?: number
    filter?: string
    skipLLM?: boolean
  } = {},
): Promise<RankedResult[]> {
  const topK     = options.topK     ?? DEFAULT_TOP_K
  const poolSize = options.poolSize ?? DEFAULT_POOL
  const alpha    = options.alpha    ?? DEFAULT_ALPHA

  // 第一階段：混合搜尋，撈比最終需要更多的候選景點（廣撒網）
  const pool = await hybridSearch(query, {
    topK: poolSize,
    alpha,
    filter: options.filter,
  })

  if (pool.length === 0) return []

  // 第二階段 A：規則加權
  // boost * 0.001 是為了讓加成量和 RRF 分數（約 0.01–0.001 區間）在同一個數量級
  const structuralResults: RankedResult[] = pool.map(r => {
    const { boost, reasons } = applyStructuralBoost(r, context)
    const structuralScore = r.hybrid_score + boost * 0.001
    return {
      ...r,
      structural_boost: boost,
      boost_reasons: reasons,
      llm_score: null,
      llm_reason: null,
      final_score: structuralScore,
    }
  })

  // 如果加了 --no-llm 旗標，跳過 AI 評分，直接用規則加權結果輸出
  if (options.skipLLM) {
    return structuralResults
      .sort((a, b) => b.final_score - a.final_score)
      .slice(0, topK)
  }

  // 第二階段 B：AI 交叉評分
  // 一次把所有候選景點送給 Gemini，取回每個景點的分數和理由
  const prompt = buildLLMPrompt(query, context, structuralResults.slice(0, poolSize))
  const llmScores = await callGeminiRerank(prompt)

  // 把 AI 的回傳結果用景點 ID 建成查找表，方便後面快速比對
  const llmMap = new Map(llmScores.map(s => [s.poi_id, s]))

  const finalResults: RankedResult[] = structuralResults.map(r => {
    const llm = llmMap.get(r.poi_id)
    // 最終分數 = 規則加權佔 40% + AI 評分佔 60%
    // AI 分數從 0–10 縮放到 0–1；RRF 分數乘以 1000 縮放到同一個數量級
    const llmNorm = llm ? llm.score / 10 : 0.5
    const finalScore = 0.4 * r.final_score * 1000 + 0.6 * llmNorm
    return {
      ...r,
      llm_score: llm?.score ?? null,
      llm_reason: llm?.reason ?? null,
      final_score: Math.round(finalScore * 10000) / 10000,
    }
  })

  return finalResults
    .sort((a, b) => b.final_score - a.final_score)
    .slice(0, topK)
}

// ── 終端機輸出格式化 ────────────────────────────────────────────────────────

function printRankedResults(
  results: RankedResult[],
  query: string,
  context: RerankerContext,
  skipLLM: boolean,
): void {
  const levelLabel = ['L0 絕對錨點', 'L1 彈性錨點', 'L2 條件變動', 'L3 水位調節']
  const scenarioLabel: Record<string, string> = {
    heavy_rain: '下雨場景', closure: '景點關閉', fatigue: '旅客疲勞',
  }

  console.log(`\nRAG Reranking 結果`)
  console.log(`  查詢：「${query}」`)
  if (context.scenario) console.log(`  場景：${scenarioLabel[context.scenario] ?? context.scenario}`)
  if (context.vibe_tags?.length) console.log(`  偏好：${context.vibe_tags.join('、')}`)
  console.log(`  模式：${skipLLM ? '結構排序（--no-llm）' : 'LLM 交叉編碼器'}`)
  console.log(`${'─'.repeat(70)}`)

  results.forEach((r, i) => {
    const level  = levelLabel[r.suggested_level] ?? `L${r.suggested_level}`
    const indoor = r.is_indoor ? '室內' : '戶外'

    console.log(`\n#${i + 1}  ${r.name}  [${r.poi_id}]`)
    console.log(`    最終分數：${r.final_score.toFixed(4)}`)
    console.log(`    混合搜尋：${r.hybrid_score.toFixed(5)}  (V排名：#${r.vector_rank ?? '—'}  K排名：#${r.keyword_rank ?? '—'})`)

    if (r.structural_boost !== 0 || r.boost_reasons.length > 0) {
      console.log(`    結構加權：${r.structural_boost >= 0 ? '+' : ''}${r.structural_boost.toFixed(1)}  ${r.boost_reasons.join(' | ')}`)
    }

    if (r.llm_score !== null) {
      const stars = '★'.repeat(Math.round(r.llm_score / 2))
      console.log(`    LLM 評分：${r.llm_score}/10 ${stars}`)
      if (r.llm_reason) console.log(`    LLM 理由：${r.llm_reason}`)
    }

    console.log(`    屬性：${level}  |  ${indoor}  |  ${r.region}`)
    const preview = r.embed_text.split('\n').slice(1).join(' ').slice(0, 90)
    console.log(`    描述：${preview}...`)
  })

  console.log(`\n${'─'.repeat(70)}`)
  if (!skipLLM) {
    console.log(`[info] LLM 評分理解了整句查詢語意（如「帶老人」「拍照打卡」等軟性條件）`)
  }
  console.log(`[info] 此排序結果可直接注入 Architect Agent 的候選 POI 池`)
}

// ── 指令列入口 ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  const queryIdx = args.indexOf('--query')
  if (queryIdx === -1 || !args[queryIdx + 1]) {
    console.log(`
Navigator RAG Reranker — 使用方式

  npx ts-node rag-reranker.ts --query "查詢文字"
  npx ts-node rag-reranker.ts --query "下雨天室內景點" --scenario heavy_rain
  npx ts-node rag-reranker.ts --query "親子友善" --vibe 親子,自然
  npx ts-node rag-reranker.ts --query "查詢文字" --no-llm          （快速結構排序）
  npx ts-node rag-reranker.ts --query "查詢文字" --top 3 --pool 15
  npx ts-node rag-reranker.ts --query "查詢文字" --filter indoor
  npx ts-node rag-reranker.ts --query "查詢文字" --alpha 0.7

  --scenario <heavy_rain|closure|fatigue>  觸發場景加權
  --vibe <tag1,tag2>                        群體偏好標籤（逗號分隔）
  --no-llm                                  跳過 LLM，僅輸出結構排序
  --top <int>                               最終輸出筆數（預設 5）
  --pool <int>                              檢索池大小（預設 20）
  --alpha <float>                           語意向量比重（預設 0.5）
  --filter                                  indoor|outdoor|region:X|level:X,Y
`)
    return
  }

  const query = args[queryIdx + 1]

  const topIdx     = args.indexOf('--top')
  const topK       = topIdx !== -1 && args[topIdx + 1] ? parseInt(args[topIdx + 1], 10) : DEFAULT_TOP_K

  const poolIdx    = args.indexOf('--pool')
  const poolSize   = poolIdx !== -1 && args[poolIdx + 1] ? parseInt(args[poolIdx + 1], 10) : DEFAULT_POOL

  const alphaIdx   = args.indexOf('--alpha')
  const alpha      = alphaIdx !== -1 && args[alphaIdx + 1] ? parseFloat(args[alphaIdx + 1]) : DEFAULT_ALPHA

  const filterIdx  = args.indexOf('--filter')
  const filter     = filterIdx !== -1 && args[filterIdx + 1] ? args[filterIdx + 1] : undefined

  const scenarioIdx = args.indexOf('--scenario')
  const scenarioRaw = scenarioIdx !== -1 && args[scenarioIdx + 1] ? args[scenarioIdx + 1] : null
  const scenario    = ['heavy_rain', 'closure', 'fatigue'].includes(scenarioRaw ?? '')
    ? scenarioRaw as Scenario
    : null

  const vibeIdx  = args.indexOf('--vibe')
  const vibeTags = vibeIdx !== -1 && args[vibeIdx + 1]
    ? args[vibeIdx + 1].split(',').map(t => t.trim()).filter(Boolean)
    : []

  const skipLLM = args.includes('--no-llm')

  const context: RerankerContext = {
    scenario,
    vibe_tags: vibeTags.length ? vibeTags : undefined,
  }

  console.log(`[reranker] 查詢：「${query}」`)
  if (scenario)           console.log(`[reranker] 場景：${scenario}`)
  if (vibeTags.length)    console.log(`[reranker] 偏好：${vibeTags.join('、')}`)
  console.log(`[reranker] Stage 1 檢索池大小：${poolSize}｜Stage 2：${skipLLM ? '結構排序' : 'LLM 交叉編碼器'}`)

  process.stdout.write('[reranker] 執行 Hybrid Search ... ')

  try {
    const results = await rerankResults(query, context, {
      topK,
      poolSize,
      alpha,
      filter,
      skipLLM,
    })
    console.log('✓')
    printRankedResults(results, query, context, skipLLM)
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
