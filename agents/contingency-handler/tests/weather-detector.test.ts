/**
 * A-2 ＋ A-4 的回歸測試。
 *
 * 這批測試要證明三件事：
 *   1. **加入熱度項後，沒有高溫的既有情境行為一個字都沒變**（最重要的一條——
 *      這是「這次改動是安全的」的唯一依據）
 *   2. 高溫現在真的會讓 EV 落差 > 0（在此之前 EV 只吃降雨，高溫事件恆為 0，
 *      偵測器判出來的高溫到了決策層等於不存在）
 *   3. 「未取得」不會被偷偷補成預設值（先前是 `?? 25`）
 *
 * 跑法：npx ts-node tests/weather-detector.test.ts
 */

import { calculateExpectedValue, heatImpactFactor } from '../src/evaluators/expected-value-calculator'
import { parseCwaConditions, parseHazard, highTemperatureSeverity } from '../src/detectors/weather-detector'
import { DEFAULT_CONFIG, type POI, type WeatherEvent } from '../src/types'

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log('  ✅', msg) }
  else { failed++; console.error('  ❌', msg) }
}
function section(t: string) { console.log(`\n${t}`) }

// ── fixtures ────────────────────────────────────────────────────────────────

const outdoorL2: POI = {
  poi_id: 'T-OUT', name: '戶外景點', level: 2, is_indoor: false,
  space_type: 'outdoor', weather_sensitivity: 'high', tags: [],
  duration_min: 60, latitude: 25.0, longitude: 121.5, rating: 4.3,
}
const indoorL2: POI = {
  ...outdoorL2, poi_id: 'T-IN', name: '室內景點', is_indoor: true, space_type: 'indoor',
}

function weather(over: Partial<WeatherEvent>): WeatherEvent {
  return {
    kind: 'weather', type: 'heavy_rain', severity: 'high',
    rainfall_probability: null, temperature_celsius: null,
    apparent_temperature_celsius: null, wind_speed_ms: null,
    relative_humidity_percent: null, uv_index: null, sun_times: null, advisories: [],
    affected_location: { latitude: 25, longitude: 121.5, radius_km: 5 },
    forecast_duration_minutes: 180, data_source: 'cwa',
    timestamp: new Date().toISOString(),
    ...over,
  }
}

/** 修改前的原始公式，用來逐點比對 */
function legacyEv(L: number, pRain: number, alpha: number) {
  const evv = (1 - pRain) * L + pRain * (L * alpha)
  return { ev: Math.round(evv * 10) / 10, drop: Math.round((L - evv) * 10) / 10 }
}

// ── [1] 等價性：沒有高溫時，新公式 ≡ 舊公式 ─────────────────────────────────

section('[1] 等價性 — 無高溫時必須與原公式逐點相同（本次改動的安全性依據）')

for (const poi of [outdoorL2, indoorL2]) {
  const alpha = poi.space_type === 'indoor' ? 0.95 : 0.10
  for (const p of [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0]) {
    // 溫度給 28°C（明確低於 35 門檻）＝ H=0
    const r = calculateExpectedValue(poi, weather({
      rainfall_probability: p, temperature_celsius: 28, apparent_temperature_celsius: 28,
    }), DEFAULT_CONFIG)
    const want = legacyEv(50, p, alpha)
    assert(
      r.expected_value_current === want.ev && r.score_drop === want.drop,
      `${poi.space_type} P_rain=${p} → EV ${r.expected_value_current}（原式 ${want.ev}）、落差 ${r.score_drop}（原式 ${want.drop}）`,
    )
  }
}

// ── [2] 高溫現在真的會影響決策 ───────────────────────────────────────────────

section('[2] 高溫進入 EV — 修好「高溫事件對期望值毫無影響」')

const noHeat = calculateExpectedValue(outdoorL2, weather({
  rainfall_probability: 0, temperature_celsius: 28, apparent_temperature_celsius: 28,
}), DEFAULT_CONFIG)
assert(noHeat.score_drop === 0, `不熱不下雨 → 落差 0（實際 ${noHeat.score_drop}）`)

const hot = calculateExpectedValue(outdoorL2, weather({
  type: 'high_temperature', rainfall_probability: 0,
  temperature_celsius: 34, apparent_temperature_celsius: 36,
}), DEFAULT_CONFIG)
assert(hot.score_drop !== null && hot.score_drop > 0,
  `體感 36°C、零降雨 → 落差 ${hot.score_drop} > 0（修改前恆為 0）`)
assert(hot.heat_impact_factor === 0.5, `H=0.5（實際 ${hot.heat_impact_factor}）`)

const veryHot = calculateExpectedValue(outdoorL2, weather({
  type: 'high_temperature', rainfall_probability: 0,
  temperature_celsius: 36, apparent_temperature_celsius: 39,
}), DEFAULT_CONFIG)
assert(veryHot.score_drop! > hot.score_drop!, `體感 39°C 落差 ${veryHot.score_drop} > 36°C 的 ${hot.score_drop}`)

const hotIndoor = calculateExpectedValue(indoorL2, weather({
  type: 'high_temperature', rainfall_probability: 0,
  temperature_celsius: 36, apparent_temperature_celsius: 39,
}), DEFAULT_CONFIG)
assert(hotIndoor.score_drop! < veryHot.score_drop!,
  `同樣體感 39°C，室內落差 ${hotIndoor.score_drop} < 戶外 ${veryHot.score_drop}`)

section('[2b] 高溫判定以體感為準，不是氣溫')
assert(heatImpactFactor(36, 30) === 0.5, '體感 36 / 氣溫 30 → 以體感判定 H=0.5')
assert(heatImpactFactor(30, 36) === 0, '體感 30 / 氣溫 36 → 以體感判定 H=0（人不覺得熱就不是高溫事件）')
assert(heatImpactFactor(null, 36) === 0.5, '體感未取得 → 退回氣溫')
assert(highTemperatureSeverity(39, null) === 'critical', '體感 39 → critical')
assert(highTemperatureSeverity(36, null) === 'high', '體感 36 → high')
assert(highTemperatureSeverity(28, null) === null, '體感 28 → 不觸發')

// ── [3] 未取得 ≠ 預設值 ──────────────────────────────────────────────────────

section('[3] 「未取得」不得被補成預設值（先前是 ?? 25）')

assert(heatImpactFactor(null, null) === null, '體感與氣溫皆未取得 → H 為 null（不是 0＝不熱）')
assert(highTemperatureSeverity(null, null) === null, '溫度全無 → 無法判定高溫（不是「不熱」）')

const bothUnknown = calculateExpectedValue(outdoorL2, weather({
  rainfall_probability: null, temperature_celsius: null, apparent_temperature_celsius: null,
}), DEFAULT_CONFIG)
assert(bothUnknown.expected_value_current === null, 'EV 為 null 而非 0')
assert(bothUnknown.score_drop === null, '落差為 null 而非 0')
assert(bothUnknown.should_trigger_contingency === false, '無輸入時不觸發應變')
assert(bothUnknown.confidence === 0, `信心度為 0（實際 ${bothUnknown.confidence}）`)

const rainOnly = calculateExpectedValue(outdoorL2, weather({
  rainfall_probability: 0.8, temperature_celsius: null, apparent_temperature_celsius: null,
}), DEFAULT_CONFIG)
assert(rainOnly.inputs_known.rainfall === true && rainOnly.inputs_known.heat === false,
  'inputs_known 如實記錄「有降雨、無溫度」')
assert(rainOnly.confidence < 0.9, `輸入不完整時信心度下降（${rainOnly.confidence} < 0.9）`)
assert(rainOnly.expected_value_current !== null, '仍算得出 EV（降雨那一項有值）')

// ── [4] CWA 解析：缺值回 null ────────────────────────────────────────────────

section('[4] parseCwaConditions — CWA 的 "-" 與缺欄位一律回 null')

const realShape = {
  WeatherElement: [
    { ElementName: '溫度', Time: [{ DataTime: 't', ElementValue: [{ Temperature: '31' }] }] },
    { ElementName: '體感溫度', Time: [{ DataTime: 't', ElementValue: [{ ApparentTemperature: '36' }] }] },
    { ElementName: '風速', Time: [{ DataTime: 't', ElementValue: [{ WindSpeed: '4' }] }] },
    { ElementName: '相對濕度', Time: [{ DataTime: 't', ElementValue: [{ RelativeHumidity: '78' }] }] },
    { ElementName: '3小時降雨機率', Time: [{ StartTime: 's', ElementValue: [{ ProbabilityOfPrecipitation: '70' }] }] },
  ],
}
const parsed = parseCwaConditions(realShape)
assert(parsed.temperature === 31, `溫度 31（實際 ${parsed.temperature}）`)
assert(parsed.apparent_temperature === 36, `體感 36（實際 ${parsed.apparent_temperature}）`)
assert(parsed.wind_speed_ms === 4, `風速 4（實際 ${parsed.wind_speed_ms}）`)
assert(parsed.relative_humidity_percent === 78, `濕度 78（實際 ${parsed.relative_humidity_percent}）`)
assert(parsed.rainfall_probability === 0.7, `降雨 0.7（實際 ${parsed.rainfall_probability}）`)

const dashShape = {
  WeatherElement: [
    { ElementName: '溫度', Time: [{ DataTime: 't', ElementValue: [{ Temperature: '-' }] }] },
    { ElementName: '3小時降雨機率', Time: [{ StartTime: 's', ElementValue: [{ ProbabilityOfPrecipitation: '-' }] }] },
  ],
}
const dashed = parseCwaConditions(dashShape)
assert(dashed.temperature === null, 'CWA 回 "-" → null（不是 25，也不是 0）')
assert(dashed.rainfall_probability === null, '降雨 "-" → null（不是 0＝不會下雨）')
assert(parseCwaConditions({}).temperature === null, '整個 WeatherElement 缺失 → null 不拋錯')
assert(parseCwaConditions({ WeatherElement: [] }).apparent_temperature === null, '沒有體感溫度元素 → null')

// ── [5] 警特報容錯解析 ───────────────────────────────────────────────────────

section('[5] parseHazard — 結構未經觀察，必須容錯且保留 raw')

const hz = parseHazard({
  info: { phenomena: '大雨特報', significance: '特報' },
  validTime: { startTime: '2026-08-04 12:00:00', endTime: '2026-08-04 18:00:00' },
})
assert(hz.phenomena === '大雨特報', `解析出 phenomena（${hz.phenomena}）`)
assert(hz.significance === '特報', `解析出 significance（${hz.significance}）`)
assert(hz.start_time === '2026-08-04 12:00:00', '解析出 startTime')

const weird = parseHazard({ SomeUnknownShape: { x: 1 } })
assert(weird.phenomena === null, '無法辨識的結構 → phenomena 為 null 而非亂猜')
assert(weird.raw !== null && weird.raw !== undefined,
  'raw 必須保留 —— 這是真的發特報時唯一能看到實際結構的依據')

// ── 收尾 ────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(55)}`)
console.log(`通過 ${passed} 項，失敗 ${failed} 項`)
console.log('═'.repeat(55))
if (failed > 0) process.exitCode = 1
