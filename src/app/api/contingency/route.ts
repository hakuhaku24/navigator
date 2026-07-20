import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { POIS } from '@/data/pois'
import { handleContingency } from '../../../../agents/contingency-handler/src/agent'
import { adaptRawPOI } from '../../../../agents/contingency-handler/src/poi-adapter'
import type { ContingencyPlan } from '../../../../agents/contingency-handler/src/types'

// ── Request schema ────────────────────────────────────────────────────────────

const ContingencyRequestSchema = z.object({
  // 受影響的當前景點（demo 行程是靜態資料，用 pois.ts 的 id，如 "NCA-004"）
  poi_id: z.string().min(1),
  // demo 覆寫：不傳 → 走真實偵測（OSM Nominatim 反查鄉鎮 → 中央氣象署鄉鎮預報）。
  // 傳了 → weather-detector 標記 data_source: 'mock'，回應裡看得出是模擬情境。
  rainfall_probability: z.number().min(0).max(1).optional(),
  temperature_celsius: z.number().min(-10).max(50).optional(),
  // 北海岸沿線景點彼此可達 20+ km，預設半徑放寬（agent 預設 5 km 會濾掉太多）
  search_radius_km: z.number().min(1).max(50).default(20),
})

export interface ContingencyResponse {
  triggered: boolean
  reason?: string
  plan?: ContingencyPlan
}

// ── POST /api/contingency ─────────────────────────────────────────────────────
//
// 把 agents/contingency-handler 的完整管線（偵測 → 期望值 → 嚴格篩選 →
// 多準則排序 → LLM 敘述）包成 Route Handler，供 weather 頁呼叫。
//
// 請求範例：
//   { "poi_id": "NCA-004" }                                  ← 真實 CWA 偵測
//   { "poi_id": "NCA-004", "rainfall_probability": 0.85 }    ← demo 模擬大雨
//
// 候選池：不傳 candidate_pool → agent 走 Supabase RPC 語意檢索（真 RAG，
// pool_source: 'supabase_rpc'）；靜態 45 筆改作 fallback_pool 安全網——
// 只在 RPC 失敗/回空時兜底（agent 的 loadAllPois() 走動態 require，
// 在 Next.js bundle 內不可用，所以兜底必須由本層提供）。
export async function POST(
  req: NextRequest,
): Promise<NextResponse<ContingencyResponse | { error: string }>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '請求 body 必須是合法的 JSON' }, { status: 400 })
  }

  const parsed = ContingencyRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: `參數錯誤：${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}` },
      { status: 400 },
    )
  }
  const { poi_id, rainfall_probability, temperature_celsius, search_radius_km } = parsed.data

  const raw = POIS.find(p => p.id === poi_id)
  if (!raw) {
    return NextResponse.json({ error: `找不到景點 ${poi_id}` }, { status: 404 })
  }

  const currentPoi = adaptRawPOI(raw)
  const staticPool = POIS.map(adaptRawPOI)

  const hasOverride = rainfall_probability !== undefined || temperature_celsius !== undefined

  try {
    const plan = await handleContingency(
      {
        current_location: { latitude: currentPoi.latitude, longitude: currentPoi.longitude },
        current_poi: currentPoi,
        group_state: { member_positions: [], timestamps: [] },
        // 不傳 candidate_pool → agent 依事件語意打 Supabase RPC 檢索候選（真 RAG）
        fallback_pool: staticPool,
      },
      {
        config: { search_radius_km },
        detectorOverrides: hasOverride
          ? { weather: { rainfall_probability, temperature_celsius } }
          : undefined,
      },
    )

    if (!plan) {
      return NextResponse.json({
        triggered: false,
        reason: '未偵測到需要應變的事件，或期望值落差未超過門檻（維持原行程即可）',
      })
    }

    return NextResponse.json({ triggered: true, plan })
  } catch (err) {
    console.error('[api/contingency] error:', err)
    return NextResponse.json({ error: '應變分析失敗，請稍後再試' }, { status: 500 })
  }
}
