/**
 * 診斷腳本：跑單一景點的 extractInsights，把所有錯誤訊息印出來
 * Usage: cd agents/poi-verifier && npx ts-node debug-insights.ts [POI_ID]
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

import * as fs from 'fs'
import * as path from 'path'

const TARGET = process.argv[2] ?? 'NCA-005'
const RESULTS_PATH = path.join(__dirname, 'results', 'poi_verified.json')

;(async () => {
  const entries = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8')) as any[]
  const entry = entries.find((e) => e.poi_id === TARGET)
  if (!entry) {
    console.error(`找不到 ${TARGET}`)
    process.exit(1)
  }

  const blogs = entry.result?.raw_sources?.blog_posts ?? []
  console.log(`\n=== ${entry.poi_id} ${entry.name} ===`)
  console.log(`blogs total: ${blogs.length}`)
  console.log(`blogs with snippet: ${blogs.filter((b: any) => b.snippet?.trim()).length}\n`)

  const blogText = blogs
    .filter((b: any) => b.snippet?.trim())
    .slice(0, 3)
    .map((b: any) => `[${b.published_date ?? '日期不明'}] ${b.snippet.slice(0, 300)}`)
    .join('\n')

  console.log('--- blogText 餵給 LLM ---')
  console.log(blogText)
  console.log('--- end ---\n')

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    console.error('GEMINI_API_KEY 未設定')
    process.exit(1)
  }

  const prompt = `你是旅遊資訊分析師。從以下部落格內容萃取「${entry.name}」的非通用旅遊洞察。

部落格內容：
${blogText}

請只萃取部落格中明確提到、且 Google Maps 不會告訴你的實用資訊。
不要捏造或推測沒有提到的內容。

輸出 JSON（不要加 markdown）：
{
  "constraints": ["限制1", "限制2"],
  "visitor_tips": ["建議1", "建議2"],
  "weather_notes": ["天氣注意1"],
  "crowd_notes": "人潮描述",
  "recent_status": "近期狀態"
}`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`
  console.log('呼叫 Gemini...')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })

  console.log(`HTTP ${res.status} ${res.statusText}`)
  const raw = await res.text()
  console.log('--- raw response ---')
  console.log(raw)
  console.log('--- end ---\n')

  if (!res.ok) {
    console.error('❌ API 失敗')
    process.exit(1)
  }

  try {
    const data = JSON.parse(raw)
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    console.log('--- candidates[0].content.parts[0].text ---')
    console.log(text)
    console.log('--- end ---\n')

    const finishReason = data.candidates?.[0]?.finishReason
    console.log('finishReason:', finishReason)

    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    try {
      const parsed = JSON.parse(cleaned)
      console.log('\n✅ JSON parse 成功:')
      console.log(JSON.stringify(parsed, null, 2))
    } catch (err: any) {
      console.error('\n❌ JSON parse 失敗:', err.message)
      console.error('cleaned text:', cleaned.slice(0, 500))
    }
  } catch (err: any) {
    console.error('❌ 外層 JSON parse 失敗:', err.message)
  }
})()
