# POI 驗證 Agent（poi-verifier）

Navigator 的核心子系統：驗證景點資訊是否真實可靠，補足關鍵屬性，並產生可執行的備案建議。

## 2026-05-03 更新摘要

- 完成 `poi-verifier` 設計文件重寫，明確納入「部落格文章驗證」「最新部落格日期」「來源分級」「時間衰減」「多準則排序」「嚴格備案篩選」等要素。
- 目前狀態為「設計與文件完成，實作已排入下一階段」。
- 此 README 與 `DEVLOG.md` 同步，對應教授回饋與 `references/` 中的應變要求。

## 目標

`poi-verifier` 的任務是：

1. 驗證 POI 是否仍在營業、資訊是否可信
2. 整合多來源資料並標註可信度
3. 生成 L0-L3 旅遊彈性分級
4. 產生對應備案邏輯，供應變 Agent 使用

## 設計原則

- **可信度優先**：用多來源交叉驗證，而不是只靠單一資料源
- **資訊透明**：顯示資料來源與最新查證時間
- **時間敏感**：為部落格與使用者評論加上時間衰減權重
- **嚴格備案**：先過濾不可靠候選，再排序推薦
- **低成本**：後端設計要支援批次查詢與 token 預算

## 目前核心功能

- 多來源驗證：`Google Places`、`OpenStreetMap`、旅遊部落格/部落客內容
- 資料可信度分級：`official > semi_official > blog_travel`
- 時效性標記：`latest_blog_post_date`、`time_decay_factor`
- 多準則打分：評分、距離、開放時間餘裕、情境適配度、評論數
- 自動分級：L0、L1、L2、L3
- 備案邏輯：Swap / Switch 與候選池描述

## 目標輸出格式

`poi-verifier` 目標輸出一個完整 JSON，包含：

- `verification_result`
  - `exists`
  - `source`
  - `reliability_score`
  - `facts`
  - `latest_blog_post_date`
- `enrichment_result`
  - `suggested_level`
  - `level_reasoning`
  - `backup_logic`
- `cost_estimate`
  - `validation_metadata`

範例：

```json
{
  "verification_result": {
    "exists": true,
    "source": ["google_places", "osm", "blog_travel"],
    "reliability_score": 0.88,
    "facts": {
      "official_name": "金山老街",
      "hours": "09:00-18:00",
      "average_stay_minutes": 60,
      "last_verified_at": "2026-05-03T08:40:00Z",
      "latest_blog_post_date": "2026-03-22"
    }
  },
  "enrichment_result": {
    "suggested_level": 2,
    "level_reasoning": "戶外商圈，受天氣影響，需備案到室內景點",
    "backup_logic": {
      "strategy_type": "swap_same_level",
      "candidate_pool_tags": ["indoor", "nearby", "same_district"],
      "proximity_threshold_meters": 3000
    }
  }
}
```

## 架構與檔案

```
agents/poi-verifier/
├── src/
│   ├── types.ts
│   ├── validators/
│   │   ├── google-places.ts
│   │   ├── osm.ts
│   │   ├── blog-verifier.ts
│   │   └── index.ts
│   ├── enrichers/
│   │   ├── level-classifier.ts
│   │   ├── source-ranking.ts
│   │   ├── backup-logic.ts
│   │   └── index.ts
│   ├── agent.ts
│   └── utils.ts
├── tests/
│   ├── validators.test.ts
│   ├── enrichers.test.ts
│   └── integration.test.ts
└── README.md
```

## API 介面規劃

### POST /api/poi/verify

用途：單一景點驗證與補強。

請求結構：

```ts
{
  "poi": {
    "name": string,
    "location": { "latitude": number, "longitude": number },
    "user_description"?: string
  },
  "context"?: {
    "trip_id"?: string,
    "group_size"?: number,
    "vibe_tags"?: string[],
    "timestamp"?: string
  }
}
```

回應將包含：

- `verification_result`
- `enrichment_result`
- `validation_metadata`
- `cost_estimate`

### POST /api/poi/batch-verify

用途：批次驗證多個 POI，降低成本並支援行程採集。

## 開發計畫

### Phase 1：設計與文件完成（已達成）

- 重新整理 `poi-verifier` README
- 完整列出驗證與備案邏輯需求
- 將 `blog` 資訊納入可信度與時效檢查
- 與 `contingency-handler` 設計做概念對齊

### Phase 2：實作與驗證（進行中）

- [ ] `src/types.ts`：POI、驗證結果、來源 metadata
- [ ] `src/validators/google-places.ts`
- [ ] `src/validators/osm.ts`
- [ ] `src/validators/blog-verifier.ts`
- [ ] `src/enrichers/source-ranking.ts`
- [ ] `src/enrichers/level-classifier.ts`
- [ ] `src/enrichers/backup-logic.ts`
- [ ] `src/agent.ts`
- [ ] 單元測試與端對端測試

### Phase 3：整合與 Demo

- [ ] 與主應用 `Architect Agent` 串接
- [ ] 以 `references/` 案例驗證 2 個極端情境：大雨、景點閉館
- [ ] 在 `DEVLOG.md` 中記錄實作結果

## 與教授建議對齊

- 來源分級：`官方 > 半官方 > 部落格`
- 時效性：資料日期記錄與衰減機制
- 嚴格備案：先過濾再排序，不導向最糟方案
- Backup Plan：不只推薦單一答案，支援 `Swap` / `Switch`
- Context Engineering：供應變 Agent 使用的結構化背景資訊

## 參考資料

- `references/資管題目發想_0429_md.md`
- `references/0429_教授回饋整理.md`
- `references/測資Json.json`

---

**更新日期**：2026-05-03
