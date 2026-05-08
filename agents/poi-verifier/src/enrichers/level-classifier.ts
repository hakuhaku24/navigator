import type { PoiInput, GooglePlacesRaw } from '../types'

const RESERVATION_KEYWORDS = ['預約', '訂位', '購票', '門票', '需預訂', '要預訂', '預訂制', '預約制']

// Rule-based pre-classification before LLM.
// Returns a level hint when a deterministic rule fires; null delegates to LLM.
export function preClassifyLevel(
  poi: PoiInput,
  google: GooglePlacesRaw | null,
): 0 | 1 | 2 | 3 | null {
  if (google?.business_status === 'CLOSED_PERMANENTLY') return null

  // L0 hint: user description or name explicitly mentions reservation/ticket required
  const text = `${poi.name} ${poi.user_description ?? ''}`.toLowerCase()
  if (RESERVATION_KEYWORDS.some(k => text.includes(k))) return 0

  return null  // let LLM decide
}
