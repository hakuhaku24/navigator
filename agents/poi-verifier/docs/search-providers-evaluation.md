# 搜尋 Provider 評估與整合建議

> 建立日期:2026-05-12
> 狀態:**保留評估**,尚未實作整合
> 背景:Google CSE 在 2026 對新 GCP organization 全面封鎖(`403 PERMISSION_DENIED`),
> 需要為現行 `DuckDuckGo (ddgs) + Serper fallback` 架構評估第三層備援與品質提升方案。

---

## TL;DR(若之後要快速回顧)

| 決定 | 內容 |
|------|------|
| **Google CSE** | 放棄 — 2026 年新 GCP organization 一律 403,實測 key `AIzaSyDAVRLp733qjTbqQ71-0Aji7SYctMxFQfE` 確認封鎖 |
| **建議架構** | Tavily 主判斷 → DDG 廣度補強 → Serper 最後備援 |
| **預計成本** | 接近 NT$0(三家都在免費額度內) |
| **下一步** | 註冊 Tavily key → 用 `陽明山竹子湖海芋季 2026` 測 answer 品質 → 品質 OK 再整合 |

---

## 1. 為什麼需要重新評估

### 1.1 5/12 觸發點

組員周思佑在 5/10 提出兩個搜尋方案(Custom Search JSON API、Tavily AI),5/12 回報 CSE 403 錯誤。

### 1.2 實測結果(2026-05-12)

```bash
curl 'https://www.googleapis.com/customsearch/v1?key=AIzaSyDAVRLp733qjTbqQ71-0Aji7SYctMxFQfE&cx=16c8e3b67589140b0&q=test'

{
  "error": {
    "code": 403,
    "message": "This project does not have the access to Custom Search JSON API.",
    "status": "PERMISSION_DENIED"
  }
}
```

對應 Google 官方論壇 2026/3 月通報:
> A new Google Cloud organization created in March 2026 reported that the Custom Search JSON API returns 403 PERMISSION_DENIED on every API call from every project in the organization.

**結論**:這不是 key 配置問題,是 Google 政策封鎖,無法 debug。
`cse.google.com/cse?cx=...` 網頁版可開,但網頁端 widget 不能拿來做後端自動化驗證。

### 1.3 現行架構回顧

```
DuckDuckGo (ddgs Python script)    主搜尋,無額度限制
   ↓ DDG 結果 < 2 時 fallback
Serper API                          備援,~2500 次/月剩餘額度
```

兩個都是原始搜尋結果,沒有 AI 預處理,LLM 後處理還要自己過濾 SEO 垃圾。

---

## 2. Serper 介紹

### 2.1 是什麼

Serper 本質是「Google Search 的 JSON 代理」 — 幫你跑 Google 搜尋,把 SERP 用 JSON 格式回傳。

- 由開發者社群創立(非 Google 官方)
- 走「爬 Google 結果 + 轉 JSON」的灰色技術路線
- 是 LangChain / AutoGPT 等開源 agent 框架的預設搜尋後端

### 2.2 優勢

1. **結果 = Google 真實結果** — 跟在 google.com 看到的排序一致
2. **支援所有 Google 進階語法** — `site:`、`intitle:`、日期範圍、地區
3. **多種搜尋類型** — Web、News、Images、Maps、Shopping、Scholar
4. **超快** — 平均 < 1 秒
5. **免費額度** — 註冊送 2,500 次一次性

### 2.3 弱點

1. **沒摘要、沒 AI 過濾** — 拿到的就是原始 title + snippet + URL,要自己 parse
2. **內容農場照樣會出現** — Google SEO 垃圾全盤接收
3. **政策風險** — Google 改反爬機制時可能突然失效(2024 年發生過一次)
4. **免費額度一次性** — 用完得付費($50 / 50,000 次,約 $0.001/次)

### 2.4 適合場景

- 已經有「會清理 Google 結果」的後處理邏輯
- 想拿真實 Google 排名
- 需要特定搜尋類型(News / Scholar / Maps)
- 對結果品質有自己的標準,不需要別人幫你過濾

---

## 3. Tavily AI 介紹

### 3.1 是什麼

Tavily **不是搜尋引擎代理**,是**從零打造的 AI 原生搜尋引擎**。
他們自己跑爬蟲、自建索引、自己訓練排序模型 — 整套技術棧為「給 LLM 吃」優化。

- 2023 年由前 Google / Amazon 工程師創立
- 核心主張:Google 排第一的是 SEO 最強的網站,不是內容最有用的網站。對人類沒差,對 LLM 災難
- **搜尋的排序邏輯必須為 AI 場景重新設計**

### 3.2 優勢

1. **`answer` 欄位** — 把多筆結果用 LLM 合成成一段答案,直接給你用
2. **內容預清洗** — 廣告、cookie 提示、導覽列、SEO 廢話自動去掉,留下正文
3. **可指定深度** — `basic`(只回 snippet)/ `advanced`(連網頁正文一起回)
4. **網域白名單/黑名單** — 限定只搜某幾個高品質網站,排除內容農場
5. **註冊容易** — Email 註冊,**不需要 GCP / 信用卡 / organization 驗證**
6. **每月重置 1,000 次** — 不像 Serper 用完就沒

### 3.3 弱點

1. **比 Google 慢** — `basic` 約 1-2 秒,`advanced` 可達 3-5 秒
2. **覆蓋率比 Google 窄** — 自家索引,小眾長尾關鍵字可能找不到
3. **沒 Maps / Scholar / Shopping** — 只做 Web + News
4. **每月只有 1,000 次免費** — Serper 一次性 2,500 看起來多,但 Tavily 每月重置長期更划算
5. **付費較貴** — $0.005-$0.008/次,Serper 約 $0.001/次

### 3.4 適合場景

- 需要「綜合判斷型答案」(這景點還開嗎?這家店人多嗎?)
- 不想自己寫 SEO 過濾邏輯
- 需要鎖定特定信賴網站(只看官方旅遊網 + 在地部落格)
- 跑的是 AI agent,不是搜尋介面

---

## 4. 同一個 query,兩家回傳對比

**查詢:`陽明山竹子湖海芋季 2026 是否舉辦`**

### Serper 回應(示意)

```json
{
  "organic": [
    { "title": "2026陽明山海芋季 - KKday", "snippet": "立即預訂...", "link": "..." },
    { "title": "陽明山竹子湖海芋季官網", "snippet": "Cookie 政策...", "link": "..." },
    { "title": "【海芋季】最新優惠 - 旅遊網購", "snippet": "限時 8 折...", "link": "..." },
    { "title": "竹子湖怎麼去-巴士時刻表", "snippet": "...", "link": "..." }
  ]
}
```
→ 4 筆裡 2 筆是廣告/購物,要自己過濾

### Tavily 回應(示意)

```json
{
  "answer": "2026 陽明山竹子湖海芋季於 3 月 15 日至 4 月 30 日舉辦,主要賞花區為頂湖環狀步道。今年新增預約制停車場...",
  "results": [
    { "title": "竹子湖海芋季官網", "content": "今年活動期間...(正文)", "url": "..." },
    { "title": "在地人帶你逛海芋季", "content": "(部落格正文摘要)", "url": "..." }
  ]
}
```
→ 直接給判斷依據,廣告自動排除

---

## 5. 直接比較表

| 維度 | Serper | Tavily |
|------|--------|--------|
| **技術本質** | Google 結果代理 | 自建 AI 搜尋引擎 |
| **回傳結構** | Google SERP 原始 | AI 處理過的摘要 |
| **`answer` 合成** | ❌ | ✅ |
| **網域白名單** | ❌(只能用 `site:`) | ✅ 原生支援 |
| **內容預清洗** | ❌ | ✅ |
| **覆蓋廣度** | Google 全網 | 自家索引(較窄) |
| **速度** | < 1 秒 | 1-5 秒 |
| **免費額度** | 2,500 次(一次) | **1,000 次/月**(重置) |
| **付費單價** | $0.001 | $0.005-0.008 |
| **註冊難度** | Email | Email |
| **設計對象** | 通用開發者 | AI agent |
| **覆蓋類型** | Web/News/Maps/Scholar/Images | Web/News |
| **政策穩定性** | ⚠️ 依賴 Google 容忍 | ✅ 自家技術 |

---

## 6. 建議整合架構

### 6.1 核心觀念:依問題類型分工,不是備援切換

POI Verifier 其實有**兩種搜尋需求**,目前混用同一條管線是錯的:

| 需求類型 | 範例 | 最佳工具 |
|---------|------|---------|
| **判斷題** | 景點還存不存在?營業中嗎?最近有人去嗎? | **Tavily**(answer + 預清洗 + 網域白名單) |
| **收集題** | 找一堆部落格作為 reliability_score 的證據 | **DDG / Serper**(覆蓋廣、結果多) |

### 6.2 四層架構(若整合)

```
┌──────────────────────────────────────────────┐
│  Step 1:Tavily(主判斷)                     │
│   - include_domains: 台灣旅遊 5 大網站       │
│   - include_answer: true                     │
│   - 用 answer 直接判斷 exists / 營業狀態     │
│   - 用 results 抓 published_date            │
└──────────────────────────────────────────────┘
                ↓ Tavily 失敗或結果不足
┌──────────────────────────────────────────────┐
│  Step 2:DuckDuckGo(廣度補強)               │
│   - 無額度免費                               │
│   - 拿原始 5-10 筆結果作為 fallback         │
└──────────────────────────────────────────────┘
                ↓ DDG 也不夠
┌──────────────────────────────────────────────┐
│  Step 3:Serper(最後備援)                   │
│   - Google 全網搜尋                          │
│   - 確保極端 case 也有結果                   │
└──────────────────────────────────────────────┘
```

### 6.3 為什麼這樣排

1. **Tavily 放第一** — answer + 網域白名單是現行最缺的能力,可直接降低 LLM 後處理負擔
2. **DDG 降到第二** — 免費無上限的優勢還在,但退居「Tavily 沒結果時的廣度兜底」
3. **Serper 放第三** — 2,500 次額度已部分使用,留給極端 case 最不浪費

### 6.4 每月成本估算(假設批次驗證跑 2 次 = 90 POI/月)

```
Tavily:90 POI × 1 次  = 90 次  → 免費(額度 1000)
DDG:   ~30% 命中 fallback = 27 次 → 免費
Serper:~5% 命中第三層 = 4-5 次  → 免費(剩餘額度內)
LLM 後處理:answer 已預過濾,token 估計可降 30%
```

**每月成本仍接近 NT$0,但回答品質提升**(answer 預判斷 + 網域過濾)。

---

## 7. 對教授的說法(若採用)

> 「我們把搜尋層改成『**問題類型決定後端**』的分工架構:Tavily 負責綜合判斷(用 AI 預處理的 answer),DDG/Serper 負責原始證據蒐集。這不只是備援切換,更是**根據資料用途選擇最適合的工具** —— 也呼應老師提到的『漏斗式檢索』設計。」

---

## 8. 不推薦的選項

- ❌ **只用 Serper 不用 Tavily** — 浪費 Tavily 的 answer 能力,還是得自己過濾 SEO 垃圾
- ❌ **只用 Tavily 取代 DDG** — 每月 1000 次有上限,真上線會吃緊
- ❌ **三家平行查同一個 query 取最佳** — 浪費額度,沒必要
- ❌ **繼續嘗試修 Google CSE** — 政策封鎖,debug 救不回來

---

## 9. 下一步行動(待執行)

1. [ ] **註冊 Tavily** — 到 [tavily.com](https://tavily.com) 用 email 申請 free tier
2. [ ] **拿到 key 後實測一筆**:`陽明山竹子湖 海芋季 2026`,看 answer 品質是否符合預期
   ```bash
   curl https://api.tavily.com/search \
     -H "Content-Type: application/json" \
     -d '{
       "api_key": "tvly-xxx",
       "query": "陽明山竹子湖海芋季 2026",
       "search_depth": "basic",
       "include_answer": true,
       "max_results": 5,
       "include_domains": ["pixnet.net", "matters.news"]
     }'
   ```
3. [ ] **若 answer 品質 OK** → 寫 `src/validators/tavily-search.ts`,在 `blog-search.ts` 把它放在 DDG 之前
4. [ ] **若 answer 品質普通** → 維持現行 DDG + Serper 雙路,不勉強加

---

## 10. 相關紀錄

- **5/05 未解問題清單**:部落格搜尋相關問題已由組員 `cfbeee6` 修復(日期萃取、地點篩選),
  本評估屬於「品質升級」而非「修 bug」
- **5/08 組員 commit**:`cfbeee6` 修復 4 大問題後,搜尋層的可靠性已大幅提升,Tavily 整合非必要,屬於 P1 任務
- **5/12 教授回饋**:強調系統需具備「LLM 取代不了的價值」 → Tavily 的網域白名單可呼應這點
  (例如只搜在地小部落格,避免被 ChatGPT 一句話蓋過)
