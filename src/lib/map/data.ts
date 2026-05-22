// Map coordinate and review data — adapted from design_handoff_map_page/map-data.js
// NEC- IDs in the original design are remapped to NEI- to match poi-kb.ts

export const MAP_COORDS: Record<string, { x: number; y: number }> = {
  // ── 北海岸 (upper-left, north coast) ──
  'NCA-001': { x: 152, y: 64 },
  'NCA-002': { x: 92,  y: 56 },
  'NCA-003': { x: 132, y: 96 },
  'NCA-004': { x: 124, y: 78 },
  'NCA-005': { x: 76,  y: 50 },
  'NCA-006': { x: 92,  y: 224 },
  'NCA-007': { x: 100, y: 232 },
  'NCA-008': { x: 138, y: 70 },
  'NCA-009': { x: 144, y: 90 },
  'NCA-010': { x: 80,  y: 56 },
  'NCA-011': { x: 60,  y: 86 },
  'NCA-012': { x: 56,  y: 100 },
  'NCA-013': { x: 82,  y: 60 },
  'NCA-014': { x: 86,  y: 64 },
  'NCA-015': { x: 128, y: 78 },

  // ── 陽明山 (center-mid) ──
  'YMS-001': { x: 158, y: 174 },
  'YMS-002': { x: 132, y: 168 },
  'YMS-003': { x: 122, y: 178 },
  'YMS-004': { x: 138, y: 188 },
  'YMS-005': { x: 168, y: 178 },
  'YMS-006': { x: 144, y: 162 },
  'YMS-007': { x: 170, y: 188 },
  'YMS-008': { x: 128, y: 200 },
  'YMS-009': { x: 116, y: 208 },
  'YMS-010': { x: 124, y: 196 },
  'YMS-011': { x: 78,  y: 138 },
  'YMS-012': { x: 130, y: 192 },
  'YMS-013': { x: 120, y: 172 },
  'YMS-014': { x: 110, y: 216 },
  'YMS-015': { x: 116, y: 152 },

  // ── 東北角 (upper-right, NE cape) — original NEC- remapped to NEI- ──
  'NEI-001': { x: 286, y: 152 },
  'NEI-002': { x: 264, y: 138 },
  'NEI-003': { x: 300, y: 168 },
  'NEI-004': { x: 318, y: 226 },
  'NEI-005': { x: 308, y: 212 },
  'NEI-006': { x: 244, y: 142 },
  'NEI-007': { x: 268, y: 224 },
  'NEI-008': { x: 256, y: 218 },
  'NEI-009': { x: 250, y: 138 },
  'NEI-010': { x: 230, y: 198 },
  'NEI-011': { x: 248, y: 140 },
  'NEI-012': { x: 252, y: 124 },
  'NEI-013': { x: 252, y: 128 },
  'NEI-014': { x: 250, y: 142 },
  'NEI-015': { x: 230, y: 134 },
}

export const REVIEW_AVATARS = [
  { name: '怡安', color: '#0891B2' },
  { name: '柏宇', color: '#D97706' },
  { name: '佳穎', color: '#16A34A' },
  { name: '冠廷', color: '#7C3AED' },
  { name: '若涵', color: '#DB2777' },
  { name: '宥廷', color: '#0EA5E9' },
  { name: '雅婷', color: '#F59E0B' },
  { name: '志維', color: '#10B981' },
]

export type Review = {
  user: number   // index into REVIEW_AVATARS
  stars: 1 | 2 | 3 | 4 | 5
  date: string
  text: string
  helpful: number
  verified: boolean
}

export const MAP_REVIEWS: Record<string, Review[]> = {
  'NCA-002': [
    { user: 0, stars: 5, date: '2026-05-12', text: '清晨七點到，女王頭沒人排隊，海蝕地形真的震撼。風大記得帶帽子。', helpful: 24, verified: true },
    { user: 2, stars: 4, date: '2026-04-28', text: '小朋友超喜歡看蕈狀岩，全程曬到爆，建議早或傍晚去。', helpful: 11, verified: true },
    { user: 3, stars: 5, date: '2026-04-20', text: '解說志工很專業，岩石的故事比想像中精彩。', helpful: 9, verified: false },
  ],
  'NCA-006': [
    { user: 1, stars: 5, date: '2026-04-30', text: '雨天備案首選，免費入場，老建築拍起來很有味道。', helpful: 18, verified: true },
    { user: 4, stars: 4, date: '2026-04-15', text: '室內展示用心，配地熱谷半日剛好。', helpful: 7, verified: true },
  ],
  'NCA-003': [
    { user: 5, stars: 5, date: '2026-05-02', text: '園區超大，安排半天剛好。雕塑放在山林裡氛圍很棒。', helpful: 31, verified: true },
    { user: 6, stars: 5, date: '2026-04-18', text: '兒童藝術中心可以玩到不想走，大人也舒服。', helpful: 14, verified: true },
    { user: 7, stars: 4, date: '2026-04-08', text: '建議帶水帶傘，戶外作品多。', helpful: 5, verified: false },
  ],
  'YMS-001': [
    { user: 0, stars: 5, date: '2026-05-15', text: '草原無敵綠！水牛真的很近，但保持距離很重要。', helpful: 42, verified: true },
    { user: 3, stars: 4, date: '2026-05-08', text: '霧太大什麼都看不到，建議出發前查能見度。', helpful: 19, verified: true },
    { user: 5, stars: 5, date: '2026-04-22', text: '走到中央步道有種瑞士草原的錯覺。', helpful: 11, verified: false },
  ],
  'YMS-002': [
    { user: 1, stars: 4, date: '2026-04-26', text: '硫磺味很重，鼻子敏感的要小心。', helpful: 8, verified: true },
    { user: 6, stars: 5, date: '2026-04-12', text: '地質教育很完整，遊客中心可以看影片。', helpful: 6, verified: true },
  ],
  'YMS-003': [
    { user: 4, stars: 5, date: '2026-04-25', text: '海芋季尾聲還是好美，採花體驗推。', helpful: 22, verified: true },
    { user: 2, stars: 4, date: '2026-04-14', text: '假日塞車塞到爆，搭公車比較好。', helpful: 13, verified: true },
  ],
  'YMS-015': [
    { user: 0, stars: 5, date: '2026-04-02', text: '推娃娃車也可以走，蝴蝶超多。', helpful: 16, verified: true },
    { user: 7, stars: 5, date: '2026-03-30', text: '入門級散步路線，老人小孩都適合。', helpful: 9, verified: true },
  ],
  'NEI-001': [
    { user: 3, stars: 5, date: '2026-05-04', text: '稜谷步道走完膝蓋有點抖，但景超值。', helpful: 28, verified: true },
    { user: 5, stars: 4, date: '2026-04-18', text: '太平洋一望無際，午後光線最美。', helpful: 14, verified: true },
  ],
  'NEI-006': [
    { user: 1, stars: 5, date: '2026-05-18', text: '黃昏五點半上去，紅燈籠剛亮起來，超有千與千尋感。', helpful: 56, verified: true },
    { user: 4, stars: 3, date: '2026-05-10', text: '週末人擠人，老街窄到難呼吸。', helpful: 23, verified: true },
    { user: 6, stars: 4, date: '2026-04-30', text: '芋圓推阿柑姨，茶屋推阿妹茶樓夜景座位。', helpful: 31, verified: false },
  ],
  'NEI-004': [
    { user: 2, stars: 5, date: '2026-05-08', text: '夏天進來瞬間涼快，腳踏車租好騎，親子無敵。', helpful: 19, verified: true },
    { user: 0, stars: 5, date: '2026-04-22', text: '隧道內有歷史解說，騎到宜蘭石城海邊整個賺。', helpful: 12, verified: true },
  ],
  'NEI-007': [
    { user: 7, stars: 4, date: '2026-04-20', text: '雨後水量超大，吊橋拍照角度最美。', helpful: 17, verified: true },
    { user: 3, stars: 4, date: '2026-04-05', text: '收費合理，搭配十分老街放天燈剛好半天。', helpful: 10, verified: true },
  ],
  'NEI-009': [
    { user: 5, stars: 5, date: '2026-03-20', text: '本山五坑要進去體驗，比博物館本體更有感。', helpful: 13, verified: true },
    { user: 1, stars: 4, date: '2026-03-12', text: '黃金大廳的金磚真的可以摸到，意外驚喜。', helpful: 8, verified: true },
  ],
}

// Compute ratings from reviews
export const MAP_RATING: Record<string, { avg: string; count: number }> = {}
Object.entries(MAP_REVIEWS).forEach(([id, list]) => {
  const avg = list.reduce((s, r) => s + r.stars, 0) / list.length
  MAP_RATING[id] = { avg: avg.toFixed(1), count: list.length }
})

export const DEFAULT_FAVORITES = new Set(['NCA-002', 'YMS-001', 'NEI-006'])

export const SAMPLE_ROUTE = {
  id: 'route-2026-0521',
  title: '北海岸經典一日',
  date: '2026/05/21 · 週四',
  members: 4,
  totalMinutes: 580,
  totalKm: 78,
  stops: [
    { poi: 'NCA-006', arrive: '09:30', depart: '11:00', note: '雨天備案 / 室內熱身' },
    { poi: 'NCA-003', arrive: '11:40', depart: '14:30', note: '園區午餐' },
    { poi: 'NCA-002', arrive: '15:00', depart: '17:00', note: '主要錨點' },
    { poi: 'NCA-004', arrive: '17:20', depart: '18:40', note: '晚餐 / 鴨肉' },
  ],
}
