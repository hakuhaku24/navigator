/**
 * verification-detail.ts — 把「還沒進資料庫的驗證細節」補回搜尋結果
 *
 * 背景：POI 驗證 Agent 產出的三項細節目前**沒有**持久化到 poi_catalog——
 *   · conflicts       多來源衝突分析（哪個欄位有衝突、各來源怎麼說、怎麼裁決）
 *   · levelReasoning  L0–L3 分級的理由
 *   · blogPosts       部落格佐證來源
 * 它們存在 `src/data/poi-kb.ts`（由 agents/poi-verifier 的
 * generate-frontend-conflicts.ts → gen-poi-kb.js 產生）。
 *
 * 在 explore 頁改讀 /api/poi/search 之後，這三塊 UI 就一直是空白的——不是功能
 * 沒做，是資料在靜態檔、頁面在讀資料庫，兩邊沒接。這支模組負責把它們接回來。
 *
 * 為什麼放在 server 端（route handler 呼叫）而不是前端直接 import POI_KB：
 * POI_KB 是 45 筆完整資料，前端 import 會整包進 client bundle（explore 頁刻意
 * 只 import type 就是為了避開這件事）。在 server 端 join 完再回傳，client 不變胖。
 *
 * ⚠️ 這是過渡方案。正解是把 conflict_analysis / level_reasoning / blog_posts
 * 寫進 poi_catalog（需要 migration + 重跑 ingestion，卡在資料範圍拍板）。
 * 屆時只要改這支模組的資料來源，route 與前端都不用動。
 * 也因為來源是靜態檔，只有既有 45 筆查得到；TDX 匯入的新景點會是 undefined，
 * 對應 UI 區塊本來就是條件渲染，不會壞掉，只是沒有細節可看。
 */

import { POI_KB, type ConflictAnalysis, type POIKnowledge } from '@/data/poi-kb'
import type { SearchResponse, SearchResult } from '@/lib/poi-search'

export interface VerificationDetail {
  conflicts: ConflictAnalysis | null
  level_reasoning: string
  blog_posts: POIKnowledge['blogPosts']
}

// source_id（"NCA-001"）→ 驗證細節。POI_KB 的 id 就是 source_id，兩邊同一組定址。
const DETAIL_BY_SOURCE_ID: Map<string, VerificationDetail> = new Map(
  POI_KB.map((p) => [
    p.id,
    {
      conflicts: p.conflicts,
      level_reasoning: p.levelReasoning,
      blog_posts: p.blogPosts,
    },
  ]),
)

export function getVerificationDetail(sourceId: string): VerificationDetail | undefined {
  return DETAIL_BY_SOURCE_ID.get(sourceId)
}

/** 把驗證細節併進搜尋結果；查不到的景點維持原樣（欄位為 undefined） */
export function attachVerificationDetail(response: SearchResponse): SearchResponse {
  return {
    ...response,
    results: response.results.map((r: SearchResult) => {
      const detail = getVerificationDetail(r.source_id)
      return detail ? { ...r, ...detail } : r
    }),
  }
}
