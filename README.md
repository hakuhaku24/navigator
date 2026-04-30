# Navigator（領航者）

> 智能共識 + 即時韌性的多人旅遊規劃系統

## 📱 Project Overview

Navigator 是一個資管系畢業專題，旨在解決多人旅遊的三大痛點：

1. **決策難收斂** — 多人出遊時，誰要去哪、誰不想去哪，難以快速達成共識
2. **缺乏韌性** — 行程遇到天氣/交通突發狀況時，沒有即時備案邏輯
3. **資訊不可信** — 網路上的景點資訊真假難辨、品質不一

## 🏗️ Project Structure

```
.
├── src/                    # 主應用 (Next.js 14 + TypeScript)
├── agents/                 # AI Agent 集合
│   └── poi-verifier/       # POI 驗證 Agent（開發中）
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
- **[agents/poi-verifier/README.md](./agents/poi-verifier/README.md)** — POI 驗證 Agent 文件
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

## 📋 MVP Scope (期末 Demo)

### In Scope ✅

- Create trip rooms (multi-user)
- Tinder-style swipe voting on POIs
- Vote aggregation (VETO / MUST-GO / Like)
- Auto-generate draft itineraries (Architect Agent)
- Map visualization
- Drag-to-reorder itinerary
- Weather-triggered Swap suggestions (Strategy Agent)

### Out of Scope ❌

- Reels video parsing
- Email ticket parsing
- Real-time traffic API (mock only)
- Merchant integrations
- Social feeds

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
