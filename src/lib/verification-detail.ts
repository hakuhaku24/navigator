/**
 * verification-detail.ts — 補上資料庫還沒有的驗證細節
 *
 * ## 三項細節與它們的來源
 *
 * POI 驗證 Agent 產出三項細節，前端 explore 的 DetailSheet 各有一個區塊在渲染：
 *   · conflicts       多來源衝突分析（哪個欄位有衝突、各來源怎麼說、怎麼裁決）
 *   · levelReasoning  L0–L3 分級的理由
 *   · blogPosts       部落格佐證來源
 *
 * ## 2026-08-02 起：資料庫優先，靜態檔補洞
 *
 * migration 010 把 `conflict_analysis` 與 `level_reasoning` 加進 poi_catalog，
 * ingestion 也已寫入，`poi-search.ts` 會直接從 DB 帶回來。所以這支模組的角色
 * 從「唯一來源」變成「**補洞**」——只填 DB 還沒有的欄位。
 *
 * 為什麼還需要補洞：
 *   1. 既有 45 筆是 2026-05-06 入庫的，那時沒有這兩個欄位，要重跑才會有
 *   2. `blogPosts` 至今**仍然沒有** DB 欄位（poi_catalog 的 `blog_snippets` 存的是
 *      extractInsights 萃取的洞察，不是部落格文章列表），只能繼續從靜態檔取
 *   3. 未套用 migration 010 的環境，poi-search 會降級查詢，這兩欄同樣是 undefined
 *
 * 重跑 ingestion 之後，既有 45 筆的 conflicts/level_reasoning 會直接由 DB 供應，
 * 這裡就只剩 blogPosts 在補。等 blog_posts 也持久化之後，整支模組即可刪除。
 *
 * ## 為什麼在 server 端做
 *
 * POI_KB 是 45 筆完整資料，前端直接 import 會整包進 client bundle
 * （explore 頁刻意只 import type 就是為了避開這件事）。在 server 端 join 完
 * 再回傳，client bundle 不變胖。
 *
 * ⚠️ 靜態檔只有既有 45 筆。TDX 匯入的新景點若 DB 也沒有，對應欄位就是 undefined，
 * 前端那三塊是條件渲染，不會壞掉，只是沒有細節可看。
 */

import { POI_KB, type ConflictAnalysis, type POIKnowledge } from '@/data/poi-kb'
import type { SearchResponse, SearchResult } from '@/lib/poi-search'
import { mergeVerificationDetail } from '@/lib/verification-detail-merge'

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

/**
 * 把驗證細節併進搜尋結果。
 *
 * 合併規則（DB 優先、靜態檔補洞）抽在 `verification-detail-merge.ts`，
 * 由 `agents/poi-verifier/tests/verification-detail-merge.test.ts` 涵蓋——
 * 這條規則寫反的話，靜態快照會蓋掉重跑後的新結果，而且畫面上看不出來。
 */
export function attachVerificationDetail(response: SearchResponse): SearchResponse {
  return {
    ...response,
    results: response.results.map((r: SearchResult) => {
      const detail = getVerificationDetail(r.source_id)
      return detail ? (mergeVerificationDetail(r, detail) as SearchResult) : r
    }),
  }
}
