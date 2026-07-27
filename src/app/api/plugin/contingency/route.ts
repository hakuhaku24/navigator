// ── 對外 Plug-in 端點：即時天氣應變建議 ─────────────────────────────────────────
//
// /api/contingency 的對外交付面版本，重用同一條 handleContingency 管線。
// API Key 把關與 CORS 由 src/proxy.ts 統一處理（見該檔）。
export { POST } from '@/app/api/contingency/route'
