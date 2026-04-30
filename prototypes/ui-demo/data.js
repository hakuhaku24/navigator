// Mock POI data — 45-ish demo data following the Navigator POI schema.
// Photos are Unsplash content URLs; level follows L0–L3 scheme from the architecture.

const LEVELS = {
  0: { label: '絕對錨點', color: '#EF4444', bg: 'rgba(239,68,68,0.95)' },
  1: { label: '彈性錨點', color: '#F97316', bg: 'rgba(249,115,22,0.95)' },
  2: { label: '條件變動', color: '#EAB308', bg: 'rgba(234,179,8,0.95)' },
  3: { label: '水位調節', color: '#94A3B8', bg: 'rgba(148,163,184,0.95)' },
};

// Abstract landscape-ish gradient "photos" so the prototype works offline.
function gradientBg(a, b, c) {
  return `linear-gradient(155deg, ${a} 0%, ${b} 50%, ${c} 100%)`;
}

const POIS = [
  {
    id: 'YM-001', name: '陽明山擎天崗', addr: '台北市士林區擎天崗',
    level: 1, indoor: false,
    vibe: ['草原', '散步', '親子', '拍照'],
    desc: '遼闊大草原，看牛吃草的愜意午後。',
    photo: gradientBg('#7db37e', '#4a8c52', '#1f4d2e'),
    accent: '#4a8c52',
  },
  {
    id: 'YM-002', name: '小油坑地熱', addr: '台北市北投區竹子湖路',
    level: 2, indoor: false,
    vibe: ['地熱', '硫磺', '短程', '地質'],
    desc: '噴氣孔咕嚕作響，像地球在呼吸。',
    photo: gradientBg('#c9a15b', '#7a5a33', '#3d2c1a'),
    accent: '#7a5a33',
  },
  {
    id: 'YM-003', name: '竹子湖海芋田', addr: '台北市北投區竹子湖',
    level: 1, indoor: false,
    vibe: ['花季', '季節限定', '打卡', '農場'],
    desc: '三月雪白花海，採一束帶走春天。',
    photo: gradientBg('#f0f4e8', '#9ec37a', '#4b7a3e'),
    accent: '#9ec37a',
  },
  {
    id: 'NC-007', name: '野柳地質公園', addr: '新北市萬里區港東路',
    level: 0, indoor: false,
    vibe: ['地景', '女王頭', '海岸', '必看'],
    desc: '風化千年的奇岩，女王頭就在眼前。',
    photo: gradientBg('#d6c9a0', '#8a7a54', '#3a3326'),
    accent: '#8a7a54',
  },
  {
    id: 'NE-003', name: '鼻頭角步道', addr: '新北市瑞芳區鼻頭路',
    level: 2, indoor: false,
    vibe: ['海景', '健行', '燈塔', '中級'],
    desc: '走到海岬盡頭，太平洋就在腳下。',
    photo: gradientBg('#6ab7d1', '#2f7a96', '#0d2c3a'),
    accent: '#2f7a96',
  },
  {
    id: 'YM-012', name: '北投溫泉博物館', addr: '台北市北投區中山路',
    level: 2, indoor: true,
    vibe: ['歷史', '室內', '建築', '免費'],
    desc: '百年日式木造浴場，雨天最佳備案。',
    photo: gradientBg('#b89778', '#6b4a2e', '#2f1d10'),
    accent: '#6b4a2e',
  },
  {
    id: 'NC-011', name: '金山老街', addr: '新北市金山區金包里街',
    level: 3, indoor: false,
    vibe: ['老街', '小吃', '鴨肉', '散步'],
    desc: '鴨肉飯的香氣，順路收個胃袋再走。',
    photo: gradientBg('#e8b974', '#a17030', '#4a2e0f'),
    accent: '#a17030',
  },
  {
    id: 'NE-008', name: '南雅奇岩', addr: '新北市瑞芳區南雅里',
    level: 3, indoor: false,
    vibe: ['奇石', '短停', '攝影', '海邊'],
    desc: '霜淇淋般的風化岩柱，停車拍十分鐘。',
    photo: gradientBg('#d4a074', '#8c6544', '#3c2b1c'),
    accent: '#8c6544',
  },
];

// Member avatars for group presence
const MEMBERS = [
  { id: 'u1', name: '小安', color: '#52B788', done: true },
  { id: 'u2', name: '阿宣', color: '#F97316', done: true },
  { id: 'u3', name: 'Kai',  color: '#8B5CF6', done: true },
  { id: 'u4', name: '婷婷', color: '#EC4899', done: true },
  { id: 'u5', name: '你',   color: '#1B4332', done: false },
];

// Result scores (post-vote state for screen 2)
const RESULTS = [
  { poi: POIS[3], score: 18, stars: 3, hearts: 3, vetos: 0, note: '最高共識' },      // NC-007 野柳
  { poi: POIS[0], score: 14, stars: 2, hearts: 4, vetos: 0 },                        // 擎天崗
  { poi: POIS[2], score: 11, stars: 1, hearts: 6, vetos: 0 },                        // 竹子湖
  { poi: POIS[4], score: 9,  stars: 1, hearts: 4, vetos: 0 },                        // 鼻頭角
  { poi: POIS[5], score: 7,  stars: 0, hearts: 7, vetos: 0 },                        // 北投溫泉
  { poi: POIS[1], score: 5,  stars: 0, hearts: 5, vetos: 0 },                        // 小油坑
  { poi: POIS[6], score: 3,  stars: 0, hearts: 3, vetos: 0 },                        // 金山老街
  { poi: POIS[7], score: -999, stars: 0, hearts: 2, vetos: 1, vetoed: true },        // 南雅奇岩 (vetoed)
];

// Weather swap scenario — Day 2 afternoon rain affects 3 outdoor POIs
const SWAPS = [
  {
    original: POIS[0],   // 擎天崗 (outdoor)
    replacement: POIS[5], // 北投溫泉博物館 (indoor)
    reasonOld: '戶外草原，雨天濕滑體驗差',
    reasonNew: '同區室內古蹟，氣氛相近',
    distance: '1.2 km',
  },
  {
    original: POIS[2],   // 竹子湖海芋
    replacement: POIS[5], // 北投溫泉博物館
    reasonOld: '花田雨中難拍、走路濕鞋',
    reasonNew: '室內文化景點，同樣療癒',
    distance: '850 m',
  },
  {
    original: POIS[4],   // 鼻頭角步道
    replacement: POIS[5],
    reasonOld: '海岬步道雨中濕滑危險',
    reasonNew: '改走室內溫泉路線',
    distance: '37 km — 建議換日',
  },
];

Object.assign(window, { LEVELS, POIS, MEMBERS, RESULTS, SWAPS });
