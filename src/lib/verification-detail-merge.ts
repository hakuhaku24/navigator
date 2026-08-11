/**
 * verification-detail-merge.ts — 驗證細節的「資料庫優先、靜態檔補洞」合併規則
 *
 * 單獨成檔的理由：這條規則寫反的後果很大（靜態快照蓋掉資料庫的新結果 ＝ 重跑
 * 驗證等於白做，而且從畫面上看不出來），所以要能被單元測試直接涵蓋。
 * 本檔刻意不 import 任何東西——`verification-detail.ts` 會拉進 45 筆 POI_KB，
 * 那讓它無法在 agents/poi-verifier 的 ts-node 環境下被測試。
 *
 * 對應測試：agents/poi-verifier/tests/verification-detail-merge.test.ts
 */

/** 只取合併需要的欄位，避免耦合到完整的 SearchResult 型別 */
export interface MergeableResult {
  conflicts?: unknown
  level_reasoning?: string
  blog_posts?: unknown
}

export interface FallbackDetail {
  conflicts: unknown
  level_reasoning: string
  blog_posts: unknown
}

/**
 * 補上目標物件缺少的驗證細節欄位，**不覆蓋已有的值**。
 *
 * 判準是 `undefined` 而非 falsy——這個區別是整條規則的核心：
 *
 *   · `undefined` ＝ 資料庫沒有這個欄位（未套 migration 010／2026-05-06 的舊資料）
 *                   → 該補
 *   · `null`      ＝ 資料庫查過了，答案就是「沒有衝突」
 *                   → **有效答案，不可補**
 *
 * 若用 `??` 或 `||` 判斷，`null` 會被當成缺值而被靜態快照覆蓋，等於把
 * 「已驗證沒有衝突」誤植成 2026-05-06 當時的舊衝突資料。
 */
export function mergeVerificationDetail<T extends MergeableResult>(
  target: T,
  fallback: FallbackDetail,
): T {
  const merged = { ...target }
  if (merged.conflicts === undefined) merged.conflicts = fallback.conflicts
  if (merged.level_reasoning === undefined) merged.level_reasoning = fallback.level_reasoning
  if (merged.blog_posts === undefined) merged.blog_posts = fallback.blog_posts
  return merged
}
