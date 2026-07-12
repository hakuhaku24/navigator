// 佔位圖共用元件：區域/主題漸層 + 關鍵字 emoji。
// 外部圖片（picsum、來源網站）不可靠或與內容不符時，用這個保證 demo 視覺一致。

export const REGION_PALETTES: Record<string, string> = {
  "北海岸": "linear-gradient(155deg, #6ab7d1 0%, #2f7a96 50%, #0d2c3a 100%)",
  "陽明山": "linear-gradient(155deg, #7db37e 0%, #4a8c52 50%, #1f4d2e 100%)",
  "東北角": "linear-gradient(155deg, #c9a15b 0%, #7a5a33 50%, #3d2c1a 100%)",
}

const GRADIENTS = [
  REGION_PALETTES["北海岸"],
  REGION_PALETTES["陽明山"],
  REGION_PALETTES["東北角"],
  "linear-gradient(155deg, #8fb3c7 0%, #4a6d8c 50%, #1d2b3d 100%)",
  "linear-gradient(155deg, #d68a76 0%, #96524a 50%, #3d1f1d 100%)",
]

export function categoryEmoji(text: string): string {
  if (/東京/.test(text)) return "🗼"
  if (/首爾/.test(text)) return "🌇"
  if (/陽明山/.test(text)) return "⛰️"
  if (/台北/.test(text)) return "🏙️"
  if (/溫泉/.test(text)) return "♨️"
  if (/美術|藝術/.test(text)) return "🖼️"
  if (/博物|歷史/.test(text)) return "🏛️"
  if (/寺|宮|廟|宗教/.test(text)) return "⛩️"
  if (/街|市場|商店|特產/.test(text)) return "🏮"
  if (/餐|食|粽|麵|咖啡|飲/.test(text)) return "🍜"
  if (/住宿|旅宿|民宿/.test(text)) return "🏡"
  if (/港|漁/.test(text)) return "⛵"
  if (/塔/.test(text)) return "🗼"
  if (/海|灘|灣|岬|石槽/.test(text)) return "🌊"
  if (/山|嶺|草原|步道|公園|自然/.test(text)) return "🏞️"
  if (/體驗/.test(text)) return "🛶"
  return "📍"
}

function hashPick(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return GRADIENTS[Math.abs(h) % GRADIENTS.length]
}

interface PoiArtProps {
  /** emoji 判斷來源：分類、名稱或目的地文字 */
  text: string
  /** 漸層選色 seed，預設用 text */
  seed?: string
  /** 指定區域時直接用區域色 */
  region?: string
  /** emoji 的 tailwind 字級 class，例如 "text-2xl" */
  emojiClassName?: string
  className?: string
  /** 覆蓋在圖上的內容（徽章等） */
  children?: React.ReactNode
}

export default function PoiArt({ text, seed, region, emojiClassName = "text-2xl", className = "", children }: PoiArtProps) {
  const gradient = (region && REGION_PALETTES[region]) || hashPick(seed ?? text)
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: gradient }}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.18) 0%, transparent 55%)" }}
      />
      <span className={`select-none opacity-70 ${emojiClassName}`} style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.3))" }}>
        {categoryEmoji(text)}
      </span>
      {children}
    </div>
  )
}
