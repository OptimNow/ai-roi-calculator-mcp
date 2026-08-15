# CLAUDE.MD - AI ROI Calculator MCP App

**Project:** AI ROI Calculator MCP
**Framework:** Skybridge (MCP App Framework)
**Repo:** github.com/OptimNow/ai-roi-calculator-mcp (private)
**Deployed:** https://ai-roi-calculator-mc-e9dd36e7.alpic.live

---

## What This Project Does

An MCP (Model Context Protocol) app that exposes AI ROI calculation tools as interactive widgets inside AI conversations (Claude, ChatGPT, VS Code, Goose). Built with Skybridge framework.

**Origin:** Business logic copied from the standalone web app [ai-roi-calculator](https://github.com/OptimNow/ai-roi-calculator). The original app remains untouched.

---

## Architecture

```
Framework:    Skybridge (MCP App Framework)
Language:     TypeScript
Build:        Vite + Skybridge plugins
UI:           React widgets (rendered via structuredContent)
Deployment:   Alpic Cloud
Transport:    SSE (Server-Sent Events) at root URL /
```

### Project Structure

```
ai-roi-calculator-mcp/
├── server/
│   └── src/
│       ├── index.ts              # MCP server — 3 tool/widget definitions
│       └── lib/
│           ├── calculations.ts   # Core ROI formulas — SYNCED, do not edit here
│           ├── constants.ts      # Preset use cases (support, invoice, etc.)
│           └── types.ts          # TypeScript interfaces
├── web/
│   └── src/
│       ├── helpers.ts            # Skybridge widget helpers
│       ├── index.css             # Widget styles
│       └── widgets/
│           ├── calculate-roi/
│           │   └── index.tsx     # ROI dashboard widget UI
│           └── sensitivity-analysis/
│               └── index.tsx     # Tornado chart widget UI
├── alpic.json                    # Alpic deployment config
├── package.json
├── tsconfig.json
└── vite.config.ts                # Skybridge Vite plugin
```

---

## MCP Tools

### Tool 1: `calculate-roi`
- **Type:** Widget (has UI)
- **Input:** Full `UseCaseInputs` (volume, model pricing, harness costs, value method, fixed costs)
- **Output:** ROI%, payback period, break-even volume, cost breakdown, net benefit
- **Widget:** KPI dashboard cards + cost breakdown

### Tool 2: `sensitivity-analysis`
- **Type:** Widget (has UI)
- **Input:** Same `UseCaseInputs`
- **Output:** Tornado chart data showing +/-20% variable impact on ROI
- **Widget:** Tornado chart visualization

## Engine sync — read this before touching server/src/lib/

`calculations.ts`, `types.ts`, `constants.ts` and `modelCatalog.ts` are **copied verbatim**
from the [AI ROI Calculator](https://github.com/OptimNow/ai-roi-calculator) by
`scripts/sync-engine.mjs`. Do not edit them here: the next sync overwrites your change.

They used to be hand-maintained copies, and they drifted — the same preset returned a
7-point different ROI depending on whether you asked the MCP or the web app, and per-call
pricing was accepted, advertised in the tool schema, then silently ignored (off by 44x).

To change a formula or a preset: change the calculator, merge it, then here run

```
npm run sync:engine     # copy the current engine in
npm test                # goldens will fail if figures moved — review, then regenerate
node scripts/generate-goldens.mjs
```

`golden-scenarios.json` records the figures every preset must keep producing. It is a
change detector, not a proof of correctness: when it fails, the diff is the blast radius.

CI runs `npm run sync:engine:check` against the calculator's main branch on every PR and
weekly, so drift introduced from either side surfaces on its own.

## Model prices

`server/src/catalog.ts` resolves live prices from the AI Pricing Hub catalog (one fetch per
hour per process; the shared module's localStorage cache does not exist under Node). Every
path degrades to the embedded snapshot rather than failing a tool call, and `provenance()`
states which layer answered so a reported figure always carries its price date.

`server/src/deeplink.ts` builds the URL back into the web calculator, mirroring the contract
validated in the calculator's `utils/deepLink.ts`. Preset keys are mapped to the hub's
use-case keys (`support` → `supportTicket`, `invoice` → `invoiceProcessing`).

### Tool 3: `load-preset`
- **Type:** Data-only tool (no widget)
- **Input:** Preset name (support, invoice, recommendation, retention, premium)
- **Output:** Pre-filled `UseCaseInputs` defaults

---

## Development

```bash
npm install
npm run dev        # Skybridge dev server with DevTools emulator (port 3000)
npm run build      # Production build
npm run start      # Start production server
```

### Deployment

```bash
npx alpic deploy --yes --project-name ai-roi-calculator-mcp
```

Deploys to Alpic Cloud. SSE endpoint is served at root `/`.

### Connecting to Claude Desktop

Add to `claude_desktop_config.json`:
```json
"ai-roi-calculator": {
  "command": "cmd",
  "args": ["/c", "npx", "mcp-remote", "https://ai-roi-calculator-mc-e9dd36e7.alpic.live/"]
}
```

---

## Key Design Decisions

1. **Skybridge `registerWidget()`** for tools with UI, `tool()` for data-only tools
2. **`structuredContent`** returns full data for widget rendering (ChatGPT renders HTML; Claude Desktop shows text fallback)
3. **`content`** returns markdown text for LLM-native display
4. **Zod schemas** validate all tool inputs with defaults matching the original app presets
5. **Pure calculation functions** from original app used without modification

---

## Constraints

- No API keys needed — all calculations run server-side
- No database — stateless tool execution
- Business logic in `server/src/lib/` is generated — see "Engine sync" below
- Brand color: Chartreuse (#ACE849) for OptimNow identity
- Widget UIs consume `useToolInfo()` hook from Skybridge (not React props)

---

## Dependencies

- `skybridge` — MCP app framework
- `@modelcontextprotocol/sdk` — MCP protocol SDK
- `zod` — Input schema validation
- `react`, `react-dom` — Widget UI rendering
- `vite` — Build tooling
- `alpic` — Deployment CLI (devDependency)
