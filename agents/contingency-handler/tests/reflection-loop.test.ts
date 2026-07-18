// Tests the full post-generation reflection loop in generateContingencyPlan:
// violating narrative → feedback injected → regenerate → accept / fallback.
// Uses a scripted mock LLMClient — no external API calls.
// Run: npx ts-node tests/reflection-loop.test.ts

import { generateContingencyPlan } from '../src/generators'
import { DEFAULT_CONFIG, type LLMClient, type POI, type WeatherEvent } from '../src/types'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('✗', msg)
    process.exitCode = 1
  } else {
    console.log('✓', msg)
  }
}

function makePoi(id: string, name: string, overrides: Partial<POI> = {}): POI {
  return {
    poi_id: id, name, level: 2, is_indoor: true,
    space_type: 'indoor', weather_sensitivity: 'low', tags: [],
    duration_min: 60, latitude: 25.0, longitude: 121.5, rating: 4.2,
    ...overrides,
  }
}

const current = makePoi('CUR-1', '老梅綠石槽', { is_indoor: false, space_type: 'outdoor', weather_sensitivity: 'high' })
const museum  = makePoi('OK-1', '朱銘美術館')
// 會被 strict-checker 淘汰（戶外 + 大雨）
const outdoor = makePoi('BAD-1', '富貴角燈塔', { is_indoor: false, space_type: 'outdoor', weather_sensitivity: 'high' })

const rainEvent: WeatherEvent = {
  kind: 'weather', type: 'heavy_rain', severity: 'critical',
  rainfall_probability: 0.85, temperature_celsius: 18,
  affected_location: { latitude: 25, longitude: 121.5, radius_km: 5 },
  forecast_duration_minutes: 180, data_source: 'mock', timestamp: new Date().toISOString(),
}

// 腳本化 LLM：依序回傳指定敘述，並記錄收到的 prompt
function scriptedLLM(outputs: string[]): { client: LLMClient; prompts: string[] } {
  const prompts: string[] = []
  let i = 0
  return {
    prompts,
    client: {
      async complete(_sys: string, user: string) {
        prompts.push(user)
        const text = outputs[Math.min(i, outputs.length - 1)]
        i++
        return { text, tokens: 10, source: 'gemini' as const }
      },
    },
  }
}

async function main() {
  // ── 案例 1：首次違規（提及被淘汰景點）→ 回填理由 → 第二次通過 ──────────
  const s1 = scriptedLLM([
    '建議改去富貴角燈塔看海。',        // 違規：提及被 strict-checker 淘汰的景點
    '建議改去朱銘美術館避雨。',        // 合規
  ])
  const plan1 = await generateContingencyPlan(
    rainEvent, current, null, [museum, outdoor], DEFAULT_CONFIG, s1.client,
  )
  assert(plan1.narrative_reflection?.attempts === 2, '違規後重生成，共 2 次')
  assert(plan1.narrative_reflection?.accepted === true, '第二次生成通過')
  assert(plan1.narrative_reflection?.violation_log.length === 1, '違規記錄 1 輪')
  assert(plan1.llm_narrative === '建議改去朱銘美術館避雨。', '採用第二次的合規敘述')
  assert(plan1.llm_source === 'gemini', 'llm_source 維持 gemini')
  assert(plan1.llm_tokens_used === 20, 'tokens 累計兩次生成')
  assert(s1.prompts.length === 2 && s1.prompts[1].includes('未通過反思審查'), '第二次 prompt 含回填的違規理由')
  assert(s1.prompts[1].includes('富貴角燈塔'), '回填理由點名違規景點')

  // ── 案例 2：次數用盡仍違規 → 退回規則保底 ──────────────────────────────
  const s2 = scriptedLLM(['**推薦**去富貴角燈塔。'])   // 永遠違規（markdown + 淘汰景點）
  const plan2 = await generateContingencyPlan(
    rainEvent, current, null, [museum, outdoor], DEFAULT_CONFIG, s2.client,
  )
  assert(plan2.narrative_reflection?.accepted === false, '用盡次數 → 未通過')
  assert(plan2.narrative_reflection?.attempts === DEFAULT_CONFIG.max_narrative_reflection_attempts, '嘗試次數 = 設定上限')
  assert(plan2.llm_narrative === plan2.strategy_description, '敘述退回規則保底（strategy_description）')
  assert(plan2.llm_source === 'fallback', 'llm_source 標為 fallback')

  // ── 案例 3：一次就合規 → 不多花 LLM 呼叫 ──────────────────────────────
  const s3 = scriptedLLM(['建議改去朱銘美術館避雨。'])
  const plan3 = await generateContingencyPlan(
    rainEvent, current, null, [museum, outdoor], DEFAULT_CONFIG, s3.client,
  )
  assert(plan3.narrative_reflection?.attempts === 1 && plan3.narrative_reflection?.accepted === true, '合規敘述一次通過')
  assert(s3.prompts.length === 1, '通過後不再呼叫 LLM')

  console.log(process.exitCode ? '\n有測試失敗' : '\n全部通過')
}

main().catch(err => { console.error(err); process.exitCode = 1 })
