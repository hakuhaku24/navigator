/**
 * firecrawl-demo.ts — Firecrawl 在 Navigator POI Verifier 的使用指南
 *
 * 涵蓋：
 *   1. 安裝與設定
 *   2. 兩個合理的使用情境（Scrape / Crawl）
 *   3. 不該做的事
 *   4. 成本分析與現有 API 比較
 *
 * Usage: npx ts-node firecrawl-demo.ts
 *
 * ─── 安裝 ────────────────────────────────────────────────────────────────────
 *
 * 方法 A：Firecrawl JS SDK（直接整合進 TypeScript pipeline）
 *   npm install @mendable/firecrawl-js
 *   在 .env.local 加：FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxxxxx
 *   申請：https://www.firecrawl.dev → Sign Up → 免費 500 scrapes/月
 *
 * 方法 B：pp-firecrawl CLI（快速手動測試，不需要寫程式）
 *   npm install -g @printing-press/firecrawl   # 全域安裝
 *   pp-firecrawl scrape --url "https://xxx"    # 抓單頁
 *   pp-firecrawl crawl --url "https://xxx"     # 爬整站
 *   pp-firecrawl search --query "陽明山景點"   # 搜尋+抓內容
 *   適合用途：開發階段手動驗證頁面結構，不用寫一次性測試腳本
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '../../.env.local' })

// ── 型別（若 SDK 已安裝，改成 import FirecrawlApp from '@mendable/firecrawl-js'）
interface ScrapeResult {
  success: boolean
  markdown?: string
  metadata?: { title?: string; description?: string; publishedDate?: string }
  error?: string
}

interface CrawlResult {
  success: boolean
  data?: Array<{ url: string; markdown?: string; metadata?: { title?: string } }>
  error?: string
}

// ── Firecrawl API 薄封裝（不裝 SDK 也能跑，方便看清楚實際呼叫）─────────────

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1'

async function firecrawlScrape(url: string): Promise<ScrapeResult> {
  const key = process.env.FIRECRAWL_API_KEY
  if (!key) return { success: false, error: 'FIRECRAWL_API_KEY 未設定' }

  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      url,
      formats: ['markdown'],          // 只要純文字，不要 HTML
      onlyMainContent: true,          // 自動剔除導覽列、廣告、footer
      excludeTags: ['nav', 'footer', 'aside', 'script', 'style'],
    }),
  })
  if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
  return res.json()
}

async function firecrawlCrawl(seedUrl: string, maxPages = 30): Promise<CrawlResult> {
  const key = process.env.FIRECRAWL_API_KEY
  if (!key) return { success: false, error: 'FIRECRAWL_API_KEY 未設定' }

  const res = await fetch(`${FIRECRAWL_BASE}/crawl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      url: seedUrl,
      limit: maxPages,               // 最多爬幾頁，省額度
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
      },
      // 只跟相同 domain 的連結，不跑去外站
      allowBackwardCrawling: false,
      allowExternalLinks: false,
    }),
  })
  if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
  return res.json()
}

// ═══════════════════════════════════════════════════════════════════════════════
// 使用情境 A：補強 11 筆薄內容 POI 的部落格資料（Scrape 模式）
//
// 適用時機：
//   - 你已有 URL（DDG/Serper 找到了連結）
//   - 但 snippet 只有 120 字，不足以讓 LLM 萃取有用洞察
//   - 頁面是 JS 渲染的（痞客邦現代版、方格子 vocus.cc 等）
//
// 在現有 pipeline 的位置：
//   searchBlogPosts() 回傳 BlogPostRaw[] → [這裡] → buildUserPrompt()
//   把 b.snippet.slice(0, 120) 換成 firecrawlScrape(b.url) 的正文前 800 字
// ═══════════════════════════════════════════════════════════════════════════════

async function demoScrapeForThinPoi() {
  console.log('\n═══ 情境 A：補強薄內容 POI 的部落格全文 ═══')

  // 示範用：夢幻湖（YMS-008）是 11 筆薄內容之一
  const mockBlogUrl = 'https://www.pixnet.net/pcard/example-menghuanhu-post'

  console.log(`目標 URL: ${mockBlogUrl}`)
  console.log('（實際執行需有效 URL，此處僅示意呼叫方式）\n')

  if (!process.env.FIRECRAWL_API_KEY) {
    console.log('[skip] FIRECRAWL_API_KEY 未設定，展示預期輸出格式：')
    console.log({
      success: true,
      markdown: '## 夢幻湖一日遊記\n\n夢幻湖位於陽明山七星山南麓...\n交通：搭 小15 至終點站...\n注意：湖區封閉期間（每年 11-3 月）部分步道管制...',
      metadata: { title: '【陽明山】夢幻湖完整攻略 2025', publishedDate: '2025-10-15' },
    })
    return
  }

  const result = await firecrawlScrape(mockBlogUrl)
  if (!result.success) {
    console.warn('Scrape 失敗:', result.error)
    return
  }

  // 只取前 800 字傳給 LLM（token 控管）
  const contentForLLM = result.markdown?.slice(0, 800) ?? ''
  console.log('萃取到正文（前 800 字）:')
  console.log(contentForLLM)
  console.log('\n發布日期:', result.metadata?.publishedDate ?? '未偵測到')
}

// ═══════════════════════════════════════════════════════════════════════════════
// 使用情境 B：爬取新景點（Crawl 模式）— Post-demo 功能
//
// 適用時機：
//   - 要從 45 筆擴充到更多 POI
//   - 從觀光局、縣市旅遊網等授權來源批次發現新景點
//   - DDG/Serper/Tavily 都是搜單筆，只有 Crawl 能遍歷整個景點列表頁
//
// 注意：此情境超出目前 MVP 範圍，Demo 前不應實作
// ═══════════════════════════════════════════════════════════════════════════════

async function demoCrawlForNewLocations() {
  console.log('\n═══ 情境 B：爬取新景點（Post-demo 才用）═══')

  // 觀光署北海岸景點列表（授權公開資料）
  const seedUrl = 'https://www.northguan-nsa.gov.tw/user/Article.aspx?Lang=1&SNo=04002590'

  console.log(`Seed URL: ${seedUrl}`)
  console.log('預期行為：Firecrawl 遍歷同 domain 連結 → 回傳每個景點子頁面的 markdown')
  console.log('回傳格式示意：')
  console.log([
    { url: 'https://...野柳...',  title: '野柳地質公園', markdown: '...' },
    { url: 'https://...老梅...',  title: '老梅綠石槽',   markdown: '...' },
    { url: 'https://...富貴角...', title: '富貴角燈塔',   markdown: '...' },
  ])

  if (!process.env.FIRECRAWL_API_KEY) {
    console.log('\n[skip] FIRECRAWL_API_KEY 未設定，略過實際呼叫')
    return
  }

  console.log(`\n開始爬取（上限 30 頁）...`)
  const result = await firecrawlCrawl(seedUrl, 30)

  if (!result.success) {
    console.warn('Crawl 失敗:', result.error)
    return
  }

  console.log(`爬取完成，共 ${result.data?.length ?? 0} 頁`)
  result.data?.slice(0, 3).forEach(page => {
    console.log(`  ${page.url}`)
    console.log(`  標題: ${page.metadata?.title ?? '無'}`)
    console.log(`  正文長度: ${page.markdown?.length ?? 0} 字`)
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 不該做的事
// ═══════════════════════════════════════════════════════════════════════════════

function printDonts() {
  console.log(`
═══ 不該做的事 ═══

❌ 用 Scrape 取代 DDG/Serper 搜尋
   Firecrawl Scrape 需要已知 URL，它不能幫你找 URL。
   搜尋（找 URL）和抓取（讀頁面）是兩個不同步驟。

❌ 用 Scrape 修復 11 筆薄內容 POI 的 76% 命中率問題
   命中率低是因為網路上對這些景點的優質內容根本不存在，
   抓再完整也只是抓到更多廢話。根本原因不在抓取深度。
   → 見 KNOWN_ISSUES.md 2026-05-17 條目

❌ 每次驗證都 Scrape 全部 45 筆 POI
   45 筆 × 2 篇 = 90 次/跑。每月跑兩次就 180 次，逼近免費額度 500。
   加上 LLM token 增加（每筆多 ~600 token），成本不划算。
   正確做法：只對已有 URL 且 snippet < 50 字的筆觸發 Scrape。

❌ Demo 前實作 Crawl 模式擴充景點
   CLAUDE.md 明確將新景點發現列為 Out of scope。
   Crawl 一次可能吃掉 50–200 個免費額度，Demo 前不值得。

❌ 以為 pp-firecrawl CLI 比 Firecrawl SDK 功能更強
   pp-firecrawl 是 CLI 包裝，底層 API 相同。
   多的只有 terminal 介面、批次指令、MCP 整合。
   生產環境用 SDK，手動測試用 CLI。

❌ 用 Crawl 爬社群平台（Instagram、Facebook、PTT）
   這些平台有反爬機制，Firecrawl 也承認成功率不穩定。
   PTT 用直接 fetch https://www.ptt.cc/bbs/ 就夠了。
`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 成本分析
// ═══════════════════════════════════════════════════════════════════════════════

function printCostAnalysis() {
  console.log(`
═══ 成本分析：Firecrawl vs 現有 Blog 相關 API ═══

┌─────────────────┬──────────────┬──────────────┬─────────────────────────────┐
│ 工具            │ 免費額度     │ 付費單價     │ Navigator 月用量估算        │
├─────────────────┼──────────────┼──────────────┼─────────────────────────────┤
│ DDG (Python)    │ 無限制       │ 免費         │ ~45 次/批，主要搜尋         │
│ Serper          │ 2,500（一次）│ $0.001/次    │ ~15 次/批（DDG fallback）   │
│ Tavily basic    │ 1,000/月重置 │ $0.005/次    │ 尚未實作，設計上取代 DDG    │
│ Tavily advanced │ 同上         │ $0.008/次    │ 含完整正文，可取代 Firecrawl│
│ Firecrawl scrape│ 500/月       │ $0.0053/次   │ 若只補薄內容：11 次/批      │
│ Firecrawl crawl │ 同上（共用） │ 同上/頁      │ Post-demo：50–200 頁/次     │
└─────────────────┴──────────────┴──────────────┴─────────────────────────────┘

情境試算（每月跑 2 次驗證批次）：

  現行架構（DDG + Serper）：
    DDG:    90 次 → NT$0
    Serper: 30 次 → NT$0（剩餘額度內）
    月成本: NT$0

  加入 Firecrawl Scrape（只補 11 筆薄內容）：
    Firecrawl: 11 筆 × 2 次/月 = 22 次 → 免費額度 500 內 → NT$0
    LLM token 增加: 22 × 600 token × $0.002/1k = NT$0.03
    月增加成本: ~NT$0.03（幾乎感受不到）

  Post-demo Crawl 擴充（爬觀光局景點列表，每次 100 頁）：
    Firecrawl: 100 頁/次 × 2 次 = 200 次/月 → 超出免費額度 300 頁
    超出部分: 需升級 Hobby $16/月（3,000 頁）→ NT$512/月
    月成本: NT$512（若每月擴充）

  若改用 Tavily advanced 取代 Firecrawl scrape：
    Tavily: 11 筆 × 2 = 22 次 → 1,000 免費額度內 → NT$0
    LLM token 增加: 約同上 → NT$0.03
    額外優勢: answer 欄位可降低 LLM 後處理負擔 ~30%
    → 對現有問題而言，Tavily advanced 比 Firecrawl 更划算

結論：
  Demo 階段：Firecrawl 成本幾乎為零，但效益也有限（11 筆薄內容不會變好）
  Post-demo  ：Crawl 模式有明確用途（新景點發現），月成本 NT$500 左右
  現在最划算：先實作 Tavily（KNOWN_ISSUES 建議方向），再視需求加 Firecrawl
`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

;(async () => {
  console.log('Firecrawl × Navigator POI Verifier — 使用指南 Demo\n')
  console.log('API Key 狀態:', process.env.FIRECRAWL_API_KEY ? '已設定 ✓' : '未設定（示意模式）')

  await demoScrapeForThinPoi()
  await demoCrawlForNewLocations()
  printDonts()
  printCostAnalysis()

  console.log('═══ 參考文件 ═══')
  console.log('  docs/search-providers-evaluation.md  — Tavily vs Serper 完整評估')
  console.log('  KNOWN_ISSUES.md                      — 11 筆薄內容根因分析')
  console.log('  src/validators/blog-search.ts        — 現行 DDG+Serper 實作')
})()
