# Navigator（領航者）

> 可信景點資料庫 + 即時韌性應變的旅遊規劃系統
>
> ⚠️ 2026-07-16 拍板：舊定位「多人智能共識」已移出範圍，定位收斂為單人使用情境＋平台服務。詳見 [`0716_減法決策與不做清單.md`](./0716_減法決策與不做清單.md)、[`CLAUDE.md`](./CLAUDE.md) §7.5。

## 📱 Project Overview

Navigator 是一個資管系畢業專題，旨在解決旅遊規劃的兩大痛點：

1. **資訊不可信** — 網路上的景點資訊真假難辨、品質不一
2. **缺乏韌性** — 行程遇到天氣/交通突發狀況時，沒有即時備案邏輯

~~決策難收斂（多人出遊誰要去哪、誰不想去哪）~~ — 2026-07-16 已移出範圍，多人共識/投票不再是主線敘事

## 🏗️ Project Structure

```
.
├── src/                    # 主應用 (Next.js 14 + TypeScript)
├── agents/
│   ├── poi-verifier/       # POI 驗證 Agent
│   │   ├── src/            # 驗證器、分級器、RAG、hybrid search
│   │   ├── tests/          # 單元 + 整合測試
│   │   ├── demo-scenarios.ts  # 5 個 demo 場景執行器
│   │   ├── rag-reranker.ts    # Stage-2 Gemini 交叉評分
│   │   ├── hybrid-search.ts   # bigram + pgvector RRF 混合搜尋
│   │   └── ingest-from-tdx.ts # TDX 觀光 API 批次入庫
│   └── contingency-handler/   # 即時應變系統
├── prototypes/             # 設計原型
│   └── ui-demo/            # UI 設計參考
└── [配置與文件]
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm / yarn / pnpm
- PostgreSQL (via Supabase)

### Installation

```bash
# Clone & install dependencies
git clone <repo-url>
cd navigator
npm install

# Set up environment variables
cp env.example .env.local
# Edit .env.local with your Supabase keys, API keys, etc.

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📚 Documentation

- **[CLAUDE.md](./CLAUDE.md)** — Claude AI 協作記憶（架構、技術選型、慣例）
- **[DEVLOG.md](./DEVLOG.md)** — 開發日誌 & 里程碑
- **[agents/poi-verifier/README.md](./agents/poi-verifier/README.md)** — POI 驗證 Agent（五層驗證、RAG reranker、TDX 入庫）
- **[RUN_CODE_GUIDE.md](./RUN_CODE_GUIDE.md)** — 所有可用腳本速查
- **[agents/ENV_SETUP.md](./agents/ENV_SETUP.md)** — 環境變數設定指南
- **[prototypes/ui-demo/README.md](./prototypes/ui-demo/README.md)** — UI 設計參考

## 🛠️ Tech Stack

**Frontend**

- Next.js 14 (App Router) + TypeScript
- TailwindCSS + shadcn/ui
- Zustand (client state) + TanStack Query (server state)
- Mapbox GL JS / Leaflet (maps)
- dnd-kit (drag & drop)
- Framer Motion (animations)

**Backend**

- Supabase (PostgreSQL + pgvector)
- Next.js Route Handlers (BFF)
- Redis (caching)

**AI**

- Gemini 1.5 Flash (default, cost-effective)
- Claude Haiku (structured output backup)

**External APIs**

- 中央氣象署 (Weather)
- Google Places / OpenStreetMap (POI data)

## 📋 MVP Scope (期末 Demo，2026-07-16 減法後)

### In Scope ✅

- Verified POI catalog view (trust score, multi-source conflict UI)
- User selects POIs from the verified catalog to build a single-user itinerary
- Map / risk visualization
- Weather-triggered Swap suggestions (Contingency Handler)
- POI semantic search wired to frontend (`/api/poi/search`)

### Out of Scope ❌

- Reels video parsing
- Email ticket parsing
- Real-time traffic API (mock only)
- Merchant integrations
- Social feeds
- ❌ Multi-user planning chain (rooms, join, token voting, results, realtime presence) — cut 2026-07-16, code kept but frozen. See [`CLAUDE.md`](./CLAUDE.md) §7.5
- ❌ Tinder-style swipe voting — code kept but frozen, not part of the demo narrative
- ❌ Supabase Auth login — deferred to post-competition

## 🤝 Contributing

Please read [CLAUDE.md](./CLAUDE.md) section 8 (慣例) before writing code:

- File naming: `kebab-case.tsx`
- Components: `PascalCase`
- DB fields: `snake_case`
- Commits: Verb-first, Chinese or English OK

## 📝 License

[Add your license here]

---

**Need help?** See [CLAUDE.md](./CLAUDE.md) section 10 (遇到問題時) for troubleshooting and resources.
