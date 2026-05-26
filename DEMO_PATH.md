# Navigator Demo 路徑規劃

> 期末展示用。目標：5-8 分鐘內讓教授看懂「AI 時代旅行社」的核心價值。
> 最後更新：2026-05-26

---

## 故事主軸

**四個大學生，週六想去北海岸一日遊。**
出發前有兩個問題：大家想去的地方不一樣、下午有降雨預報。
Navigator 幫他們在 10 分鐘內收斂決策、預先備案、確認不白跑。

---

## Demo 流程（8 步驟）

### Step 1 ─ 建立行程房間（30 秒）
- Jerry 建立「週末北海岸趴」房間
- 複製邀請連結，三位朋友加入
- **畫面重點**：房間人員清單即時出現（Supabase Realtime）

### Step 2 ─ Tinder Swipe 挑景點（2 分鐘）
- 四人各自滑 NCA 區 15 筆 POI
- 每人投票：右滑 Like、愛心 MUST-GO、叉叉 VETO
- **畫面重點**：POI 卡片顯示景點照片、等級、天氣敏感度
- **Demo 資料**：預先設定好投票結果，讓過程流暢

### Step 3 ─ 投票收斂（1 分鐘）
- 顯示投票結果排序
- 野柳海洋世界被某人 VETO → 直接出局（說明為什麼 VETO ≠ 普通負票）
- 老梅綠石槽拿到 2 張 MUST-GO → 排名第一
- **畫面重點**：強調 Token 制度防止「禮貌性點讚」

### Step 4 ─ Architect Agent 產出草案行程（1 分鐘）
- 按下「產出行程」，Agent 根據投票結果、開放時間、交通動線排序
- 顯示 loading 狀態（不要讓教授以為當機）
- 產出：上午野柳地質公園 → 午餐金山老街 → 下午朱銘美術館
- **說明重點**：AI 考慮了 L0/L1/L2/L3 分級，L0 不動，L2 才是彈性的

### Step 5 ─ 地圖視覺化（30 秒）
- 行程顯示在地圖上，依序連線
- 點 POI 卡片可看詳細資訊
- 可拖拉調整順序（dnd-kit）

### Step 6 ─ 防白跑提醒（1 分鐘）
- 朱銘美術館顯示 badge：「建議提前購票」
- 點開看到 KKday 連結（我們今天做的 enrichment）
- 野柳地質公園顯示電話（Sprint 1 完成後才有）
- **說明重點**：這就是「出發前確認不白跑」的具體體現

### Step 7 ─ 天氣觸發 Swap（2 分鐘，核心 Demo）
- 按下「模擬天氣變化」按鈕（或直接從 UI 顯示降雨預報）
- Strategy Agent 跳出提示：
  > 「下午 3 點後降雨機率 80%，建議把老梅綠石槽（L2 戶外）
  > 換成朱銘美術館（L2 室內），朱銘已提前移至上午。」
- 顯示 Swap 前後的行程對比
- **說明重點**：Swap 在同層級內換，L0 完全沒動，這就是「韌性」

### Step 8 ─ 確認出發（30 秒）
- 所有人對新行程按確認
- 顯示今日最終行程摘要

---

## 現有進度 vs 還需要做的

### 已完成 ✅
- 45 筆 POI 資料（Supabase，含驗證、enrichment）
- 地圖頁面（`/map`）
- Explore 頁面（部分）
- KKday / Klook / Facebook URL enrichment（今天完成）
- POI 驗證流程（reliability score、backup logic）

### 需要確認可用 🔍
- POI 卡片 UI（有沒有接到真實資料）
- Explore 頁面的 swipe 手勢（TouchSensor 有沒有加）
- 地圖上能不能畫路線

### 還沒做 ❌（依優先順序）
1. **Room 建立 + 邀請連結**（Step 1 的前提）
2. **投票 UI 連到 Supabase**（Vote 收斂顯示）
3. **Architect Agent**（可以先 mock，輸出固定草案）
4. **POI 詳細頁的 booking info**（KKday 連結、電話）
5. **Strategy Agent Swap UI**（可以先 mock，按鈕觸發固定場景）
6. **Sprint 1 ingestion 補齊**（電話、官網、reservation_required）

---

## Demo 場景準備清單

跑 Demo 當天需要預備：

- [ ] 測試帳號 × 4（或用 1 個帳號模擬多人）
- [ ] 北海岸 Demo 房間預先建好
- [ ] 投票結果預先輸入（不要讓教授等真實投票）
- [ ] 天氣 Swap 場景：mock 降雨資料觸發點確認
- [ ] 確認手機瀏覽器跑得順（期末 Demo 用手機展示）
- [ ] 朱銘美術館的 KKday 連結點開正常

---

## 下週優先工作建議

1. **Room 流程**（建立 + 加入 + 人員即時顯示）
2. **Swipe UI 接真實 POI 資料**（45 筆 NCA/YMS/NEI）
3. **投票結果畫面**（排序 + VETO 顯示）
4. **Architect Agent mock**（固定輸出，先讓 UI 跑起來）
5. **Sprint 1**（電話 + 官網進 ingestion.ts，補完 booking metadata）

> 功能做不完沒關係，但 Step 1-7 的畫面要能跑完整，
> 每個步驟的「說明重點」要能在 Demo 時清楚講出來。
