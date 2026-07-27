import { NextRequest, NextResponse } from 'next/server'

// ── Plug-in 對外面的大門警衛（Next 16 的 proxy 慣例，取代舊 middleware）─────────
//
// 只攔 /api/plugin/* —— 這是我們對外交付給旅遊平台的「產品面」。
// 內部路由（/api/poi/search、/api/contingency，自家前端在用）完全不受影響，
// 所以加了金鑰把關也不會打斷 explore 頁。
//
// 做兩件事：
//   1. API Key 把關：認鑰匙才給用（發鑰匙＝合作關係，這是「對外服務」的商業訊號）
//   2. CORS：讓外部網頁/平台跨網域呼叫得到

// 發給串接方的金鑰，逗號分隔可發多把。放伺服器端 env（.env.local），不進前端、不進 git。
const VALID_KEYS = (process.env.PLUGIN_API_KEYS ?? '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean)

const CORS_HEADERS: Record<string, string> = {
  // demo 用 *；正式版改成串接方的白名單網域
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  'Access-Control-Max-Age': '86400',
}

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v)
  return res
}

export function proxy(req: NextRequest) {
  // ① CORS 預檢（瀏覽器在真正的請求前，會先送一個 OPTIONS 問「我可以打你嗎」）
  if (req.method === 'OPTIONS') {
    return withCors(new NextResponse(null, { status: 204 }))
  }

  // ② API Key 把關
  const key = req.headers.get('x-api-key')
  if (!key || !VALID_KEYS.includes(key)) {
    return withCors(
      NextResponse.json(
        { error: 'Unauthorized：缺少或無效的 API key（請於 x-api-key header 帶上你的金鑰）' },
        { status: 401 },
      ),
    )
  }

  // ③ 通過 → 放行，並讓實際回應也帶上 CORS 標頭
  return withCors(NextResponse.next())
}

// 只作用在對外 plug-in 面；其餘路由（含內部 /api/poi/search）不經過本 proxy
export const config = {
  matcher: '/api/plugin/:path*',
}
