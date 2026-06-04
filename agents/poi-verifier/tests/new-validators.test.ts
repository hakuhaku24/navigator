/**
 * P0 + P1 新驗證器整合測試
 * 執行：ts-node tests/new-validators.test.ts
 *
 * 測試範圍：
 *   [P0] official-website.ts — robots.txt 遵守、URL 自動發現、HTML 萃取
 *   [P1] ptt-search.ts       — PTT HTML 解析、日期推算、版別過濾
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '../../../.env.local' })

import { searchPttPosts, latestPttDate } from '../src/validators/ptt-search'
import { fetchOfficialWebsite }           from '../src/validators/official-website'
import type { PoiInput }                  from '../src/types'

// ── 測試工具 ─────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) {
    console.log(`  ✅  ${label}`)
    passed++
  } else {
    console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

function section(title: string) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

// ── P1 PTT 測試 ───────────────────────────────────────────────────────────────

async function testPtt() {
  section('[P1] PTT 旅遊版搜尋')

  // --- 1. 熱門景點應有複數文章 ---
  console.log('\n1. 竹子湖海芋（熱門景點，travel + Hiking 版應有文章）')
  const poi1: PoiInput = {
    name: '竹子湖海芋',
    location: { latitude: 25.168, longitude: 121.541 },
  }
  const posts1 = await searchPttPosts(poi1)
  console.log(`   找到 ${posts1.length} 篇`)
  posts1.slice(0, 3).forEach(p =>
    console.log(`   [${p.board}] [${p.published_date ?? '日期不明'}] ${p.title}`)
  )
  assert(posts1.length > 0, '竹子湖海芋應有 PTT 搜尋結果')
  assert(
    posts1.every(p => p.url.startsWith('https://www.ptt.cc/bbs/')),
    '所有 URL 格式正確',
    posts1.find(p => !p.url.startsWith('https://www.ptt.cc/bbs/'))?.url,
  )

  // --- 2. 日期格式驗證 ---
  console.log('\n2. 日期格式應為 YYYY-MM-DD 或 null')
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
  const badDates = posts1
    .map(p => p.published_date)
    .filter(d => d !== null && !ISO_RE.test(d))
  assert(badDates.length === 0, '所有解析出的日期格式正確', badDates.join(', '))

  // --- 3. latestPttDate ---
  const latest = latestPttDate(posts1)
  console.log(`\n3. latestPttDate = ${latest ?? '(無日期)'}`)
  if (posts1.some(p => p.published_date)) {
    assert(!!latest, 'latestPttDate 應回傳非空字串')
    assert(!latest || ISO_RE.test(latest), 'latestPttDate 格式正確', latest)
    // 不應是未來日期
    if (latest) {
      assert(
        new Date(latest).getTime() <= Date.now() + 2 * 86_400_000,
        '最新日期不晚於今天 + 2 天（年份推算正確）',
        latest,
      )
    }
  }

  // --- 4. 不存在的景點應回傳空陣列（不 crash）---
  console.log('\n4. 不存在的假景點（應回傳空陣列，不崩潰）')
  const poi2: PoiInput = {
    name: '台北星球大戰銀河主題樂園zzz',
    location: { latitude: 25.033, longitude: 121.565 },
  }
  const posts2 = await searchPttPosts(poi2)
  console.log(`   找到 ${posts2.length} 篇（預期 0）`)
  assert(posts2.length === 0, '假景點 PTT 應無結果')

  // --- 5. 九份（另一個常見景點，Taipei 版應有） ---
  console.log('\n5. 九份（Taipei + travel 版）')
  const poi3: PoiInput = {
    name: '九份',
    location: { latitude: 25.108, longitude: 121.845 },
  }
  const posts3 = await searchPttPosts(poi3)
  console.log(`   找到 ${posts3.length} 篇`)
  posts3.slice(0, 2).forEach(p =>
    console.log(`   [${p.board}] [${p.published_date ?? '?'}] ${p.title.slice(0, 50)}`)
  )
  assert(posts3.length > 0, '九份應有 PTT 搜尋結果')
}

// ── P0 官網測試 ───────────────────────────────────────────────────────────────

async function testOfficialWebsite() {
  section('[P0] 景點官網驗證')

  // --- 1. 已知 URL 直接抓取（陽明山國家公園官網） ---
  console.log('\n1. 已知 URL：陽明山國家公園 https://www.ymsnp.gov.tw/')
  const poi1: PoiInput = {
    name: '陽明山國家公園',
    location: { latitude: 25.157, longitude: 121.548 },
  }
  const site1 = await fetchOfficialWebsite(poi1, 'https://www.ymsnp.gov.tw/')
  console.log(`   is_reachable  : ${site1?.is_reachable}`)
  console.log(`   page_title    : ${site1?.page_title}`)
  console.log(`   last_modified : ${site1?.last_modified ?? '(伺服器未回傳)'}`)
  console.log(`   excerpt(60字) : ${site1?.excerpt.slice(0, 60)}...`)
  assert(site1 !== null, '官網回傳非 null')
  assert(site1?.is_reachable === true, 'ymsnp.gov.tw 應可連線')
  assert(!!site1?.page_title, '應有頁面標題')
  assert((site1?.excerpt.length ?? 0) > 20, '摘要應有實質內容')

  // --- 2. 不提供 URL，靠 DDG 自動發現 ---
  console.log('\n2. URL 自動發現：國立故宮博物院')
  const poi2: PoiInput = {
    name: '國立故宮博物院',
    location: { latitude: 25.102, longitude: 121.548 },
  }
  const site2 = await fetchOfficialWebsite(poi2)  // 不帶 websiteUrl
  console.log(`   發現 URL      : ${site2?.url ?? '(找不到)'}`)
  console.log(`   is_reachable  : ${site2?.is_reachable}`)
  console.log(`   page_title    : ${site2?.page_title}`)
  if (site2) {
    // 驗證重點：DDG 找到的 URL 指向故宮相關網域，URL 發現邏輯正確
    // npm.gov.tw 本體回應時間不穩定（有時 > 12s），is_reachable 不做強制斷言
    const isPmUrl = site2.url.toLowerCase().includes('npm') ||
                    site2.url.toLowerCase().includes('palace') ||
                    site2.url.toLowerCase().includes('gov.tw')
    assert(isPmUrl, `DDG 發現的 URL 應為故宮相關網域（${site2.url}）`)
    if (!site2.is_reachable) {
      console.log('   ⚠️  故宮官網本次回應超時（npm.gov.tw 已知較慢，URL 發現正確即可）')
    }
  } else {
    console.log('   ⚠️  DDG 自動發現未找到結果（非必要失敗）')
  }

  // --- 3. 完全不存在的景點（不崩潰即可；DDG 模糊搜尋可能找到誤報 URL） ---
  console.log('\n3. 假景點（不崩潰即可，DDG 模糊搜尋可能誤報）')
  const poi3: PoiInput = {
    name: '台北星球大戰銀河主題樂園zzz',
    location: { latitude: 25.033, longitude: 121.565 },
  }
  const site3 = await fetchOfficialWebsite(poi3)
  if (site3 === null) {
    console.log('   result: null（DDG 無結果）')
  } else {
    console.log(`   result: is_reachable=${site3.is_reachable}, url=${site3.url}`)
    console.log('   ⚠️  DDG 找到模糊符合的 URL（正常現象，由 LLM 做最終判斷）')
  }
  // 不管有無結果，只要不 throw 就算通過；OfficialWebsiteRaw 欄位格式正確才重要
  assert(
    site3 === null || typeof site3.is_reachable === 'boolean',
    '回傳值為 null 或結構正確的 OfficialWebsiteRaw（不崩潰）',
  )
  if (site3 !== null) {
    assert(typeof site3.url === 'string' && site3.url.startsWith('http'), '若有結果，url 格式正確')
  }

  // --- 4. robots.txt 白名單驗證 ---
  // 用一個幾乎確定 robots.txt 允許的 .gov.tw 網站
  console.log('\n4. robots.txt 遵守（.gov.tw 應允許）')
  const poi4: PoiInput = {
    name: '太魯閣國家公園',
    location: { latitude: 24.157, longitude: 121.617 },
  }
  const site4 = await fetchOfficialWebsite(poi4, 'https://www.taroko.gov.tw/')
  console.log(`   is_reachable  : ${site4?.is_reachable}`)
  console.log(`   page_title    : ${site4?.page_title}`)
  assert(site4 !== null, '太魯閣官網應回傳非 null')
  assert(site4?.is_reachable === true, '太魯閣 .gov.tw 應可連線（robots.txt 允許）')
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║   P0 + P1 新驗證器整合測試                              ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log(`執行時間：${new Date().toLocaleString('zh-TW')}`)

  await testPtt()
  await testOfficialWebsite()

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  結果：${passed} 通過 ／ ${failed} 失敗`)
  if (failed > 0) {
    console.error('  ❌ 有測試失敗，請檢查上方輸出')
    process.exit(1)
  } else {
    console.log('  ✅ 全部通過')
  }
}

main().catch(err => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
