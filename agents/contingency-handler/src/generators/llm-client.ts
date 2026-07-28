import type { LLMClient } from '../types'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

async function callGemini(systemPrompt: string, userPrompt: string): Promise<{ text: string; tokens: number } | null> {
  if (!GEMINI_API_KEY) return null
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          // gemini-2.5-flash 預設會先「思考」，thinking token 與輸出共用
          // maxOutputTokens 額度。目前的敘述夠短還沒被切到，但輸出一變長就會
          // 在中途被硬切斷——截斷的敘述會被 narrative-checker 判不合格、退回
          // 規則保底，畫面上完全看不出來（2026-07-28 在 bench-datalayer.ts
          // 踩到同一件事：12 次呼叫有 8 次 JSON 被切斷）。
          // 這裡不需要思考，直接關掉並把額度留給輸出。
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 1024,
        },
      }),
    })
    if (!res.ok) {
      console.warn(`[llm] gemini HTTP ${res.status}`)
      return null
    }
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const tokens = data.usageMetadata?.totalTokenCount ?? 0
    return { text, tokens }
  } catch (err) {
    console.warn('[llm] gemini error:', err)
    return null
  }
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<{ text: string; tokens: number } | null> {
  if (!ANTHROPIC_API_KEY) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!res.ok) {
      console.warn(`[llm] claude HTTP ${res.status}`)
      return null
    }
    const data = await res.json()
    const text = data.content?.[0]?.text ?? ''
    const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
    return { text, tokens }
  } catch (err) {
    console.warn('[llm] claude error:', err)
    return null
  }
}

export const defaultLLMClient: LLMClient = {
  async complete(systemPrompt, userPrompt) {
    const gemini = await callGemini(systemPrompt, userPrompt)
    if (gemini) return { ...gemini, source: 'gemini' }
    const claude = await callClaude(systemPrompt, userPrompt)
    if (claude) return { ...claude, source: 'claude' }
    return { text: '', tokens: 0, source: 'fallback' }
  },
}
