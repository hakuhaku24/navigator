#!/usr/bin/env node
/*
 * Navigator MCP Server（stdio，零相依教學版）
 * ------------------------------------------------------------------
 * 這是「AI 助理 → 你的可信景點庫」的窗口。AI 助理（如 Claude Desktop）
 * 不直接連你的資料庫，而是呼叫本 server 定義的 tool；本 server 再透過
 * HTTP 打你的 REST plug-in（/api/plugin/*，帶 API 金鑰），REST 才去查
 * Supabase poi_catalog。金鑰只存在這裡（server 端），AI 拿不到。
 *
 * 為什麼手刻而不用 @modelcontextprotocol/sdk：
 *   SDK 在本 repo 只是 transitive 相依、且為 ESM，靠它不穩。MCP 的 stdio
 *   傳輸其實就是「一行一個 JSON-RPC 2.0 訊息」，手刻反而更穩、也看得懂底層。
 *
 * 執行：node mcp-server/server.js
 *   環境變數：
 *     NAVIGATOR_API_BASE  預設 http://localhost:3000
 *     NAVIGATOR_API_KEY   預設 demo-key-abc123（要在 REST 的 PLUGIN_API_KEYS 裡）
 *
 * 重要：stdout 只能放 JSON-RPC 訊息，任何 log 一律走 stderr，否則會污染協定。
 */

const API_BASE = process.env.NAVIGATOR_API_BASE || 'http://localhost:3000'
const API_KEY = process.env.NAVIGATOR_API_KEY || 'demo-key-abc123'
const PROTOCOL_VERSION = '2024-11-05'

const log = (...a) => process.stderr.write('[navigator-mcp] ' + a.join(' ') + '\n')

// ── 兩個 tool＝兩個對外能力（對應兩支 REST plug-in 端點）──────────────────────
const TOOLS = [
  {
    name: 'search_verified_pois',
    description:
      '從 Navigator 的可信景點知識庫檢索景點。回傳的每個景點都經多來源交叉驗證，' +
      '帶信任分數與來源。用於「找景點／找室內替代／依 vibe 搜尋」等需求，' +
      '避免使用未經驗證、可能已歇業或不存在的地點。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '自然語言查詢，如「下雨天想找室內景點」。留空則瀏覽全部。' },
        region: { type: 'string', enum: ['北海岸', '陽明山', '東北角'], description: '限定地區（可選）' },
        is_indoor: { type: 'boolean', description: '只要室內景點（可選）' },
        top: { type: 'number', description: '回傳幾筆，預設 5', default: 5 },
      },
    },
  },
  {
    name: 'weather_contingency',
    description:
      '對某個景點做即時天氣應變評估。系統以中央氣象署降雨機率＋期望值模型判斷是否該替換，' +
      '從可信知識庫撈同區備案並經反思審查後回傳建議。用於「行程遇到下雨怎麼辦」。',
    inputSchema: {
      type: 'object',
      properties: {
        poi_id: { type: 'string', description: '受影響景點的 id，如 "NCA-004"' },
        rainfall_probability: {
          type: 'number',
          description: '覆寫降雨機率 0–1（可選，用於模擬大雨情境；不傳則走真實 CWA 偵測）',
        },
      },
      required: ['poi_id'],
    },
  },
]

// tool 名 → REST plug-in 端點與參數轉換
async function callTool(name, args) {
  args = args || {}
  if (name === 'search_verified_pois') {
    const body = { top: args.top ?? 5 }
    if (args.query) body.query = args.query
    if (args.region || args.is_indoor !== undefined) {
      body.filter = {}
      if (args.region) body.filter.region = args.region
      if (args.is_indoor !== undefined) body.filter.is_indoor = args.is_indoor
    }
    return postJson('/api/plugin/poi/search', body)
  }
  if (name === 'weather_contingency') {
    const body = { poi_id: args.poi_id }
    if (args.rainfall_probability !== undefined) body.rainfall_probability = args.rainfall_probability
    return postJson('/api/plugin/contingency', body)
  }
  throw new Error(`未知的 tool：${name}`)
}

async function postJson(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`REST ${path} 回 ${res.status}：${text.slice(0, 300)}`)
  }
  return text // 直接把 JSON 字串交回給 AI 助理
}

// ── JSON-RPC 2.0 over stdio ─────────────────────────────────────────────────────
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

async function handle(msg) {
  const { id, method, params } = msg

  // 通知（無 id）不需回應
  if (id === undefined || id === null) {
    if (method === 'notifications/initialized') log('client initialized')
    return
  }

  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'navigator', version: '0.1.0' },
        },
      })
    } else if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} })
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
    } else if (method === 'tools/call') {
      const name = params && params.name
      const args = (params && params.arguments) || {}
      try {
        const text = await callTool(name, args)
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } })
      } catch (err) {
        // 工具執行失敗回 isError（讓 AI 知道這次呼叫沒成功，而非協定錯誤）
        send({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: '呼叫失敗：' + err.message }], isError: true },
        })
      }
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未支援的 method：${method}` } })
    }
  } catch (err) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(err && err.message || err) } })
  }
}

// stdin 是一串位元組，用換行切出一個個 JSON 訊息
let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim()
    buf = buf.slice(nl + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      log('無法解析的一行（已略過）：', line.slice(0, 120))
      continue
    }
    handle(msg)
  }
})
// 客戶端斷線（stdin 結束）：不強制 exit——讓進行中的 async tool 呼叫先回完，
// Node 沒有其他待處理工作時會自行退出（避免砍掉還在 await 的 tools/call）。
process.stdin.on('end', () => log('stdin closed'))

log(`ready. API_BASE=${API_BASE}  (需先啟動 Next dev server；stdout 僅輸出 JSON-RPC)`)
