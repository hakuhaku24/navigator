# 45 POI 批次驗證報告：P0（官網）+ P1（PTT）

> ⚠️ **測試資料聲明**：本報告使用的 45 筆 POI 來自 `results/poi_verified.json`（專案實際資料集），非 Claude 自行選定的情境。

**執行時間**：2026/6/4 下午11:07:06  
**完成時間**：2026/6/4 下午11:17:51（耗時 645 秒）  
**測試腳本**：`tests/batch-new-validators.test.ts`  
**結果 JSON**：`results/poi_ptt_official_results.json`

## 總覽

| 項目 | 數值 |
|------|------|
| 測試 POI 總數 | 45 筆 |
| [P1] 有 PTT 文章的景點 | 22 / 45 |
| [P1] PTT 文章總篇數 | 216 篇 |
| [P0] 找到官網且可連線 | 12 / 45 |
| [P0] 官網不相關自動拒絕 | 22 筆回傳 null（含真的無官網）|

---

## 北海岸（15 筆）

| POI ID | 景點名稱 | [P1] PTT 篇數 | PTT 最新 | [P0] 官網 | 官網標題 |
|--------|---------|--------------|---------|-----------|---------|
| NCA-001 | 野柳海洋世界 (預約席) | — | — | — | — |
| NCA-002 | 野柳地質公園 | 16 篇 | 2026-01-30 | — | — |
| NCA-003 | 朱銘美術館 | 19 篇 | 2026-05-20 | — | — |
| NCA-004 | 老梅綠石槽 | 24 篇 | 2026-06-03 | [連結](https://www.greenmobile.com.tw/老梅綠石槽/) | 老梅綠石槽 Laomei Green R |
| NCA-005 | 金山老街 | 4 篇 | 2026-04-30 | — | — |
| NCA-006 | 富貴角燈塔 | 10 篇 | 2026-05-04 | [連結](https://www.tienlai.com.tw/en/spot/ins.php?index_m_id=13&index_id=37) | 富貴角燈塔-Yangmingshan T |
| NCA-007 | 神祕海岸 | — | — | — | — |
| NCA-008 | 淺水灣海濱公園 | — | — | — | — |
| NCA-009 | 法鼓山世界佛教園區 | — | — | — | — |
| NCA-010 | 石門洞 | 12 篇 | 2026-03-16 | [連結](https://www.greenmobile.com.tw/石門洞/) | 石門洞 Shimen Cave - Gr |
| NCA-011 | 龜吼漁港 | 5 篇 | 2025-11-20 | [連結](https://www.daisyyohoho.com/gui-hou-fish-market/) | 龜吼漁港 萬里蟹這裡吃，小小漁港、滿滿海 |
| NCA-012 | 石門婚紗廣場 | 5 篇 | 2026-05-22 | — | — |
| NCA-013 | 白沙灣探索館 | — | — | — | — |
| NCA-014 | 麟山鼻木棧道 | — | — | — | — |
| NCA-015 | 北海岸特產專賣店 (劉家肉粽) | — | — | — | — |

## 陽明山（15 筆）

| POI ID | 景點名稱 | [P1] PTT 篇數 | PTT 最新 | [P0] 官網 | 官網標題 |
|--------|---------|--------------|---------|-----------|---------|
| YMS-001 | 草山行館 (午餐預約) | — | — | [連結](https://www.walkerland.com.tw/article/view/396661) | 陽明山景觀餐廳。草山行館。總統官邸吃午餐 |
| YMS-002 | 中山樓 (定時導覽) | — | — | — | — |
| YMS-003 | 陽明書屋 | 3 篇 | 2026-05-15 | — | — |
| YMS-004 | 擎天崗大草原 | 4 篇 | 2025-12-10 | — | — |
| YMS-005 | 小油坑噴氣口 | — | — | — | — |
| YMS-006 | 竹子湖海芋/繡球花田 | — | — | [連結](https://www.taiwanfarm.org.tw/zh-TW/Front/SASNews/Detail/52) | 【相關報導】2026竹子湖海芋季開幕　「 |
| YMS-007 | 二子坪步道 | 7 篇 | 2026-04-27 | [連結](https://bobbytravel.tw/erziping-trail/) | 【台北】陽明山二子坪步道：蝴蝶花廊美譽！ |
| YMS-008 | 夢幻湖 | 35 篇 | 2026-06-05 | — | — |
| YMS-009 | 大屯自然公園 | 2 篇 | 2025-12-06 | — | — |
| YMS-010 | 冷水坑泡腳池 | — | — | — | — |
| YMS-011 | 硫磺谷遊憩區 | — | — | — | — |
| YMS-012 | 陽明山花鐘 | 1 篇 | 2026-02-27 | — | — |
| YMS-013 | CAMA 咖啡 (豆留森林) | — | — | [連結](https://www.camacafe.com/) | cama 現烘咖啡專門店 |
| YMS-014 | 前山公園 | 3 篇 | 2026-01-19 | — | — |
| YMS-015 | 菁山露營場觀景台 | — | — | — | — |

## 東北角（15 筆）

| POI ID | 景點名稱 | [P1] PTT 篇數 | PTT 最新 | [P0] 官網 | 官網標題 |
|--------|---------|--------------|---------|-----------|---------|
| NEI-001 | 福隆福容飯店 (Check-in) | — | — | — | — |
| NEI-002 | 阿妹茶樓 (預約席) | — | — | [連結](https://www.a-meiteahouse.com/en/副本-茶樓導覽) | 二版茶樓導覽 | Ameiteahous |
| NEI-003 | 國立海科館 (門票) | — | — | — | — |
| NEI-004 | 黃金博物館 (坑道體驗) | — | — | — | — |
| NEI-005 | 舊草嶺隧道 (自行車) | — | — | — | — |
| NEI-006 | 鼻頭角步道 | 11 篇 | 2026-05-30 | — | — |
| NEI-007 | 九份老街 | 20 篇 | 2026-04-13 | — | — |
| NEI-008 | 潮境公園 | 14 篇 | 2026-05-18 | — | — |
| NEI-009 | 三貂角燈塔 | 9 篇 | 2026-06-05 | [連結](https://newtaipei.travel/zh-tw/attractions/detail/110112) | 三貂角燈塔 | 新北市觀光旅遊網 |
| NEI-010 | 南雅奇岩觀景區 | — | — | — | — |
| NEI-011 | 報時山步道 | 7 篇 | 2026-06-08 | [連結](https://annieko.tw/jiufen/) | 金瓜石景點【報時山步道】 輕鬆步行最美觀 |
| NEI-012 | 八斗子車站 | 4 篇 | 2026-05-14 | — | — |
| NEI-013 | 深澳象鼻岩 | 1 篇 | 2026-05-14 | [連結](https://www.letsgoplay.com.tw/?p=6401) | SUP北部 &#8211; 『深澳象鼻岩 |
| NEI-014 | 卯澳漁村 (小卷米粉) | — | — | — | — |
| NEI-015 | 萊萊秘境咖啡 | — | — | — | — |

---

## 觀察與建議

### PTT 零結果景點（23 筆）

以下景點在 travel / Hiking / Taipei 三版均無搜尋結果，可能原因：冷門景點、PTT 討論用不同名稱、或屬商業設施（討論在其他版）。

- `NCA-001` 野柳海洋世界 (預約席)
- `NCA-007` 神祕海岸
- `NCA-008` 淺水灣海濱公園
- `NCA-009` 法鼓山世界佛教園區
- `NCA-013` 白沙灣探索館
- `NCA-014` 麟山鼻木棧道
- `NCA-015` 北海岸特產專賣店 (劉家肉粽)
- `YMS-001` 草山行館 (午餐預約)
- `YMS-002` 中山樓 (定時導覽)
- `YMS-005` 小油坑噴氣口
- `YMS-006` 竹子湖海芋/繡球花田
- `YMS-010` 冷水坑泡腳池
- `YMS-011` 硫磺谷遊憩區
- `YMS-013` CAMA 咖啡 (豆留森林)
- `YMS-015` 菁山露營場觀景台
- `NEI-001` 福隆福容飯店 (Check-in)
- `NEI-002` 阿妹茶樓 (預約席)
- `NEI-003` 國立海科館 (門票)
- `NEI-004` 黃金博物館 (坑道體驗)
- `NEI-005` 舊草嶺隧道 (自行車)
- `NEI-010` 南雅奇岩觀景區
- `NEI-014` 卯澳漁村 (小卷米粉)
- `NEI-015` 萊萊秘境咖啡

### 成功找到官網的景點（12 筆）

- `NCA-004` **老梅綠石槽** → https://www.greenmobile.com.tw/老梅綠石槽/
- `NCA-006` **富貴角燈塔** → https://www.tienlai.com.tw/en/spot/ins.php?index_m_id=13&index_id=37
- `NCA-010` **石門洞** → https://www.greenmobile.com.tw/石門洞/
- `NCA-011` **龜吼漁港** → https://www.daisyyohoho.com/gui-hou-fish-market/
- `YMS-001` **草山行館 (午餐預約)** → https://www.walkerland.com.tw/article/view/396661
- `YMS-006` **竹子湖海芋/繡球花田** → https://www.taiwanfarm.org.tw/zh-TW/Front/SASNews/Detail/52
- `YMS-007` **二子坪步道** → https://bobbytravel.tw/erziping-trail/
- `YMS-013` **CAMA 咖啡 (豆留森林)** → https://www.camacafe.com/
- `NEI-002` **阿妹茶樓 (預約席)** → https://www.a-meiteahouse.com/en/副本-茶樓導覽
- `NEI-009` **三貂角燈塔** → https://newtaipei.travel/zh-tw/attractions/detail/110112
- `NEI-011` **報時山步道** → https://annieko.tw/jiufen/
- `NEI-013` **深澳象鼻岩** → https://www.letsgoplay.com.tw/?p=6401

### 已知限制

- **DDG 相關性驗證**：`fetchOfficialWebsite` 已加入景點名稱比對，頁面不含景點名稱詞段則回傳 `null`，不捏造 URL
- **PTT 連線不穩**：偶發 ECONNRESET（尤其 Hiking 版），已由 try/catch 容錯
- **官網 JavaScript-only**：部分 .gov.tw 頁面需 JS 渲染，`excerpt` 品質較差（僅顯示「需開啟 JavaScript」提示）
- **本批次測試**：P0/P1 獨立執行，未整合至完整 `verifyPoi()` pipeline（無 LLM enrichment）
- **官網品質待確認**：部分 P0 命中結果（如 greenmobile.com.tw、walkerland.com.tw）是旅遊部落格而非景點的真正官網，相關性驗證仍可強化

---

## 下一步（TODO）

### 短期（期末 demo 前優先）

1. **[P2] 申請 YouTube Data API key 並執行測試**
   - GCP Console → 開啟 YouTube Data API v3 → 複製 key 到 `.env.local`
   - 執行 `ts-node tests/new-validators.test.ts` 確認 YouTube 段落通過
   - 再執行 `ts-node tests/batch-new-validators.test.ts` 取得完整三源結果

2. **強化 P0 官網品質過濾（區分真官網 vs 旅遊部落格）**
   - 目前 12 筆「官網」中混入旅遊部落格（greenmobile、walkerland、bobbytravel 等）
   - 可在 `discoverWebsiteUrl` 加入部落格網域黑名單，或優先選取景點自有網域（如 `.com.tw` 含景點名稱關鍵字）
   - 參考：`src/validators/official-website.ts` → `SKIP_URL_FRAGMENTS` 清單

3. **將 P0/P1/P2 結果整合進完整 `verifyPoi()` pipeline**
   - 目前批次測試是獨立呼叫各 validator，未觸發 LLM enrichment
   - 在 `batch-verify.ts` 加入新源旗標，執行完整管線後對比新舊 `reliability_score`
   - 觀察加入三個新源後分數提升幅度是否合理（預期提升 0.1–0.3）

4. **修正 `necoast-nsa.gov.tw` 多次 timeout 問題**
   - 東北角風管處子頁面（`/Attraction-Content.aspx?a=...`）回應極慢
   - 建議：將 `necoast-nsa.gov.tw/Attraction` 加入 `SKIP_URL_FRAGMENTS`，改抓首頁或完全跳過
   - 替代方案：以 Google Places + PTT 作為東北角景點的主要驗證來源

### 中期（demo 後 / 下一個 sprint）

5. **補齊 PTT 零結果的 23 筆景點**
   - 多數是北海岸小景點（神祕海岸、淺水灣、法鼓山）和餐廳/商家類 POI
   - PTT 討論可能用不同名稱（例如「淺水灣」可能在板上叫「北海岸沙灘」）
   - 可嘗試在 `searchPttPosts` 加入 `aliases` 參數，搜尋備用關鍵字

6. **Dcard 整合評估**
   - 取得 Dcard 書面同意後，參考 `docs/dcard-search腳本.md` 實作正式 validator
   - 預期補充 PTT 覆蓋不到的年輕族群評論（18–30 歲）
   - 先 demo 後再做，列 P3

7. **將 `poi_ptt_official_results.json` 的官網 URL 回填至 `poi_enriched.json`**
   - 對 12 筆有官網的 POI，在 `poi_enriched.json` 加入 `website_url` 欄位
   - 之後呼叫 `fetchOfficialWebsite(poi, poi.website_url)` 可跳過 DDG 發現步驟，加速且更準確