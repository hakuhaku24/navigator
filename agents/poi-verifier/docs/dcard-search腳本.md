# Dcard 旅遊版爬蟲腳本（手動執行，未整合至主管線）

> **為何不整合進主程式碼：**
> 1. Dcard ToS 第 4 條明確禁止自動化爬蟲；整合進 CI/CD 在法律上風險高於 PTT
> 2. Dcard 為 React SPA，搜尋功能需 Playwright 才能完整操作（增加 200MB+ 依賴）
> 3. 未官方文件化的 `_api` 端點隨時可能改版（維護成本高）
>
> **使用情境：** 手動一次性驗證特定景點、教授 demo 前補充社群數據、
> 測試 POI 驗證邏輯時需要大量樣本。

---

## 風險摘要

| 面向 | 評估 |
|------|------|
| 法律風險 | ⚠️ 灰色地帶：ToS 禁止，但台灣目前無公開頁面爬蟲民事判決先例 |
| 個資風險 | ✅ 低：Dcard 作者為匿名代號，不含真實姓名 |
| 技術穩定性 | ⚠️ 中：`_api` 端點非官方，可能無預警改版 |
| 維護成本 | ⚠️ 中：需追蹤 rate limit 政策與 API 路由異動 |

---

## 方法一：JSON API 端點（不需 Playwright）

Dcard 的部分 API 端點不需 JavaScript 渲染即可直接用 `fetch` 呼叫。

### 安裝依賴

```bash
# 不需額外安裝，使用 Node.js 內建 fetch
```

### TypeScript 腳本

```typescript
// dcard-manual-search.ts
// 手動執行：ts-node dcard-manual-search.ts "竹子湖"
// ⚠️ 勿整合進 CI/CD 或定時任務，避免違反 Dcard ToS

const DCARD_API = 'https://www.dcard.tw/_api'

interface DcardPost {
  id: number
  title: string
  excerpt: string
  likeCount: number
  commentCount: number
  createdAt: string  // ISO 8601
  forumName: string
}

async function searchDcardPosts(keyword: string, forum = 'travel'): Promise<DcardPost[]> {
  // 請求間隔 ≥ 2 秒；每天 < 500 次請求（保守）
  const url = `${DCARD_API}/search/posts?` + new URLSearchParams({
    query: keyword,
    forum,
    limit: '20',
  })

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.dcard.tw/',
      'Accept': 'application/json',
    },
  })

  if (!res.ok) {
    console.error(`[dcard] HTTP ${res.status} — 可能被 rate limit 或端點改版`)
    return []
  }

  const data = await res.json()
  // 回傳格式：陣列 or { posts: [...] }，視版本而定
  return Array.isArray(data) ? data : (data.posts ?? [])
}

async function main() {
  const keyword = process.argv[2]
  if (!keyword) {
    console.error('用法：ts-node dcard-manual-search.ts "景點名稱"')
    process.exit(1)
  }

  const FORUMS = ['travel', 'food', 'taipei', 'taiwan']
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  for (const forum of FORUMS) {
    console.log(`\n--- 搜尋版別: ${forum} ---`)
    const posts = await searchDcardPosts(keyword, forum)

    if (!posts.length) {
      console.log('  無結果')
    } else {
      for (const p of posts) {
        console.log(`  [${p.createdAt.slice(0, 10)}] ❤️${p.likeCount} ${p.title}`)
        console.log(`    https://www.dcard.tw/f/${forum}/p/${p.id}`)
      }
    }

    await delay(2000)  // 每版別間隔 2 秒
  }
}

main().catch(console.error)
```

### 執行方式

```bash
cd agents/poi-verifier
npx ts-node dcard-manual-search.ts "陽明山竹子湖"
```

---

## 方法二：Playwright 完整搜尋（需要 JS 渲染）

Dcard 的前端搜尋頁（`/f/travel?search=...`）是 SPA，
需要 Playwright 才能拿到完整渲染後的結果。

### 安裝依賴

```bash
npm install --save-dev playwright
npx playwright install chromium
```

### TypeScript 腳本

```typescript
// dcard-playwright-search.ts
// ⚠️ 僅限手動 / 一次性研究用途，不得整合進 CI/CD

import { chromium } from 'playwright'

async function scrapeDcard(keyword: string): Promise<void> {
  const browser = await chromium.launch({ headless: true })
  const page    = await browser.newPage()

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'zh-TW,zh;q=0.9',
  })

  const searchUrl = `https://www.dcard.tw/f/travel?search=${encodeURIComponent(keyword)}`
  await page.goto(searchUrl, { waitUntil: 'networkidle' })

  // 等待文章列表載入
  await page.waitForSelector('[class*="PostEntry_container"]', { timeout: 10000 }).catch(() => null)

  const posts = await page.evaluate(() => {
    // 抓取標題、連結、愛心數
    const items = document.querySelectorAll('[class*="PostEntry_container"]')
    return Array.from(items).map(el => ({
      title:     el.querySelector('h2')?.textContent?.trim() ?? '',
      url:       (el.querySelector('a') as HTMLAnchorElement)?.href ?? '',
      likeCount: el.querySelector('[class*="like"]')?.textContent?.trim() ?? '0',
    }))
  })

  console.log(`找到 ${posts.length} 篇關於「${keyword}」的文章：`)
  for (const p of posts) {
    console.log(`  ❤️${p.likeCount.padStart(4)} ${p.title}`)
    console.log(`    ${p.url}`)
  }

  await browser.close()
}

const keyword = process.argv[2] ?? '陽明山'
scrapeDcard(keyword).catch(console.error)
```

### 執行方式

```bash
cd agents/poi-verifier
npx ts-node dcard-playwright-search.ts "竹子湖海芋"
```

---

## 整合進主管線的前提條件（若未來決定整合）

以下所有條件需同時滿足，才建議整合：

- [ ] 取得 Dcard 書面同意（發信至 service@dcard.tw 說明學術用途）
- [ ] 確認 `_api` 端點文件化或得到 Dcard 官方確認
- [ ] 每月請求量 < 1,000 次（僅用於 POI 驗證，非爬全站）
- [ ] 儲存欄位限制：標題、日期、愛心數、前 100 字摘要、文章連結（不存全文）
- [ ] 在 UI 顯示「資料來源：Dcard」並附連結

---

## 與現有架構的對應關係

若整合，Dcard 的分數貢獻與 PTT 相似（`blog_travel` 信度層、半衰期 180 天）：

```typescript
// validators/index.ts 中的加分邏輯（示意）
if (dcard.length) {
  const dcardTs = latestDcardDate(dcard) + 'T00:00:00Z'
  const dcardMeta = buildSourceMeta('blog_travel', dcardTs)
  score += Math.min(dcardMeta.confidence + (dcard.length >= 3 ? 0.05 : 0), 0.70) * 0.10
}
```

現階段以 PTT [P1] 覆蓋相同需求，Dcard 列為 P3（選用）。
