# POI 驗證 Agent（poi-verifier）

Navigator 核心子系統：自動驗證景點資訊真實性、自動分級（L0-L3）、生成備案邏輯。

## 目標

解決「網路景點資訊真假難辨」痛點。通過以下流程確保行程中每個景點都經過驗證：

1. **驗證來源** — Google Places、OpenStreetMap、中央氣象署交叉驗證
2. **資訊補充** — 營業時段、聯絡方式、評分、天氣敏感度
3. **自動分級** — 根據使用者選擇歷史與景點屬性，分配 L0-L3 等級
4. **備案邏輯** — 生成 Swap（同層級換景點）或 Switch（時段調整）建議

## 核心概念

### L0-L3 景點分級

| 等級   | 定義     | 可變性     | 例子                   |
| ------ | -------- | ---------- | ---------------------- |
| **L0** | 絕對錨點 | 禁止替換   | 預訂好的餐廳、票券景點 |
| **L1** | 彈性錨點 | 可平移時段 | 日出、特定表演         |
| **L2** | 條件變動 | 天氣變可換 | 戶外踏青（雨天→室內）  |
| **L3** | 水位調節 | 自動 swap  | 路邊景點、快速停留     |

### Swap vs Switch 決策樹

```
天氣預警 / 交通延誤 /使用者手動 flag
         ↓
    是否涉及 L0/L1？
    ↙ 否           ↘ 是
  Swap        Switch
(同層級換景點)  (延遲整段行程)
```

## 核心模組結構

```
agents/poi-verifier/
├── src/
│   ├── types.ts              # POI、驗證結果、備案邏輯型別定義
│   ├── validators/           # 驗證邏輯
│   │   ├── google-places.ts  # Google Places API 查詢
│   │   ├── osm.ts            # OpenStreetMap 查詢
│   │   └── index.ts          # 交叉驗證總協調器
│   ├── enrichers/            # 增強邏輯
│   │   ├── level-classifier.ts  # L0-L3 自動分級
│   │   ├── resilience-generator.ts # 備案邏輯生成
│   │   └── index.ts          # 增強流程控制
│   └── agent.ts              # Agent 主邏輯（invoke、parse output）
├── tests/
│   ├── validators.test.ts    # 驗證單元測試
│   ├── enrichers.test.ts     # 增強邏輯測試
│   └── integration.test.ts   # 端對端測試（與 main app Route Handlers）
└── README.md                 # 本文件
```

## API 介面（Route Handlers）

### POST /api/poi/verify

驗證單個景點。

```typescript
// 請求
{
  poi: {
    name: "陽明山竹子湖海芋",
    location: { latitude: 25.16, longitude: 121.55 },
    user_description?: "春天必去，人會很多"
  },
  context?: {
    trip_id: "uuid",
    group_size: 4,
    vibe_tags: ["自然", "拍照"]
  }
}

// 回應
{
  verification_result: {
    exists: true,
    source: ["google_places", "osm"],
    reliability_score: 0.95,
    facts: {
      official_name: "竹子湖海芋",
      hours: "全年開放",
      average_stay_minutes: 90,
      last_verified_at: "2026-04-30T12:00:00Z"
    }
  },
  enrichment_result: {
    suggested_level: 2,
    level_reasoning: "季節性景點，天氣敏感度高",
    backup_logic: {
      strategy_type: "swap_same_level",
      candidate_pool_tags: ["室內景點", "同區"],
      proximity_threshold_meters: 5000
    }
  },
  cost_estimate: {
    tokens_used: 420,
    estimated_cost_ntd: 0.25
  }
}
```

### POST /api/poi/batch-verify

批次驗證多個景點（成本優化）。

## 開發步驟

### Phase 1: 基礎實作（當前）

- [ ] `types.ts` — POI、驗證結果、備案邏輯型別定義
- [ ] `validators/` — Google Places + OSM 交叉驗證模組
- [ ] `enrichers/` — L0-L3 分級、備案邏輯生成模組
- [ ] `agent.ts` — 主邏輯（invoke LLM、parse JSON）
- [ ] Route Handlers — `/api/poi/verify`、`/api/poi/batch-verify`

### Phase 2: 成本優化

- [ ] Token 預算控制（目標：< NT$5/次）
- [ ] Funnel retrieval（RDB → pgvector → level tagging）
- [ ] 快取策略（Redis）

### Phase 3: 整合

- [ ] 與主應用流程整合（Architect Agent）
- [ ] 45 筆 demo POI 驗證與導入 Supabase

## 技術棧

| 層面     | 選擇                                       | 原因                        |
| -------- | ------------------------------------------ | --------------------------- |
| LLM      | Gemini 1.5 Flash（主）/ Claude Haiku（備） | 便宜、中文 OK、結構化輸出穩 |
| 外部 API | Google Places / OSM                        | 免費、可信                  |
| 資料庫   | Supabase PostgreSQL + pgvector             | 結構化 + 向量檢索           |
| 快取     | 預留（目前不用 Redis）                     | Supabase Realtime 足夠      |

## 成本預估

目標：每次驗證 < NT$5（以 Gemini 1.5 Flash 計算）

- Google Places lookup：$0（quota 免費部分）
- LLM 調用（structure extraction + enrichment）：NT$0.5-1.5/次
- 批次查詢折扣：NT$3-4/10 筆景點

## 檔案更新記錄

| 日期       | 異動 | 說明                     |
| ---------- | ---- | ------------------------ |
| 2026-04-30 | 建立 | 初版目錄結構 + 本 README |

---

**更新日期**：2026-04-30  
**對應 DEVLOG**：[2026-04-30 項目結構調整](../../DEVLOG.md#2026-04-30項目結構調整--poi-驗證-agent-開發啟動)
