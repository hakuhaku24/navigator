# Booking Enrichment 規格

> Navigator POI 預約資訊強化管線 — 解決教授 5/20「驗證有空白會白跑」的具體實作
> 文件性質：設計規格 + code 節錄，可直接照寫
> 最後更新：2026-05-26

---

## 0. 一句話

把每筆 POI 的 **「能否預約 / 怎麼預約 / 客滿風險」** 從目前的空白，補成可消費的結構化資料，**讓使用者出發前能主動避開白跑**。

---

## 1. 要解決的具體問題

### 1.1 教授 5/20 原話

> 「驗證依然會有空白的地方，要補強跟優化那些驗證，使使用者利用系統預定景點時不會因為景點關閉或客滿而白跑。」

### 1.2 現況 vs 目標

| 欄位 | 現況 | 目標 |
|---|---|---|
| 電話 | Google Places 已有，但**沒寫進 poi_catalog** | 寫入 `metadata.booking.phone` 並提供 `tel:` 連結 |
| 官網 | Google Places 已有，但**沒寫進 poi_catalog** | 寫入 `metadata.booking.official_url` |
| Google Maps URL | 完全沒抓 | 從 place_id 自組 |
| 是否需預約 | 完全沒判斷 | 從 blog_snippets 解析 keyword |
| 客滿風險 | 完全沒判斷 | 從 blog_snippets 解析 keyword |
| 提前幾天訂 | 完全沒判斷 | 從 blog_snippets regex 抽 |
| KKday / Klook 連結 | 完全沒抓 | Sprint 2 用 Serper + 字串相似度抓 |

### 1.3 為什麼是「補資料」不是「接 API 直接訂」

查證後台灣可用的 booking API 現況：

| 平台 | 公開 API | 個人 / 學生可申請 |
|---|---|---|
| KKday | 只有 affiliate + supplier upload | ❌ partner API 須正式公司 |
| Klook | 只有 affiliate | ❌ partner API 須正式公司 |
| EZTABLE | 有 docs 但限合作商家 | ❌ |
| inline | 無公開 API | ❌ |
| FunNow | 無公開 API | ❌ |
| 觀光署 V2.1 | ✅ 政府 open data，免費 | ✅ 可接（Sprint 3） |
| rezio | 有 API 但是給商家管庫存 | ❌ |

**結論**：現階段所有「即時預約 API」都封閉，能做的只有**集中聯絡方式 + 提示風險**，把「使用者要打給誰、要不要先動作」做到體驗極致。

---

## 2. 設計原則（不可違反）

### 原則 A：零新增外部 API 呼叫

所有 booking 基礎欄位的資料源都來自**現有 pipeline 已抓回的資料**：

```
資料來源                  → booking 欄位
────────────────────────────────────────────────────
raw_sources.google_places → phone, official_url, google_maps_url
extractInsights() 結果    → reservation_required, fullness_risk, min_advance_days
```

**不為 booking 加新的 LLM / API 呼叫**。對應教授「窮人的方法」。

### 原則 B：純規則優先、LLM 補強留 Sprint 2

Sprint 1 先用 keyword + regex，**跑完 45 筆看覆蓋率報表再決定**要不要上 LLM。

理由：
- 規則寫 1 小時、跑 1 秒、結果可重現可審計
- LLM 寫 prompt 1 小時、跑 5 分鐘、可能踩 [thinking bug 重演](KNOWN_ISSUES.md)
- 規則 + Sprint 1 看覆蓋率，**有可能規則就夠用**

### 原則 C：失敗時資料留空、不假造

`reservation_required` 不確定就寫 `null`，**不要為了顯示而猜**。
UI 顯示時 `null` → 不顯示 badge（讓使用者自己判斷），不要寫 `false` 變成「保證不用預約」。

### 原則 D：data_completeness 自誠實

每筆 booking 算一個 0~1 的 completeness 分數，**UI 拿去決定要顯示完整資訊還是「資訊不足，建議致電」**。

---

## 3. 整體架構（Sprint 分期）

```
┌──────────────────────────────────────────────────────────────┐
│  既有 pipeline（不動）                                         │
│  batch-verify.ts → poi_verified.json                          │
│  Google Places + OSM + Serper blog + Gemini enrich            │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  ingestion.ts（Sprint 1 改動）                                 │
│                                                                │
│  for each verified POI:                                       │
│    ├─ tags 規則衍生（已存在）                                  │
│    ├─ extractInsights LLM（已存在）                            │
│    ├─ Embedding RETRIEVAL_DOCUMENT（已存在）                   │
│    ├─ 【新增】buildBookingMetadata()  ← 純規則、零成本         │
│    │    來源：raw_sources.google_places + insights            │
│    └─ upsert poi_catalog with metadata.booking                │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼  (Sprint 1 完成後)
┌──────────────────────────────────────────────────────────────┐
│  enrich-external-links.ts（Sprint 2 才動）                     │
│                                                                │
│  獨立排程腳本，定期跑：                                         │
│    ├─ Serper 搜 KKday/Klook 商品連結                          │
│    ├─ Jaccard 字串相似度評分                                  │
│    ├─ dry-run 輸出 draft → 人工 review                        │
│    └─ --apply 寫進 metadata.booking.external_links            │
└──────────────────────────────────────────────────────────────┘
```

### 分期理由

| 項目 | Sprint 1 | Sprint 2 |
|---|---|---|
| 整合方式 | 進 ingestion.ts 主流程 | 獨立腳本 |
| 觸發頻率 | 每次 ingest | 手動 / 定期 |
| 外部呼叫 | 0 | 90 次 Serper / 輪 |
| 失敗影響 | 影響整個 ingest | 只影響 external_links |

---

## 4. Sprint 1 詳細設計

### 4.1 檔案結構

```
agents/poi-verifier/
├── src/
│   ├── ingestion.ts                ← 已存在，加 3 行 import + 1 行呼叫
│   └── ingestion/                  ← 新增資料夾
│       └── booking.ts              ← 新增，~150 行
├── BOOKING_ENRICHMENT.md           ← 本文件
└── KNOWN_ISSUES.md
```

### 4.2 Data Contract（給  UI 看）

寫進 Supabase `poi_catalog.metadata.booking` 區塊：

```typescript
// agents/poi-verifier/src/ingestion/booking.ts

export interface BookingMetadata {
  // ── 聯絡管道（純規則抽，~80% POI 有） ─────────────────────────
  phone: string | null              // "+886-2-2492-2016"
  phone_tel_link: string | null     // "tel:+886224922016"（手機點下去直接撥）
  official_url: string | null       // 景點官方網站
  google_maps_url: string | null    // 100% 涵蓋率，從 place_id 自組

  // ── 預約屬性（從 insights 解析） ────────────────────────────────
  reservation_required: boolean | null  // null = 規則判斷不出來
  reservation_required_evidence: string[]  // 觸發 true 的 keyword 證據
  min_advance_days: number | null      // 從 blog regex 抽，如「提前 3 天」

  // ── 客滿風險（從 insights 解析） ────────────────────────────────
  fullness_risk: {
    level: 'low' | 'medium' | 'high' | 'unknown'
    hits: number                     // 規則命中次數
    evidence: string[]               // 觸發的 keyword 證據
  }

  // ── 外部連結（Sprint 2 才補） ──────────────────────────────────
  external_links: {
    kkday?: string
    klook?: string
  }

  // ── Meta ─────────────────────────────────────────────────────────
  last_updated: string              // ISO timestamp
  data_completeness: number         // 0~1，計算公式見 §4.5
}
```

#### 給 UI 的使用守則

| 欄位 | UI 該怎麼顯示 |
|---|---|
| `phone` 存在 | 顯示「📞 撥打」按鈕，連結 `phone_tel_link`（手機優先） |
| `phone` = null | 不顯示電話按鈕 |
| `official_url` 存在 | 顯示「🌐 官網」按鈕 |
| `google_maps_url` | 永遠顯示「📍 地圖」按鈕（100% 有） |
| `reservation_required` = true | 顯示「⚠️ 建議預約」橘色 badge |
| `reservation_required` = false | **不顯示任何 badge**（不要寫「免預約」） |
| `reservation_required` = null | **不顯示任何 badge** |
| `fullness_risk.level` = 'high' | 顯示「🔴 假日易客滿」紅色 badge |
| `fullness_risk.level` = 'medium' | 顯示「🟡 旺季可能客滿」黃色 badge |
| `fullness_risk.level` = 'low' / 'unknown' | 不顯示 |
| `data_completeness` < 0.4 | 顯示「⚠️ 資訊不足，建議致電確認」灰色提示 |

### 4.3 booking.ts 模組職責

```typescript
// agents/poi-verifier/src/ingestion/booking.ts
import type { PoiVerifierOutput } from '../types'

interface PoiInsights {
  constraints: string[]
  visitor_tips: string[]
  weather_notes: string[]
  crowd_notes: string | null
  recent_status: string | null
}

// 公開介面：給 ingestion.ts 呼叫
export function buildBookingMetadata(
  verified: PoiVerifierOutput,
  insights: PoiInsights | null,
): BookingMetadata
```

**只有一個公開函式**。`buildBookingMetadata` 是純函式（pure function）—
不打 API、不讀檔、不寫 DB，只做資料轉換。**好處：可以 unit test、可以隨時重跑**。

### 4.4 keyword 規則表（Sprint 1 用這份）

#### 4.4.1 reservation_required 觸發詞

```typescript
const RESERVATION_POSITIVE = [
  '預約', '訂位', '預訂', '需預約', '須預約', '提前訂',
  '須事先', '請先預約', '採預約制', '電話訂位',
  '線上訂購', 'booking', 'reservation', 'reserve',
]

const RESERVATION_NEGATIVE = [
  '不需預約', '免預約', '無需預約', '不用訂', '免訂位',
  '隨到隨', '隨時可', '無需預訂',
]
```

判斷邏輯：

```typescript
const text = JSON.stringify(insights ?? {})

const positiveHits = RESERVATION_POSITIVE.filter(k => text.includes(k))
const negativeHits = RESERVATION_NEGATIVE.filter(k => text.includes(k))

let reservation_required: boolean | null
if (negativeHits.length > 0) {
  reservation_required = false    // 明確說免預約
} else if (positiveHits.length > 0) {
  reservation_required = true
} else {
  reservation_required = null     // 無證據，留空
}
```

#### 4.4.2 fullness_risk 觸發詞

```typescript
const FULLNESS_KEYWORDS = [
  '爆滿', '客滿', '滿位', '排隊', '人潮', '塞爆',
  '擁擠', '人擠人', '滿座', '排不到', '一位難求',
  '提早到', '建議提早', '建議避開',
]
```

判斷邏輯：

```typescript
const hits = FULLNESS_KEYWORDS.filter(k => text.includes(k))

let level: 'low' | 'medium' | 'high' | 'unknown'
if (!insights) level = 'unknown'
else if (hits.length >= 2) level = 'high'
else if (hits.length === 1) level = 'medium'
else level = 'low'
```

#### 4.4.3 min_advance_days regex

```typescript
const ADVANCE_PATTERNS = [
  /提前\s*(\d+)\s*[天日]/,      // 「提前 3 天」
  /(\d+)\s*[天日]\s*前\s*預約/, // 「3 天前預約」
  /至少\s*(\d+)\s*[天日]/,      // 「至少 3 天」
]

let minAdvanceDays: number | null = null
for (const p of ADVANCE_PATTERNS) {
  const m = text.match(p)
  if (m) {
    const d = parseInt(m[1])
    if (d > 0 && d < 90) { minAdvanceDays = d; break }
  }
}
```

### 4.5 data_completeness 計算

```typescript
// 6 個欄位、每個有值給 1/6 分
function calculateCompleteness(b: BookingMetadata): number {
  let score = 0
  if (b.phone) score += 1
  if (b.official_url) score += 1
  if (b.google_maps_url) score += 1
  if (b.reservation_required !== null) score += 1
  if (b.fullness_risk.level !== 'unknown') score += 1
  if (b.external_links.kkday || b.external_links.klook) score += 1
  return Math.round((score / 6) * 100) / 100
}
```

預估 Sprint 1 跑完後分數分布：
- google_maps_url 100% 有 → 至少 0.17
- phone ~80% 有 → 多 0.17
- official_url ~40% 有 → 多 0.07
- reservation_required ~50% 有判斷 → 多 0.08
- fullness_risk 100% 有判斷 → 多 0.17
- external_links 0%（Sprint 2 才補）→ 0
- **預期平均 ~0.66**

### 4.6 ingestion.ts 改動最小化

```typescript
// agents/poi-verifier/src/ingestion.ts （差異只有 3 處）

// 1. 加 import
import { buildBookingMetadata } from './ingestion/booking'

// 2. 在 upsert 前算 booking（位置：第 211 行附近）
const booking = buildBookingMetadata(verified, insights)

// 3. upsert 的 metadata 區塊加 booking
const { error } = await supabase.from('poi_catalog').upsert({
  // ... 既有
  metadata: {
    is_indoor:            facts.is_indoor,
    level:                enr.suggested_level,
    // ... 既有
    booking,                          // ← 加這一行
  },
}, { onConflict: 'id' })
```

### 4.7 完整 booking.ts code（直接照貼）

```typescript
// agents/poi-verifier/src/ingestion/booking.ts
import type { PoiVerifierOutput } from '../types'

export interface BookingMetadata {
  phone: string | null
  phone_tel_link: string | null
  official_url: string | null
  google_maps_url: string | null
  reservation_required: boolean | null
  reservation_required_evidence: string[]
  min_advance_days: number | null
  fullness_risk: {
    level: 'low' | 'medium' | 'high' | 'unknown'
    hits: number
    evidence: string[]
  }
  external_links: { kkday?: string; klook?: string }
  last_updated: string
  data_completeness: number
}

interface PoiInsights {
  constraints?: string[]
  visitor_tips?: string[]
  weather_notes?: string[]
  crowd_notes?: string | null
  recent_status?: string | null
}

const RESERVATION_POSITIVE = [
  '預約', '訂位', '預訂', '需預約', '須預約', '提前訂',
  '須事先', '請先預約', '採預約制', '電話訂位',
  '線上訂購', 'booking', 'reservation', 'reserve',
]
const RESERVATION_NEGATIVE = [
  '不需預約', '免預約', '無需預約', '不用訂', '免訂位',
  '隨到隨', '隨時可', '無需預訂',
]
const FULLNESS_KEYWORDS = [
  '爆滿', '客滿', '滿位', '排隊', '人潮', '塞爆',
  '擁擠', '人擠人', '滿座', '排不到', '一位難求',
  '提早到', '建議提早', '建議避開',
]
const ADVANCE_PATTERNS = [
  /提前\s*(\d+)\s*[天日]/,
  /(\d+)\s*[天日]\s*前\s*預約/,
  /至少\s*(\d+)\s*[天日]/,
]

function buildTelLink(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : null
}

function buildGoogleMapsUrl(placeId: string | null | undefined): string | null {
  if (!placeId) return null
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`
}

function calculateCompleteness(b: BookingMetadata): number {
  let score = 0
  if (b.phone) score += 1
  if (b.official_url) score += 1
  if (b.google_maps_url) score += 1
  if (b.reservation_required !== null) score += 1
  if (b.fullness_risk.level !== 'unknown') score += 1
  if (b.external_links.kkday || b.external_links.klook) score += 1
  return Math.round((score / 6) * 100) / 100
}

export function buildBookingMetadata(
  verified: PoiVerifierOutput,
  insights: PoiInsights | null,
): BookingMetadata {
  const gp = verified.raw_sources?.google_places
  const phone = gp?.formatted_phone_number ?? null
  const officialUrl = gp?.website ?? null
  const googleMapsUrl = buildGoogleMapsUrl(gp?.place_id ?? null)

  // 解析 insights
  const text = insights ? JSON.stringify(insights) : ''

  // reservation_required
  const positiveHits = RESERVATION_POSITIVE.filter(k => text.includes(k))
  const negativeHits = RESERVATION_NEGATIVE.filter(k => text.includes(k))
  let reservation_required: boolean | null
  let reservation_evidence: string[] = []
  if (negativeHits.length > 0) {
    reservation_required = false
    reservation_evidence = negativeHits
  } else if (positiveHits.length > 0) {
    reservation_required = true
    reservation_evidence = positiveHits
  } else {
    reservation_required = null
  }

  // fullness_risk
  const fullnessHits = FULLNESS_KEYWORDS.filter(k => text.includes(k))
  let fullnessLevel: 'low' | 'medium' | 'high' | 'unknown'
  if (!insights) fullnessLevel = 'unknown'
  else if (fullnessHits.length >= 2) fullnessLevel = 'high'
  else if (fullnessHits.length === 1) fullnessLevel = 'medium'
  else fullnessLevel = 'low'

  // min_advance_days
  let minAdvanceDays: number | null = null
  for (const p of ADVANCE_PATTERNS) {
    const m = text.match(p)
    if (m) {
      const d = parseInt(m[1])
      if (d > 0 && d < 90) { minAdvanceDays = d; break }
    }
  }

  const booking: BookingMetadata = {
    phone,
    phone_tel_link: buildTelLink(phone),
    official_url: officialUrl,
    google_maps_url: googleMapsUrl,
    reservation_required,
    reservation_required_evidence: reservation_evidence,
    min_advance_days: minAdvanceDays,
    fullness_risk: {
      level: fullnessLevel,
      hits: fullnessHits.length,
      evidence: fullnessHits,
    },
    external_links: {},  // Sprint 2 才補
    last_updated: new Date().toISOString(),
    data_completeness: 0,  // 下面算
  }
  booking.data_completeness = calculateCompleteness(booking)
  return booking
}
```

### 4.8 驗收方式

跑完 Sprint 1 後產出一份覆蓋率報表：

```typescript
// agents/poi-verifier/bench-booking.ts （驗收用，類似 bench-tasktype.ts）

跑完 ingest 45 筆後，從 Supabase 撈 metadata.booking 統計：
  - phone 覆蓋率（預期 ~80%）
  - official_url 覆蓋率（預期 ~40%）
  - google_maps_url 覆蓋率（預期 100%）
  - reservation_required 分布（true / false / null 各幾筆）
  - fullness_risk 分布（high / medium / low / unknown 各幾筆）
  - data_completeness 平均 / 中位數 / 最低
```

#### 預期驗收結果（要打到這個門檻才算 Sprint 1 過關）

| 指標 | 門檻 |
|---|---|
| phone 覆蓋率 | ≥ 70% |
| google_maps_url 覆蓋率 | ≥ 95% |
| reservation_required 至少有判斷的筆數（非 null） | ≥ 60% |
| data_completeness 平均 | ≥ 0.55 |

低於門檻 → 進 Sprint 2 LLM 補強。
達標 → 直接交給 jerry 接 UI。

---

## 5. Sprint 2 詳細設計

### 5.1 觀光署 V2.1 補強（補 phone / official_url）

實際 dataset endpoint（2026-05-26 驗證可用、HTTP 200、CORS 開放）：

| 來源 | URL | 大小 |
|---|---|---|
| **景點 JSON zip** | `https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip` | 2.95 MB |
| 景點 XML zip | `https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-xml.zip` | — |
| 格式規範 PDF | `https://media.taiwan.net.tw/Upload/觀光資料標準V2.1.pdf` | — |

> ⚠️ 路徑寫 `v2.0` 但實際是 V2.1 標準資料（政府網站版號 URL 沒同步更新）。
> 不要誤用 V1.0 endpoint（`scenic_spot_C_f.json`），2026-06-30 下架。

| 步驟 | 內容 |
|---|---|
| 下載 | `fetch` 抓 zip，用 `adm-zip` 解壓出 `Attraction.json` |
| 落地 | `agents/poi-verifier/data/cwa-tourism-v21.json` |
| 比對 | 用 POI 名稱 + 經緯度（haversine < 1km）模糊比對 |
| 補強 | phone 與 official_url 為 null 時用 V2.1 的補 |

放到 `src/ingestion/booking.ts` 加一個 `enrichFromCwa()`：

```typescript
function enrichFromCwa(booking: BookingMetadata, poiName: string, lat: number, lng: number): BookingMetadata {
  const cwaMatch = matchCwaTourism(poiName, lat, lng)
  if (!cwaMatch) return booking
  return {
    ...booking,
    phone: booking.phone ?? cwaMatch.Phone ?? null,
    official_url: booking.official_url ?? cwaMatch.WebsiteUrl ?? null,
  }
}
```

### 5.2 LLM 補強（補 reservation_required null 的）

只跑 Sprint 1 規則沒判斷出來的 POI，**省 quota**。

```typescript
// 偽碼
if (booking.reservation_required === null && insights) {
  const llmResult = await askGeminiBooking(poi, insights)
  booking.reservation_required = llmResult.reservation_required
  booking.reservation_required_evidence = ['LLM 判斷']
}
```

Prompt 要點：
- 餵：POI 名稱、Google 評分、insights
- 問：「根據以上資訊，這個景點需要預約嗎？只回 true/false/unknown」
- `thinkingBudget: 0`（避免 [thinking bug 重演](KNOWN_ISSUES.md)）
- `maxOutputTokens: 50`（夠回單字）

### 5.3 external-links 獨立腳本

完整設計已寫在 [enrich-external-links.ts](enrich-external-links.ts)，要點：

| 設計 | 說明 |
|---|---|
| 三段流程 | dry-run → 人工 review → --apply |
| URL pattern filter | `/product/` `/activity/`，擋 KKday blog |
| Jaccard 字串相似度 | 評估「POI 名 vs 商品標題」 |
| 三級 confidence | high (≥0.5) / needs_review (0.3-0.5) / none |
| --apply 只寫 high | 風險最低 |

**Sprint 2 才執行，不要動 Sprint 1**。

---

## 6. 跟既有架構的相容性

### 6.1 不會破壞的部分

| 既有功能 | 為什麼不影響 |
|---|---|
| poi-verifier batch-verify | 完全不改，這層只讀檔不寫 |
| extractInsights LLM | 完全不改 |
| Embedding 與 task_type | 完全不改 |
| match_poi_catalog RPC | 不改 schema（只在 metadata JSONB 加區塊） |
| jerry 的 UI | poi-kb.ts 改 generator 重跑就帶上 |

### 6.2 需要同步的部分

| 動作 | 誰來做 | 何時 |
|---|---|---|
| 重跑 ingest 45 筆 | 你 | Sprint 1 寫完當天 |
| 重跑 `gen-poi-kb.js` 把 booking 帶進 poi-kb.ts | 你 | ingest 完隔天 |
| jerry UI 加 badge / 按鈕 | jerry | Sprint 1 驗收後 |
| 更新 PROJECT_BRIEF.md 加 booking 章節 | Nicole 或你 | Sprint 1 過關後 |

---

## 7. 風險與緩解

| 風險 | 緩解 |
|---|---|
| **keyword 規則命中過廣**（例如部落格寫「不用排隊」也算 hit） | 用 negative keyword、看 Sprint 1 報表決定要不要加 |
| **phone 在 google_places 是台灣格式但 tel: 連結失敗** | `buildTelLink` 只保留 `+` 跟數字，已測試 |
| **reservation_required 假陽性** | 加 evidence 欄位給 UI 顯示原因、使用者能判斷 |
| **重跑 ingest 又踩 Gemini quota** | 用付費 Tier 1 key（你已有） |
| **booking 區塊跟未來 LLM 補強衝突** | LLM 結果只在 null 欄位補、不覆蓋規則判斷 |

---

## 8. 對齊教授 5/20 建議

| 教授講的 | 本設計怎麼對齊 |
|---|---|
| 「資料去蕪存菁的過程是核心價值」 | booking 區塊讓「使用者不會白跑」這件事可量化（data_completeness） |
| 「Pre-processing 不要把雜訊丟 LLM」 | Sprint 1 純規則零 LLM；Sprint 2 LLM 只補規則漏的 |
| 「Sentinel 用 cron 不要用 LLM 輪詢」 | external-links 設計成獨立排程腳本，符合精神 |
| 「先求影響力再談商業化」 | external-links 不帶 affiliate ID、保持中立 |
| 「窮人的方法」 | 零新外部呼叫、純規則優先 |

---

## 9. 待補 / 未解問題

1. ~~觀光署 V2.1 dataset 下載連結需確認~~ ✅ 2026-05-26 已確認，見 §5.1
2. **`gen-poi-kb.js` 重跑機制** — 需確認 jerry 那邊是否能自動讀 metadata.booking、還是需要改 generator
3. **Sprint 2 LLM 補強 prompt 草稿** — 等 Sprint 1 報表出來才知道要補什麼
4. **`bench-booking.ts` 驗收腳本** — 設計已寫，code 留 Sprint 1 動工時寫

---

## 10. 相關檔案

- 規格本文：`agents/poi-verifier/BOOKING_ENRICHMENT.md`（本檔）
- 主實作：`agents/poi-verifier/src/ingestion/booking.ts`（待建）
- 主流程：`agents/poi-verifier/src/ingestion.ts`（待改 3 行）
- 驗收：`agents/poi-verifier/bench-booking.ts`（待建）
- Sprint 2：`agents/poi-verifier/enrich-external-links.ts`（已存在，本次不動）
- 相關問題：[KNOWN_ISSUES.md](KNOWN_ISSUES.md)
