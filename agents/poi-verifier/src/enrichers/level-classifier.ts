import type { GooglePlacesRaw } from '../types'

// Rule-based pre-classification before LLM.
// Returns null to delegate fully to LLM (Prototype phase).
// Add deterministic rules here to reduce LLM calls over time.
export function preClassifyLevel(
  _poi: { name: string },
  google: GooglePlacesRaw | null,
): 0 | 1 | 2 | 3 | null {
  if (google?.business_status === 'CLOSED_PERMANENTLY') return null

  // Future rules (examples):
  // if (google?.types?.includes('lodging')) return 0   // hotel = L0
  // if (poi.name.includes('溫泉')) return 1            // hot spring → flexible anchor

  return null  // let LLM decide
}
