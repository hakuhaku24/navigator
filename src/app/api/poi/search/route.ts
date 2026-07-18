import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { searchPois, type SearchResponse } from '@/lib/poi-search'

// ── Request schema ────────────────────────────────────────────────────────────

const SearchRequestSchema = z.object({
  // 留空／不傳 → list 模式（瀏覽全部＋前端篩選），不呼叫 Gemini。見 poi-search.ts listPois()。
  query: z.string().max(200).optional(),
  scenario: z.enum(['heavy_rain', 'closure', 'fatigue']).optional(),
  vibe_tags: z.array(z.string()).max(10).optional(),
  filter: z.object({
    is_indoor: z.boolean().optional(),
    region: z.enum(['北海岸', '陽明山', '東北角']).optional(),
    level: z.array(z.number().int().min(0).max(3)).max(4).optional(),
  }).optional(),
  // list 模式（無 query）用這個上限撈全部候選；語意搜尋（有 query）通常用不到這麼多，見 poi-search.ts 的 top 預設值
  top: z.number().int().min(1).max(100).default(5),
  pool: z.number().int().min(5).max(50).default(20),
  alpha: z.number().min(0).max(1).default(0.5),
  include_debug: z.boolean().default(false),
})

type SearchRequest = z.infer<typeof SearchRequestSchema>

// ── POST /api/poi/search ───────────────────────────────────────────────────────
//
// 請求範例：
//   { "query": "下雨天室內景點" }
//   { "query": "適合拍照", "scenario": "heavy_rain", "filter": { "is_indoor": true } }
//   { "query": "陽明山古道", "filter": { "region": "陽明山" }, "top": 3 }

export async function POST(req: NextRequest): Promise<NextResponse<SearchResponse | { error: string }>> {
  // 解析 body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '請求 body 必須是合法的 JSON' }, { status: 400 })
  }

  // 驗證參數
  const parsed = SearchRequestSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    return NextResponse.json({ error: message }, { status: 422 })
  }

  const opts: SearchRequest = parsed.data

  try {
    const supabase = await createClient()
    const result = await searchPois(supabase, opts)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/poi/search]', message)

    // Supabase 連線失敗時（目前 DNS 解析異常），回傳明確錯誤
    if (message.includes('fetch failed') || message.includes('ENOTFOUND')) {
      return NextResponse.json({ error: 'Supabase 連線異常，請確認資料庫狀態' }, { status: 503 })
    }

    // Gemini API 失敗
    if (message.includes('GEMINI_API_KEY')) {
      return NextResponse.json({ error: 'Embedding API 金鑰未設定' }, { status: 500 })
    }

    return NextResponse.json({ error: '搜尋失敗，請稍後再試' }, { status: 500 })
  }
}

// ── GET /api/poi/search?q=... ─────────────────────────────────────────────────
//
// 快速查詢用，只支援 query 參數，其餘使用預設值。
// 適合前端搜尋框的即時查詢（不需要 scenario / filter）。

export async function GET(req: NextRequest): Promise<NextResponse<SearchResponse | { error: string }>> {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) {
    return NextResponse.json({ error: '缺少 q 參數' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const result = await searchPois(supabase, { query: q, top: 5 })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/poi/search]', message)

    if (message.includes('fetch failed') || message.includes('ENOTFOUND')) {
      return NextResponse.json({ error: 'Supabase 連線異常' }, { status: 503 })
    }

    return NextResponse.json({ error: '搜尋失敗' }, { status: 500 })
  }
}
