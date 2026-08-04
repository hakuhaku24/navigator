// FFR13：使用者在驗證景點庫（/explore）選點、暫存於此 store，
// 到 /trip/build 一次組成行程。純 client UI 暫存狀態 → Zustand（依 CLAUDE.md §8 慣例）。
// persist 到 localStorage：重新整理、跳轉頁面不會遺失已選景點。
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { POIKnowledge } from "@/data/poi-kb"

/**
 * 購物車存的景點。
 *
 * `region` 刻意放寬成 `string`：`POIKnowledge["region"]` 是「北海岸／陽明山／東北角」
 * 的封閉聯集，但 TDX 匯入的景點可能**不屬於任何一區**（三峽、烏來、永和…），
 * 在 explore 頁顯示為「未分區」。
 *
 * ⚠️ 不要為了型別過關而在存入時補一個預設區域——那正是 explore 先前
 * `?? "北海岸"` 造成的問題（三峽的景點被標成北海岸）。放寬型別才是誠實的做法。
 */
export type CartPoi = Omit<POIKnowledge, "region"> & { region: string }

interface ItineraryCartState {
  // key = poi.id，value = 選取當下的資料快照（避免 build 頁還要重打 API）
  items: Record<string, CartPoi>
  toggle: (poi: CartPoi) => void
  remove: (id: string) => void
  clear: () => void
}

export const useItineraryCartStore = create<ItineraryCartState>()(
  persist(
    (set) => ({
      items: {},
      toggle: (poi) =>
        set((state) => {
          const next = { ...state.items }
          if (next[poi.id]) delete next[poi.id]
          else next[poi.id] = poi
          return { items: next }
        }),
      remove: (id) =>
        set((state) => {
          const next = { ...state.items }
          delete next[id]
          return { items: next }
        }),
      clear: () => set({ items: {} }),
    }),
    // v2：2026-07-28 把 POI id 從 poi_catalog UUID 改成 source_id（"NCA-001"），
    // 舊的購物車內容 id 對不上新的定址方式，換 key 讓它自然失效重選
    { name: "navigator-itinerary-cart-v2" },
  ),
)

// 選取狀態的便利 hook：元件內用 `useIsInCart(poi.id)` 才會正確訂閱變化
// （直接呼叫 store 方法讀值不會觸發重渲染，選 selector 才會）
export function useIsInCart(id: string): boolean {
  return useItineraryCartStore((s) => !!s.items[id])
}

export function useCartCount(): number {
  return useItineraryCartStore((s) => Object.keys(s.items).length)
}
