# 新資料來源可行性分析報告

> 建立日期：2026-06-04
> 狀態：**評估中**，尚未決定是否整合
> 背景：團隊考慮在現有 DuckDuckGo + Serper + Tavily 架構之外，
> 額外爬取 YouTube 影片、Instagram 帳號、PTT/Dcard 論壇、景點官網，
> 本文從「有效性、成本、法律風險」三個維度逐一評估。

---

## TL;DR（一眼看結論）

| 來源             | 有效性 | 成本                | 法律風險          | 建議                               |
| ---------------- | ------ | ------------------- | ----------------- | ---------------------------------- |
| YouTube Data API | ★★★★☆  | 低（官方 API 免費） | ✅ 安全           | **推薦採用（API 路線）**           |
| Instagram        | ★★★☆☆  | 中～高              | ❌ 極高           | **不建議（畢業專題不值得冒險）**   |
| PTT              | ★★★★★  | 低                  | ✅ 基本安全       | **強烈推薦**                       |
| Dcard            | ★★★★☆  | 低                  | ⚠️ 灰色地帶       | **可用，需加 robots.txt 遵守機制** |
| 景點官網         | ★★★★★  | 低                  | ✅ 安全（需守禮） | **強烈推薦**                       |

---

## 1. YouTube 影片

### 1.1 有效性

**優點**

- 台灣 YouTuber 旅遊 vlog 數量龐大，近期上傳代表景點仍活躍
- 影片標題、說明欄（description）、標籤（tags）可直接用來判斷：
  - 景點是否仍存在（沒有標題寫「已關閉」就算正向訊號）
  - 季節性資訊（「2025 海芋季」說明當年有舉辦）
  - 人流狀況（縮圖畫面、觀看數間接反映熱度）
- 字幕（captions）可用 `yt-dlp` 抽取，作為文字語意分析素材
- 頻道訂閱數與觀看數可作為**信度加權**（大頻道資訊相對可靠）

**限制**

- 贊助影片（#廣告、#合作、description 含 paid partnership）內容偏頗，需過濾
  - YouTube 有「paid promotion」標記，但並非所有業配都標；
  - 可用關鍵字過濾 description：`廣告`、`業配`、`paid`、`sponsored`、`#ad`
- 影片上傳日期 ≠ 拍攝日期，時效判斷有誤差（最多差半年）
- 需要人工或 LLM 二次判讀，不能直接拿影片標題當事實

**整合進 POI Verifier 的實際價值**

| 用途             | 可行性                              |
| ---------------- | ----------------------------------- |
| 確認景點仍營業   | ✅（最近 12 個月有影片 = 正向訊號） |
| 補充 `vibe` 標籤 | ✅（從 tags、description 抽關鍵字） |
| 偵測天氣/季節性  | ✅（搜尋「下雨」「冬天」相關影片）  |
| 取代部落格文章   | ❌（影片沒有結構化地址、營業時間）  |

### 1.2 成本

**官方 YouTube Data API v3**（強烈建議走這條）

| 操作                        | 配額消耗     |
| --------------------------- | ------------ |
| 每日免費配額                | 10,000 units |
| `search.list`（搜一次）     | 100 units    |
| `videos.list`（抓影片詳情） | 1 unit       |
| `captions.list`（列字幕）   | 50 units     |

- 每天免費可做 100 次搜尋 + 大量詳情抓取
- 45 筆 POI 全批次驗證一輪 = 45 × 100 = 4,500 units → **一天內跑完，零費用**
- 字幕抓取若需要：45 × 50 = 2,250 units → 仍在免費額度
- Google Cloud 申請 GCP project 並開啟 YouTube Data API：完全免費，不需信用卡

**直接爬 YouTube 網頁（不走 API）**

- 不建議：YouTube 反爬機制很強，Selenium / Playwright 在 CI 環境難維護，且違反 ToS

**yt-dlp 下載字幕**

- 技術上免費，但下載行為屬於灰色地帶（見法律段落）

### 1.3 法律風險

**YouTube Data API v3 路線：✅ 安全**

- Google 官方授權的資料存取方式
- [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-tos) 允許：
  - 顯示 YouTube 內容的 metadata（標題、說明、縮圖網址）
  - 搜尋索引
- 禁止：下載音訊/影片本體並儲存、去除廣告、廣告收益導流

**yt-dlp / 直接抓影片本體：⚠️ 風險較高**

- yt-dlp 本身是合法工具（用於個人備份等用途）
- 但在後端自動化、商業目的環境中使用，違反 YouTube ToS 第 5.B 條
- **學術 / 非商業畢業專題**：使用 yt-dlp 抓字幕用於學術分析，法律上臺灣著作權法第 65 條「合理使用」有一定保護空間，但仍不建議作為正式系統架構

**影片創作者著作權**

- 引用影片標題、部分 description、影片網址：✅ 合理使用
- 直接複製影片內容、截圖置入產品 UI：❌ 需取得授權

**結論：走 YouTube Data API v3，只用 metadata（標題、tags、說明欄前 200 字），完全合法且免費。**

---

## 2. Instagram 帳號

### 2.1 有效性

**優點**

- 許多景點（尤其餐廳、咖啡廳、特色景區）有官方 IG 帳號，會貼最新公告
- 近期貼文日期 = 最直接的「還在營業」訊號
- 用戶標記（tagged posts）中的真實評論比業主貼文更可信
- 限時動態（stories）有即時資訊（但無法透過 API 抓取）

**嚴重限制**

- **IG 帳號查找本身就是難題**：如何確認 `@yangmingshan_official` 是不是該景點的真正帳號？需另外驗證（容易爬到冒牌帳號）
- 官方 API 只能抓自己帳號的貼文（需要該景點帳號授權，不現實）
- 非官方 IG 資料（他人貼文、標記）完全無法透過合法管道抓取

### 2.2 成本

**官方 Instagram Graph API**

- 需要：Meta Developer 帳號 + Facebook 應用程式審核 + 景點方授權 OAuth
- 審核時間：2–4 週，且審核可能被拒
- 只能讀取**授權方自己帳號**的貼文 → 對 POI 驗證毫無用處（景點不會給我們授權）

**非官方爬蟲（instaloader、instagram-scraper 等）**

- 技術上可以抓公開貼文，但：
  - Meta 每隔幾個月就更新反爬規則，維護成本極高
  - IP 封鎖、帳號封鎖機率高（即使只是搜尋，短期內就可能被 rate limit）
  - 需要提供 IG 帳號登入憑證，增加帳號被封風險

**成本估算（非官方路線）**

| 項目                   | 成本                                  |
| ---------------------- | ------------------------------------- |
| 工具本身               | 免費（instaloader 是 MIT License）    |
| 維護爬蟲穩定性         | **極高**（Meta 反爬最積極的平台之一） |
| 帳號封鎖後申訴時間損失 | 難以估算                              |

### 2.3 法律風險

**官方 API 路線：不可行（非法律問題，是技術限制）**

- 景點不會給我們 OAuth 授權，根本跑不起來

**非官方爬蟲路線：❌ 高風險**

1. **違反 Instagram ToS**（第 2.2 條）：明確禁止自動化存取、爬蟲、非授權存取
2. **Meta 積極提告的先例**：
   - 2020：Meta 對 Bright Data（前身 Luminati）發起訴訟，指控大規模 IG 資料蒐集
   - 2022：Meta 對 Octopus Data 提告，求償數百萬美元
   - 台灣雖非直接管轄，但若系統公開上線仍有風險
3. **臺灣個資法（個人資料保護法）**：
   - IG 貼文作者的個人資料（姓名、照片、位置）未經同意蒐集，可能觸犯個資法第 19 條
4. **著作權法**：貼文內容（文字、照片）受創作者著作權保護，蒐集後儲存至資料庫屬重製行為

**結論：畢業專題不值得承擔 Instagram 的法律風險。建議完全放棄 Instagram 爬蟲路線，可改用 YouTube 影片中的 IG 帳號標記作為間接線索（YouTuber 在 description 常常貼景點 IG 連結）。**

---

## 3. PTT 與 Dcard

### 3.1 PTT

#### 有效性

**PTT 是台灣 POI 驗證最高品質的免費來源之一**

- `travel`（旅遊版）、`Hiking`（爬山版）、`Taipei`（台北版）有大量真實使用者遊記
- 文章有精確日期 → 時效判斷最可靠
- 鄉民在 PTT 講話直接，負評、踩雷資訊更容易出現（Instagram 反而都是正面濾鏡）
- 搜尋景點名稱可快速找到近期心得：`https://www.ptt.cc/bbs/travel/search?q=竹子湖`

**限制**

- 純文字 BBS，圖片少，無法補充視覺資訊
- 部分板（如八卦板）的旅遊討論串雜訊高，需版別白名單過濾
- 年輕族群流量已大量移往 Dcard，PTT 旅遊討論量近年下降

#### 成本

| 方式                     | 成本                                         |
| ------------------------ | -------------------------------------------- |
| 直接 HTTP GET 抓文章列表 | 完全免費，無需 JavaScript 渲染               |
| 需要工具                 | `node-fetch` / `axios` 即可，不需 Playwright |

PTT 整個網站都是 HTML，不用 JavaScript 渲染，爬取成本極低。

搜尋 API 範例：

```
GET https://www.ptt.cc/bbs/travel/search?q=陽明山&page=1
```

#### 法律風險：✅ 基本安全

1. **PTT 性質**：國立台灣大學學術網路 BBS，長期以公開方式供民眾閱覽，無需帳號即可讀取大多數版面
2. **robots.txt**：`https://www.ptt.cc/robots.txt` — 目前未封鎖爬蟲（請在整合時確認一次）
3. **學術研究慣例**：台灣多所大學的 NLP 研究都使用 PTT 語料，學術界普遍認為符合著作權法「合理使用」
4. **需注意事項**：
   - 爬取頻率不宜過高（建議每次請求間隔 ≥ 1 秒，避免對 NTU 伺服器造成負擔）
   - 文章內容屬於作者著作，引用時需標明來源，不可直接對外再發布
   - 有「不給未成年人看」警告的版別（如 Gossiping）需先同意 cookie；可以在 HTTP header 加入 `over18=1` cookie 跳過，但建議僅抓旅遊相關版，不碰 Gossiping

---

### 3.2 Dcard

#### 有效性

- Dcard 的旅遊、美食、台北、台灣等版面與 PTT 互補，年齡層偏向 18–30 歲
- 近年旅遊內容量已超越 PTT 旅遊版，是更能反映年輕族群偏好的來源
- 文章有愛心數（likes）可作為信度加權（爆文 = 較可靠的熱門景點資訊）
- 搜尋網址：`https://www.dcard.tw/f/travel?search=竹子湖`

#### 成本

| 方式                             | 成本                                              |
| -------------------------------- | ------------------------------------------------- |
| Dcard 非官方爬蟲（dcard-api 等） | 工具免費，但維護成本偏高                          |
| 直接 HTTP + JSON API             | 部分端點可以直接用（`/v2/posts`），不需登入       |
| JavaScript 渲染                  | Dcard 前端是 SPA，搜尋功能需 Playwright/Puppeteer |

```
GET https://www.dcard.tw/_api/posts?popular=true&forum=travel&limit=30
```

#### 法律風險：⚠️ 灰色地帶

1. **Dcard 的 ToS**（第 4 條）：明確禁止「以爬蟲、機器人或其他自動化方式蒐集內容」
2. **但**：台灣目前尚無針對爬取 **公開** 頁面的民事判決先例（個人使用 / 學術研究的判例更是空白）
3. **著作權保護**：Dcard 貼文版權屬創作者，平台有授權轉載的權利但不等於允許他人爬取
4. **個資問題**：Dcard 作者名稱為匿名代號，不含真實姓名，個資風險低於 Instagram

**風險降低措施（如果決定整合 Dcard）**

- 每次請求加入 `Referer: https://www.dcard.tw/` 與正常 User-Agent（避免被識別為惡意爬蟲）
- 請求間隔 ≥ 2 秒，每天請求數 < 500 次
- 只儲存：文章標題、發布日期、愛心數、前 100 字摘要、文章連結（不整段複製）
- 在驗證報告中標注來源為「Dcard 社群討論」

**結論：PTT 強烈推薦；Dcard 可用但需加 robots.txt 遵守機制與頻率限制，且在報告中明確說明「僅用於非商業學術驗證」。**

---

## 4. 景點官網

### 4.1 有效性

**這是最高信度、最直接的資料來源**

官網可以提供現有架構最缺的資訊：

| 資料欄位                   | 目前來源         | 若加入官網                      |
| -------------------------- | ---------------- | ------------------------------- |
| 正確地址                   | Google Places ✅ | 雙重確認 ✅✅                   |
| 營業時間                   | Google Places ✅ | 官方版本更準確                  |
| 門票價格                   | ❌ 缺            | ✅ 可補入                       |
| 目前公告（臨時休息、活動） | ❌ 缺            | ✅ 最即時                       |
| 預訂連結                   | ❌ 缺            | ✅ 可補入                       |
| 官方社群媒體連結           | ❌ 缺            | ✅（IG、FB 從官網找比自己猜準） |

**限制**

- 台灣許多小型景點（登山步道、自然景區）根本沒有官網
- 有官網的景點，網頁結構千奇百怪，無法用統一 CSS selector 抓取，需 LLM 輔助解析
- 部分官網長期不更新（更新日期 2019 的「最新消息」比沒有更糟）

**適合整合的景點類型**

- L0/L1 錨點景點（預訂餐廳、主題樂園、博物館）：幾乎都有官網，且更新頻率高
- L2/L3 自然景區：多數沒有官網，改依賴 PTT / 部落格

### 4.2 成本

| 項目                 | 說明                                                       |
| -------------------- | ---------------------------------------------------------- |
| 工具                 | `node-fetch` + Playwright（官網幾乎都需要 JS 渲染）        |
| Playwright 成本      | 開源免費，但 CI 需要安裝 Chromium（Docker image + ~200MB） |
| LLM 解析非結構化官網 | Gemini Flash 1 次約 NT$0.01–0.03，45 POI 全跑一輪 ≈ NT$1   |
| 快取策略             | 官網內容每週抓一次即可（變動頻率低），可大幅降低 LLM 成本  |

**總體成本估計：每月 < NT$5（LLM 解析費）+ 幾乎零 API 費用**

### 4.3 法律風險：✅ 安全（需遵守基本禮節）

1. **robots.txt 遵守**：多數台灣政府觀光網、景點官網的 robots.txt 允許一般爬蟲
   - 系統中**必須**先讀取並遵守 `robots.txt`，這是技術禮節也是法律保護
2. **著作權法第 65 條**：網站上公開的文字資訊，用於非商業學術研究目的的引用，屬合理使用範圍
3. **電腦處理個人資料保護法（現行個資法）**：景點官網上的資訊（地址、電話、營業時間）屬於「公開資訊」，蒐集用途明確（景點驗證），無個資疑慮
4. **需注意**：
   - 爬取頻率過高可能觸犯「妨礙電腦使用罪」（刑法第 360 條），需設合理 rate limit（建議每個網站每天最多請求 3 次）
   - 若使用繞過 CAPTCHA 的手段則可能構成「破解保護措施」，應完全避免

---

## 5. 整合至現有架構的建議方案

現行爬蟲管線（DuckDuckGo → Serper → Tavily 規劃中）主要解決的是「找到相關部落格文章」。新來源解決的是不同問題，建議分開兩條子管線：

```
┌─────────────────────────────────────────────────────────────┐
│  子管線 A：「景點仍存在 & 有人去」（時效性驗證）             │
│                                                             │
│  1. 景點官網（若存在）→ 最近公告 / 門票日期                │
│  2. PTT travel 版搜尋 → 最近文章日期                       │
│  3. YouTube Data API → 最近影片上傳日期                    │
│  4. Dcard travel 版（選用）→ 愛心數 + 最近文章日期         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  子管線 B：「應變邏輯語意豐富化」（vibe / 天氣敏感度）       │
│                                                             │
│  現行：DuckDuckGo + Serper（部落格文章）                   │
│  規劃中：Tavily answer（AI 預判斷）                        │
└─────────────────────────────────────────────────────────────┘
```

### 優先順序建議（期末 demo 前）

| 優先級 | 來源             | 理由                                               |
| ------ | ---------------- | -------------------------------------------------- |
| P0     | 景點官網         | 信度最高、法律最安全、對 L0/L1 anchor POI 效果最好 |
| P1     | PTT              | 免費、合法、台灣旅遊資訊密度高                     |
| P2     | YouTube Data API | 官方 API、免費、可偵測業配（關鍵字過濾）           |
| P3     | Dcard            | 比 PTT 稍複雜，但年輕族群覆蓋補盲                  |
| 不做   | Instagram        | 法律風險 >> 資訊增益，完全不值得                   |

---

## 6. 實作細節提醒

### 過濾 YouTube 贊助影片

```typescript
const SPONSORED_KEYWORDS = [
  "廣告",
  "業配",
  "paid partnership",
  "#ad",
  "sponsored",
  "合作邀約",
  "贊助",
];

function isSponsored(description: string, title: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  return SPONSORED_KEYWORDS.some((kw) => text.includes(kw));
}
```

YouTube Data API 的 `contentDetails.contentRating` 不含業配標記，目前只能靠文字關鍵字過濾（YouTube 官方的 paid promotion 標記在前端顯示，但 API 不回傳此欄位）。

### PTT 搜尋基本範例

```typescript
const PTT_TRAVEL_BOARDS = [
  "travel",
  "Hiking",
  "Taipei",
  "Taichung",
  "Kaohsiung",
];

async function searchPTT(poiName: string): Promise<PttPost[]> {
  const url = `https://www.ptt.cc/bbs/travel/search?q=${encodeURIComponent(poiName)}`;
  const res = await fetch(url, {
    headers: { Cookie: "over18=1" }, // 跳過年齡確認
  });
  // parse HTML...
}
```

### 官網爬取的 robots.txt 遵守

```typescript
import robotsParser from "robots-parser";

async function canFetch(
  url: string,
  userAgent = "NavigatorBot/1.0",
): Promise<boolean> {
  const robotsUrl = new URL("/robots.txt", url).href;
  const res = await fetch(robotsUrl).catch(() => null);
  if (!res?.ok) return true; // 沒有 robots.txt 預設可以爬
  const robots = robotsParser(robotsUrl, await res.text());
  return robots.isAllowed(url, userAgent) ?? true;
}
```

---

## 7. 給教授的說法（若整合這些來源）

> 「我們的 POI 驗證架構加入了多元台灣在地資料源：PTT 旅遊版提供有時間戳記的真實使用者心得，景點官網提供最高信度的官方資訊，YouTube API 提供近期影片作為『景點活躍度』的代理指標。這三個來源互補現有部落格搜尋的盲點——部落格以 SEO 導向為主，而 PTT 的負評、官網的公告停業、YouTube 的無人影片才是真正能區分景點死活的訊號。Instagram 則因法律風險過高（Meta 積極提告爬蟲業者）而不納入，這也是一個系統設計上的**明確邊界判斷**。」

---

## 8. 相關文件

- [search-providers-evaluation.md](./search-providers-evaluation.md) — DuckDuckGo / Serper / Tavily 評估
- [rag-architecture-analysis.md](./rag-architecture-analysis.md) — RAG 語意檢索架構
- `src/validators/blog-search.ts` — 現行部落格搜尋實作
