/**
 * demo-scenarios.ts — 教授報告展示用腳本
 *
 * 共五個場景，分兩個區塊：
 *
 * 【區塊 A — POI 驗證器】（既有）
 *   1. 正常場景：竹子湖海芋（晴天）
 *   2. 應變場景：竹子湖（大雨 80%）
 *   3. 異常場景：不存在的景點
 *
 * 【區塊 B — RAG Reranker 應變示範】（新增）
 *   4. 下雨天場景：行程突然下大雨，重排候選景點，室內優先
 *   5. 景點臨時關閉：主景點關閉，從 L2/L3 候補池挑替代方案
 *
 * Usage:
 *   npx ts-node demo-scenarios.ts              # 跑全部五個場景
 *   npx ts-node demo-scenarios.ts --only-rag   # 只跑 RAG 兩個場景（較快）
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import * as fs   from 'fs'
import * as path from 'path'
import { verifyPoi }       from './src/agent'
import { rerankResults, printRankedResults } from './rag-reranker'
import type { PoiInput, VerificationContext } from './src/types'
import type { RerankerContext }               from './rag-reranker'

// ── 輸出目錄 ───────────────────────────────────────────────────────────────

const OUT_DIR = path.join(__dirname, 'tests', 'fixtures')
fs.mkdirSync(OUT_DIR, { recursive: true })

// ── 工具函式 ────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function banner(label: string, index: number, total: number) {
  console.log(`\n${'═'.repeat(66)}`)
  console.log(`  [${index}/${total}] ${label}`)
  console.log('═'.repeat(66))
}

// ── 區塊 A：POI 驗證器場景 ─────────────────────────────────────────────────

const verifyScenarios: Array<{
  label:   string
  poi:     PoiInput
  context: VerificationContext
}> = [
  {
    label:   '正常場景：竹子湖海芋（晴天）',
    poi:     { name: '竹子湖海芋', location: { latitude: 25.168, longitude: 121.541 } },
    context: { group_size: 4, vibe_tags: ['自然', '攝影', '輕鬆'] },
  },
  {
    label:   '應變場景：竹子湖（大雨 80% 機率）',
    poi:     { name: '竹子湖海芋', location: { latitude: 25.168, longitude: 121.541 } },
    context: { group_size: 4, vibe_tags: ['自然', '攝影'], scenario: 'heavy_rain' },
  },
  {
    label:   '異常場景：不存在的景點',
    poi:     { name: '台北星球大戰主題樂園', location: { latitude: 25.033, longitude: 121.565 } },
    context: { group_size: 2 },
  },
]

async function runVerifyScenarios(): Promise<void> {
  const total = verifyScenarios.length
  for (let i = 0; i < total; i++) {
    if (i > 0) {
      console.log('\n⏳ 等待 10 秒避免 API rate limit...')
      await sleep(10_000)
    }

    const s = verifyScenarios[i]
    banner(s.label, i + 1, total)

    const result = await verifyPoi(s.poi, s.context)

    console.log(`  exists:      ${result.verification_result.exists}`)
    console.log(`  reliability: ${result.verification_result.reliability_score.toFixed(2)}`)
    console.log(`  level:       L${result.enrichment_result.suggested_level}  （${result.enrichment_result.level_reasoning}）`)
    console.log(`  tokens:      ${result.cost_estimate.tokens_used}  （NT$${result.cost_estimate.estimated_cost_ntd}）`)

    if (result.enrichment_result.backup_logic) {
      console.log(`  備案策略：  ${result.enrichment_result.backup_logic.strategy_type}`)
      console.log(`  推薦備案：  ${result.enrichment_result.backup_logic.recommended_backup ?? '—'}`)
    } else {
      console.log('  備案：L0 無備案')
    }

    const fname = s.poi.name.replace(/\s+/g, '_') + '_' + (s.context.scenario ?? 'normal') + '.json'
    fs.writeFileSync(path.join(OUT_DIR, fname), JSON.stringify(result, null, 2), 'utf-8')
    console.log(`\n  ✅ fixture 已存：tests/fixtures/${fname}`)
  }
}

// ── 區塊 B：RAG Reranker 應變示範 ──────────────────────────────────────────

/*
 * 示範情境說明（給教授看的）：
 *
 * Scenario 4 — 下雨天應變
 *   一群四人旅遊，原本計劃去陽明山野外活動。出發前氣象 API
 *   偵測到下大雨（heavy_rain），Strategy Agent 觸發 Swap 邏輯，
 *   用 RAG Reranker 搜尋室內替代方案。
 *
 *   關鍵觀察：
 *     ・室內景點（美術館、展館）structural_boost = +1.0
 *     ・高天氣敏感戶外景點 structural_boost = -1.0
 *     ・LLM 交叉評分進一步確認「不適合下雨天」的戶外景點
 *
 * Scenario 5 — 景點臨時關閉
 *   原定主景點（北海岸某海蝕景觀）當日公告臨時關閉。
 *   Strategy Agent 觸發 Switch 邏輯，從同區 L2/L3 候補池挑替代。
 *
 *   關鍵觀察：
 *     ・L2/L3 景點 structural_boost = +0.5（候補池優先）
 *     ・L0/L1 景點不易被選為「備案」（它們自身就是主景點）
 *     ・LLM 根據「海景自然」偏好挑出最相符的替代地點
 */

interface RagDemoScenario {
  label:       string
  story:       string      // 旁白說明（教授簡報用）
  query:       string
  context:     RerankerContext
  options: {
    topK?:    number
    poolSize?: number
    filter?:  string
    skipLLM?: boolean
  }
  fixtureId:   string      // 輸出檔名用的識別碼
}

const ragScenarios: RagDemoScenario[] = [
  {
    label:   '下雨天應變：Strategy Agent Swap — 室內景點重排',
    story: [
      '【情境】四人旅行團今日計畫遊陽明山，出發前氣象 API 回報',
      '        午後大雨機率 85%。Strategy Agent 觸發 heavy_rain Swap，',
      '        透過 RAG Reranker 從 poi_catalog 搜尋室內替代方案。',
      '【關鍵邏輯】is_indoor=true → structural_boost +1.0',
      '            weather_sensitivity=high & outdoor → structural_boost -1.0',
      '            LLM 交叉評分確認「雨天最不適合戶外景點」',
    ].join('\n'),
    query:   '下雨天不想淋濕，想找有遮蓋或室內的文藝景點',
    context: {
      scenario:  'heavy_rain',
      vibe_tags: ['文藝', '輕鬆', '拍照'],
    },
    options: {
      topK:     5,
      poolSize: 20,
    },
    fixtureId: 'rag_heavy_rain',
  },
  {
    label:   '景點臨時關閉：Strategy Agent Switch — L2/L3 候補池重排',
    story: [
      '【情境】旅行團抵達北海岸，主景點「野柳地質公園」今日因',
      '        護管工程公告臨時關閉。Strategy Agent 觸發 closure Switch，',
      '        從 poi_catalog 挑出同區 L2/L3 候補景點作為替代行程。',
      '【關鍵邏輯】suggested_level 2 or 3 → structural_boost +0.5',
      '            L0/L1 不應被選為「備案」（它們本身就是主景點）',
      '            LLM 根據「海景、自然」偏好挑出最相符替代地點',
    ].join('\n'),
    query:   '北海岸海景或自然地形景點，適合臨時替換主行程的備案',
    context: {
      scenario:  'closure',
      vibe_tags: ['海景', '自然', '地質'],
    },
    options: {
      topK:     5,
      poolSize: 20,
    },
    fixtureId: 'rag_closure',
  },
]

async function runRagScenarios(): Promise<void> {
  const total = ragScenarios.length
  for (let i = 0; i < total; i++) {
    if (i > 0) {
      console.log('\n⏳ 等待 12 秒避免 Gemini API rate limit...')
      await sleep(12_000)
    }

    const s = ragScenarios[i]
    banner(s.label, i + 1, total)
    console.log(s.story)
    console.log('')

    console.log(`  查詢：「${s.query}」`)
    console.log(`  場景：${s.context.scenario}  |  偏好：${s.context.vibe_tags?.join('、') ?? '—'}`)
    console.log(`  Stage-1 候選池 ${s.options.poolSize} 筆 → Stage-2 ${s.options.skipLLM ? '結構排序（--no-llm）' : 'LLM 交叉編碼器'} → 輸出 top ${s.options.topK}`)
    process.stdout.write('  執行中 ...')

    let results
    try {
      results = await rerankResults(s.query, s.context, s.options)
      console.log(' ✓')
    } catch (err: any) {
      console.log(' ✗')
      console.error(`  [ERROR] ${err?.message ?? err}`)
      console.error('  可能原因：Supabase 未啟動 / poi_catalog 尚無資料 / GEMINI_API_KEY 未設定')
      console.error('  → 請先執行 npm run ingest 建立向量庫，或加上 --only-rag 後再搭配 --no-llm 旗標試跑')
      continue
    }

    // ── 輸出排名結果 ────────────────────────────────────────────────────────
    printRankedResults(results, s.query, s.context, s.options.skipLLM ?? false)

    // ── 輸出加分邏輯摘要（強調 Swap/Switch 決策樹）────────────────────────
    console.log('\n  ── 應變邏輯摘要 ─────────────────────────────────────────────')
    for (const r of results) {
      if (r.boost_reasons.length > 0) {
        console.log(`  ${r.name.padEnd(18)}  boost=${r.structural_boost >= 0 ? '+' : ''}${r.structural_boost.toFixed(1)}  ${r.boost_reasons.join(' | ')}`)
      }
    }
    if (results.every(r => r.boost_reasons.length === 0)) {
      console.log('  （候選池中無符合加/扣分條件的景點）')
    }

    // ── 儲存 fixture ─────────────────────────────────────────────────────────
    const fixture = {
      scenario:   s.context.scenario,
      query:      s.query,
      vibe_tags:  s.context.vibe_tags,
      generated_at: new Date().toISOString(),
      results,
    }
    const fname = `${s.fixtureId}.json`
    fs.writeFileSync(path.join(OUT_DIR, fname), JSON.stringify(fixture, null, 2), 'utf-8')
    console.log(`\n  ✅ fixture 已存：tests/fixtures/${fname}`)
  }
}

// ── 主入口 ─────────────────────────────────────────────────────────────────

;(async () => {
  const onlyRag = process.argv.includes('--only-rag')

  if (!onlyRag) {
    console.log('\n╔══════════════════════════════════════════════════════════════╗')
    console.log('║   Navigator Demo — 區塊 A：POI 驗證器（3 個場景）           ║')
    console.log('╚══════════════════════════════════════════════════════════════╝')
    await runVerifyScenarios()
    console.log('\n⏳ 切換到區塊 B，等待 15 秒...')
    await sleep(15_000)
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║   Navigator Demo — 區塊 B：RAG Reranker 應變示範（2 個）    ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  await runRagScenarios()

  console.log('\n\n所有場景完成。fixture 輸出目錄：' + OUT_DIR)
})()
