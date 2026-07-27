// ── 對外 Plug-in 端點：可信景點檢索 ─────────────────────────────────────────────
//
// 這是 /api/poi/search 的「對外交付面」版本。業務邏輯完全重用內部路由的
// handler（同一個 searchPois 管線），差別只在「路徑」——本路徑 /api/plugin/*
// 由 src/proxy.ts 統一做 API Key 把關與 CORS，內部路由則保持開放給自家前端。
//
// 「一個能力，多種交付」：capability（searchPois）不變，plugin 只是多一層轉接頭。
export { GET, POST } from '@/app/api/poi/search/route'
