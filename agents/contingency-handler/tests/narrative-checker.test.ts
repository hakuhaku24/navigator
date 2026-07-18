// Unit tests for the post-generation reflection check (narrative-checker).
// Run: npx ts-node tests/narrative-checker.test.ts

import { checkNarrative } from '../src/evaluators'
import type { ContingencyCandidate, POI } from '../src/types'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('✗', msg)
    process.exitCode = 1
  } else {
    console.log('✓', msg)
  }
}

function makePoi(id: string, name: string): POI {
  return {
    poi_id: id, name, level: 2, is_indoor: true,
    space_type: 'indoor', weather_sensitivity: 'low', tags: [],
    duration_min: 60, latitude: 25.0, longitude: 121.5,
  }
}

function makeCandidate(id: string, name: string): ContingencyCandidate {
  return {
    poi_id: id, name, distance_km: 1.0, level: 2, space_type: 'indoor',
    multi_criteria_score: 80,
    score_breakdown: {
      weather_fit: 100, distance_score: 90, availability_score: 100,
      crowd_capacity_score: 80, group_preference_match: 60, rating_score: 80,
    },
    has_recent_positive_reviews: true, is_verified: true,
    last_info_update_age_days: 0, is_qualified: true,
    suitability_reason: 'test',
  }
}

const current = makePoi('CUR-1', '老梅綠石槽')
const museum  = makePoi('OK-1', '朱銘美術館')
const shop    = makePoi('OK-2', '北海岸特產專賣店 (劉家肉粽)')
const closed  = makePoi('BAD-1', '倒店咖啡廳')
const outdoor = makePoi('BAD-2', '富貴角燈塔')

const ctx = {
  currentPoi: current,
  recommended: [makeCandidate('OK-1', museum.name), makeCandidate('OK-2', shop.name)],
  disqualified: [
    { poi_id: 'BAD-1', reason: '永久歇業' },
    { poi_id: 'BAD-2', reason: '開放式戶外，天氣不適合' },
  ],
  pool: [current, museum, shop, closed, outdoor],
}

// ── 合格案例 ──────────────────────────────────────────────────────────────

let r = checkNarrative('因應天氣變化，推薦您改去室內的朱銘美術館，享受不受天氣影響的樂趣。', ctx)
assert(r.ok, '提及推薦候選 → 通過')

r = checkNarrative('老梅綠石槽雨天體驗較差，建議改往朱銘美術館。', ctx)
assert(r.ok, '提及原景點＋推薦候選 → 通過')

// 括號變體：LLM 常省略括號註記
r = checkNarrative('建議改去北海岸特產專賣店躲雨，順便吃點在地美食。', ctx)
assert(r.ok, '提及推薦候選的基底名（去括號）→ 通過')

// ── 違規案例 ──────────────────────────────────────────────────────────────

r = checkNarrative('建議改去倒店咖啡廳喝杯咖啡避雨。', ctx)
assert(!r.ok, '提及已淘汰景點 → 攔下')
assert(r.violations.some(v => v.includes('永久歇業')), '違規訊息帶出淘汰理由')

r = checkNarrative('大雨天推薦富貴角燈塔看海景。', ctx)
assert(!r.ok, '提及被天氣規則淘汰的景點 → 攔下')

r = checkNarrative('', ctx)
assert(!r.ok, '空敘述 → 攔下')

r = checkNarrative('**推薦**：\n- 朱銘美術館', ctx)
assert(!r.ok, 'markdown 格式 → 攔下')

r = checkNarrative('好'.repeat(201), ctx)
assert(!r.ok, '超長敘述 → 攔下')

// 幻覺景點（名字在池內但既非推薦也非淘汰——例如半徑外被過濾掉的）不在 pool 時
// 無法比對，此為已知邊界：檢查器只保證「池內名字」的封閉性。
r = checkNarrative('推薦朱銘美術館，記得帶傘。', ctx)
assert(r.ok, '正常敘述不誤殺')

console.log(process.exitCode ? '\n有測試失敗' : '\n全部通過')
