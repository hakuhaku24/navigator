/**
 * contingency-addressing.test.ts — 應變管線的資料庫定址與 null 處理
 *
 * 守護 0-4 這次改動：`/api/contingency` 從「只認靜態 45 筆」改成「先查
 * poi_catalog、查不到才退回靜態表」。
 *
 * 改動前的問題（CLAUDE.md §9「下一步如果要選一個做」）：
 *   route.ts 是 `POIS.find(p => p.id === poi_id)`，查不到直接 404
 *   → TDX 匯入的任何新景點都**不能使用天氣應變**
 *   → 而應變是本專案兩大賣點之一
 *
 * 同時守護一個邊界 bug：`rowToPOI` 原本寫 `Boolean(md.is_indoor)`。
 * poi_catalog 的 is_indoor 現在可能是 null（未判定），而 `Boolean(null)` 是
 * false——等於在資料庫與應變管線的交界處，把「不知道」偷偷變成「已知是戶外」，
 * 正是 2026-05-06 那批壞掉的方式。
 *
 * 執行：npx ts-node tests/contingency-addressing.test.ts
 */

import { rowToPOI, type CatalogRow } from '../../contingency-handler/src/poi-catalog-client'

let pass = 0, fail = 0
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}\n       got : ${g}\n       want: ${w}`) }
}

/** 造一筆 poi_catalog row；預設是「已判定為室內」的正常資料 */
function row(meta: Record<string, unknown> = {}, over: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id: 'uuid-1',
    source_id: 'NCA-003',
    name: '朱銘美術館',
    description: '戶外雕塑園區與室內展館',
    lat: 25.23,
    lng: 121.63,
    tags: ['藝術'],
    similarity: 0.8,
    metadata: { region: '北海岸', level: 2, is_indoor: true, ...meta },
    ...over,
  } as CatalogRow
}

// ── 1. is_indoor 的三態必須分得開 ───────────────────────────────────────────

console.log('\n[1] is_indoor 三態：true / false / null（未判定）')

const indoor = rowToPOI(row({ is_indoor: true }))!
eq('明確 true → is_indoor=true', indoor.is_indoor, true)
eq('明確 true → 標記為已驗證', indoor.is_indoor_verified, true)
eq('明確 true → space_type 為 indoor', indoor.space_type, 'indoor')

const outdoor = rowToPOI(row({ is_indoor: false }))!
eq('明確 false → is_indoor=false', outdoor.is_indoor, false)
eq('明確 false → 標記為已驗證（false 是判定結果，不是缺值）',
  outdoor.is_indoor_verified, true)

// 這一組是重點：null 不可以跟 false 長得一樣
const unknown = rowToPOI(row({ is_indoor: null }))!
eq('null → is_indoor 保守推定為 false', unknown.is_indoor, false)
eq('null → **標記為未驗證**（與明確 false 區分開）',
  unknown.is_indoor_verified, false)

const missing = rowToPOI(row({}, {}))
eq('欄位完全缺席 → 同樣標記為未驗證',
  rowToPOI({ ...row(), metadata: { region: '北海岸' } })!.is_indoor_verified, false)

// 保守推定為戶外的方向性：α 取 0.10 會傾向「建議替換」。
// 對使用者而言，多看到一個不需要的建議，好過該避雨時沒收到提醒。
eq('null → space_type 推定為 outdoor（觸發應變的安全方向）',
  unknown.space_type, 'outdoor')

// ── 2. 定址欄位：source_id 優先，不可退化成 UUID ────────────────────────────
//
// 2026-07-28 修過一次同類 bug：explore 傳 poi_catalog 的 UUID 而非 NCA-xxx，
// 下游全部以 source_id 定址，導致該路徑「一定」查無景點。這裡守住不再發生。

console.log('\n[2] poi_id 必須是 source_id（NCA-xxx）而非 UUID')

eq('有 source_id 時用 source_id',
  rowToPOI(row())!.poi_id, 'NCA-003')

eq('沒有 source_id 才退回 UUID（且不應該發生）',
  rowToPOI(row({}, { source_id: undefined }))!.poi_id, 'uuid-1')

// ── 3. 座標缺失必須整筆丟棄（不可用 0,0 頂替）───────────────────────────────
//
// 距離計算與半徑篩選全靠座標。用 0,0 頂替會讓景點落在幾內亞灣外海，
// 半徑一算就永遠被濾掉——或更糟，變成「離現在位置超近」。

console.log('\n[3] 座標缺失處理')

eq('缺 lat → 回 null（整筆丟棄）',
  rowToPOI(row({}, { lat: undefined })), null)
eq('缺 lng → 回 null', rowToPOI(row({}, { lng: undefined })), null)
eq('lat 是字串 → 回 null（型別不對不可硬轉）',
  rowToPOI(row({}, { lat: '25.23' as unknown as number })), null)

// ── 4. 天氣敏感度中英文都要吃得下 ───────────────────────────────────────────
//
// seed.sql 寫中文（'低'），poi_catalog ingest 寫英文（'low'），
// 兩種都存在於真實資料中。

console.log('\n[4] weather_sensitivity 中英文正規化')

eq("英文 'low' → low", rowToPOI(row({ weather_sensitivity: 'low' }))!.weather_sensitivity, 'low')
eq("中文 '高' → high", rowToPOI(row({ weather_sensitivity: '高' }))!.weather_sensitivity, 'high')
eq("中文 '極高' → extreme", rowToPOI(row({ weather_sensitivity: '極高' }))!.weather_sensitivity, 'extreme')
eq('缺值 → medium', rowToPOI(row())!.weather_sensitivity, 'medium')
eq('不認得的值 → medium（不可回 undefined 讓下游炸開）',
  rowToPOI(row({ weather_sensitivity: '???' }))!.weather_sensitivity, 'medium')

// ── 5. 其他欄位帶入 ─────────────────────────────────────────────────────────

console.log('\n[5] region / category 必須帶進 POI')
// 這兩個欄位是這次新增到 ContingencyCandidate 的——前端靠它們渲染候選卡片，
// 不再需要回頭查靜態 pois.ts（那正是把新景點整筆丟掉的原因）

eq('region 帶入', rowToPOI(row())!.region, '北海岸')
eq('category 帶入', rowToPOI(row({ category: '藝術展館' }))!.category, '藝術展館')
eq('level 帶入', rowToPOI(row({ level: 0 }))!.level, 0)
eq('level 缺值 → 預設 2', rowToPOI(row({ level: undefined }))!.level, 2)

console.log(`\n${'═'.repeat(55)}`)
console.log(`通過 ${pass} 項，失敗 ${fail} 項`)
console.log(`${'═'.repeat(55)}\n`)
process.exit(fail > 0 ? 1 : 0)
