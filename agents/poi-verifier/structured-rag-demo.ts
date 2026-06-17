/**
 * 結構化 RAG 示範腳本（Structured RAG Demo）
 *
 * 與基礎 RAG 的差異：
 *   基礎 RAG   → 把文件切成均等大小的 chunk，不知道 chunk 在文件哪個位置
 *   結構化 RAG → 依 H1/H2/H3 層次切割，每個 chunk 攜帶完整「章節路徑」
 *              → 注入 LLM prompt 時，LLM 知道「這段話來自第 2 章 > Token 投票制」
 *
 * 適用場景（本專案）：
 *   - Navigator_MVP_架構書.docx（12 章，轉成 markdown 後即可）
 *   - CLAUDE.md（本示範使用）
 *   - 任何有明確 H1/H2/H3 層次的長文件
 *
 * 不適合：
 *   - POI JSON（已是結構化資料，用 metadata filter + pgvector 即可）
 *   - 短文件（< 5 個章節，基礎 RAG 就夠）
 *
 * Usage:
 *   npx ts-node structured-rag-demo.ts
 *   npx ts-node structured-rag-demo.ts --doc ../../CLAUDE.md
 *   npx ts-node structured-rag-demo.ts --doc /path/to/architecture.md --save-index
 *
 * 若要避免每次重新 embed，加上 --save-index 將 chunk embeddings 存到
 * results/structured-rag-index.json，下次自動讀取。
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })
dotenv.config({ path: '../../.env' })

import * as fs   from 'fs'
import * as path from 'path'

// ── 型別定義 ──────────────────────────────────────────────────────────────────

interface DocChunk {
  id:           string      // 'chunk-0', 'chunk-1', ...
  heading_path: string[]    // ['## 2. 必讀框架', 'Token 投票制'] — 完整章節路徑
  content:      string      // chunk 本文（不含標題行）
  level:        number      // heading 層級（1 = H1, 2 = H2, 3 = H3）
  embed_text:   string      // 實際送進 embedding API 的文字（含章節路徑 prefix）
  embedding?:   number[]    // 768 維向量（embedding 後才有）
}

interface SavedIndex {
  doc_path:   string
  indexed_at: string
  chunks:     DocChunk[]
}

// ── Markdown → 結構化 Chunks ─────────────────────────────────────────────────

function parseMarkdown(filePath: string): DocChunk[] {
  const docTitle = path.basename(filePath)
  const text     = fs.readFileSync(filePath, 'utf-8')
  const lines    = text.split('\n')

  const chunks: DocChunk[]                        = []
  const headingStack: { level: number; text: string }[] = []
  let currentLines: string[] = []
  let currentHeading: { level: number; text: string } | null = null
  let idx = 0

  function flush() {
    const content = currentLines.join('\n').trim()
    if (!content || !currentHeading) return

    const hPath = headingStack.map(h => h.text)

    // 核心差異：embed_text 包含完整章節路徑 —— 基礎 RAG 沒有這一段
    const embedText = [
      `文件：${docTitle}`,
      `章節路徑：${hPath.join(' > ')}`,
      '',
      content,
    ].join('\n')

    chunks.push({
      id:           `chunk-${idx++}`,
      heading_path: [...hPath],
      content,
      level:        currentHeading.level,
      embed_text:   embedText,
    })
    currentLines = []
  }

  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)/)
    if (match) {
      flush()
      const level = match[1].length
      const text  = match[2].trim()

      // 彈出比目前層級深或同層的 heading
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop()
      }
      headingStack.push({ level, text })
      currentHeading = { level, text }
    } else {
      currentLines.push(line)
    }
  }
  flush()

  return chunks
}

// ── Gemini Embedding API ─────────────────────────────────────────────────────

const EMBED_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent'

async function embed(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')

  const res = await fetch(`${EMBED_ENDPOINT}?key=${key}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content:              { parts: [{ text }] },
      outputDimensionality: 768,
      taskType,
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Embedding ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.embedding.values as number[]
}

// ── Cosine Similarity ─────────────────────────────────────────────────────────

function cosine(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ── Retrieval：找 top-K chunk，並附帶父章節 context ─────────────────────────

interface RetrievedChunk extends DocChunk {
  similarity: number
}

function retrieve(query_emb: number[], chunks: DocChunk[], topK = 3): RetrievedChunk[] {
  return chunks
    .filter(c => c.embedding)
    .map(c => ({ ...c, similarity: cosine(query_emb, c.embedding!) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
}

// ── LLM Generation（結構化 RAG 的 G）────────────────────────────────────────

async function generate(query: string, chunks: RetrievedChunk[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return '(GEMINI_API_KEY not set)'

  // 每個 chunk 注入時帶著章節路徑 —— 這是結構化 RAG 的精髓
  const context = chunks.map((c, i) => {
    const sectionPath = c.heading_path.join(' > ')
    return `[片段 ${i + 1}｜章節：${sectionPath}]\n${c.content.slice(0, 500)}`
  }).join('\n\n---\n\n')

  const prompt = `你是 Navigator 旅遊規劃系統的技術助理。以下是從文件中依章節結構取出的相關片段，請根據片段內容回答問題。

${context}

問題：${query}

請用繁體中文回答，簡潔扼要（2-4 句）。若片段資訊不足，請說明。`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:      0.1,
          maxOutputTokens:  512,
          thinkingConfig:   { thinkingBudget: 0 },
        },
      }),
    }
  )
  if (!res.ok) return `(LLM error: ${res.status})`
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '(empty response)'
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

const DELAY_MS   = 6_500   // Gemini embedding 10 RPM free tier → 6.5s 間隔
const INDEX_PATH = path.join(__dirname, 'results', 'structured-rag-index.json')

;(async () => {
  const args     = process.argv.slice(2)
  const docFlag  = args.indexOf('--doc')
  const saveFlag = args.includes('--save-index')
  const docPath  = docFlag !== -1
    ? path.resolve(args[docFlag + 1])
    : path.join(__dirname, '..', '..', 'CLAUDE.md')

  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║   結構化 RAG 示範（Structured RAG Demo）                 ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')
  console.log(`文件：${docPath}\n`)

  if (!fs.existsSync(docPath)) {
    console.error(`❌  找不到文件：${docPath}`)
    process.exit(1)
  }

  // ① 解析文件結構
  console.log('① 解析 Markdown 章節結構...')
  const chunks = parseMarkdown(docPath)
  console.log(`   → ${chunks.length} 個結構化 chunk\n`)

  console.log('   章節結構預覽（前 10 個）：')
  chunks.slice(0, 10).forEach(c => {
    const indent  = '  '.repeat(c.level - 1)
    const pathTip = c.heading_path.at(-1) ?? ''
    console.log(`   ${indent}[${'H' + c.level}] ${pathTip.slice(0, 55)} (${c.content.length} 字)`)
  })
  console.log()

  // ② 嘗試讀取已儲存的 index，若已有就跳過 embedding
  let indexLoaded = false
  if (fs.existsSync(INDEX_PATH)) {
    try {
      const saved: SavedIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'))
      if (saved.doc_path === docPath && saved.chunks.length === chunks.length) {
        saved.chunks.forEach((s, i) => { chunks[i].embedding = s.embedding })
        console.log(`② 讀取已儲存的 index（${saved.indexed_at}），略過 embedding 步驟\n`)
        indexLoaded = true
      }
    } catch { /* 忽略損壞的 index */ }
  }

  // ③ 若無 index，生成 embeddings
  if (!indexLoaded) {
    console.log('② 生成 chunk embeddings（RETRIEVAL_DOCUMENT task type）...')
    console.log('   （每筆間隔 6.5s，避免觸發 Gemini 10 RPM 限制）\n')

    for (let i = 0; i < chunks.length; i++) {
      const label = chunks[i].heading_path.at(-1)?.slice(0, 45) ?? `chunk-${i}`
      process.stdout.write(`   [${String(i + 1).padStart(2)}/${chunks.length}] ${label.padEnd(46)}`)
      try {
        chunks[i].embedding = await embed(chunks[i].embed_text, 'RETRIEVAL_DOCUMENT')
        console.log('✅')
      } catch (e) {
        console.log(`❌  ${(e as Error).message}`)
      }
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, DELAY_MS))
    }
    console.log()

    // ④ 選擇性存 index
    if (saveFlag) {
      const saved: SavedIndex = {
        doc_path:   docPath,
        indexed_at: new Date().toISOString(),
        chunks:     chunks.map(c => ({ ...c })),
      }
      fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true })
      fs.writeFileSync(INDEX_PATH, JSON.stringify(saved, null, 2))
      console.log(`   💾  Index 已儲存：${INDEX_PATH}\n`)
    }
  }

  // ⑤ Demo 查詢（展示結構化 RAG 與基礎 RAG 的差異）
  const demoQueries = [
    'VETO 否決票的機制是什麼？和普通負票有什麼不同？',
    '行程突然下雨，系統會怎麼處理？Swap 和 Switch 差在哪？',
    '為什麼 AI 模型選 Gemini 而不是 GPT-4？',
  ]

  console.log('③ 結構化 RAG 查詢示範\n')
  console.log('─'.repeat(66))
  console.log('  差異說明：結構化 RAG 的搜尋結果會附帶「章節路徑」，')
  console.log('  LLM 知道這段內容來自文件的第幾章、哪個小節。')
  console.log('─'.repeat(66))

  for (let qi = 0; qi < demoQueries.length; qi++) {
    const query = demoQueries[qi]
    console.log(`\n🔍  查詢 ${qi + 1}：「${query}」`)

    let qEmb: number[]
    try {
      qEmb = await embed(query, 'RETRIEVAL_QUERY')  // query 用 RETRIEVAL_QUERY
    } catch (e) {
      console.log(`   ❌  Query embedding 失敗：${(e as Error).message}`)
      continue
    }

    const topChunks = retrieve(qEmb, chunks, 3)

    console.log('\n   📌  Top-3 結構化召回（含章節路徑）：')
    topChunks.forEach((c, i) => {
      const pathStr = c.heading_path.join(' > ')
      const snippet = c.content.slice(0, 100).replace(/\n/g, ' ').trim()
      console.log(`   ${i + 1}. [${(c.similarity * 100).toFixed(1)}%] ${pathStr}`)
      console.log(`         "${snippet}..."`)
    })

    console.log('\n   💬  LLM 回答：')
    const answer = await generate(query, topChunks)
    console.log(`   ${answer.replace(/\n/g, '\n   ')}`)
    console.log('\n' + '─'.repeat(66))

    if (qi < demoQueries.length - 1) await new Promise(r => setTimeout(r, DELAY_MS))
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║   結構化 RAG vs 基礎 RAG 對照                            ║')
  console.log('╠══════════════════════════════════════════════════════════╣')
  console.log('║  基礎 RAG：chunk = 原文片段                              ║')
  console.log('║            → LLM 看到「token 投票，每人 1 張 VETO」       ║')
  console.log('║                                                          ║')
  console.log('║  結構化 RAG：chunk = 章節路徑 + 原文片段                  ║')
  console.log('║            → LLM 看到「## 2 > Token 投票制：...」         ║')
  console.log('║            → 知道這是「核心設計原則」的一部分，回答更精準   ║')
  console.log('╠══════════════════════════════════════════════════════════╣')
  console.log('║  本專案建議用途：                                         ║')
  console.log('║  - 讓 Architect Agent 能查詢架構書（12 章，轉 .md 後）    ║')
  console.log('║  - 讓 Strategy Agent 查詢應變 SOP 文件                   ║')
  console.log('║  - 與 poi_catalog pgvector（基礎 RAG）並存，各司其職      ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')
})()
