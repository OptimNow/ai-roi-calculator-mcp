# CLAUDE.MD - AI ROI Calculator MCP App

**Project:** AI ROI Calculator MCP
**Framework:** Skybridge (MCP App Framework)
**Repo:** github.com/OptimNow/ai-roi-calculator-mcp — public, MIT licensed
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
Transport:    Streamable HTTP with SSE responses, at /mcp
```

### Project Structure

```
ai-roi-calculator-mcp/
├── server/
│   └── src/
│       ├── index.ts              # MCP server — 1 widget + 3 tools
│       ├── catalog.ts            # Live OptimToken prices, process cache, snapshot fallback
│       ├── deeplink.ts           # Builds the link back into the web calculator
│       └── lib/                  # GENERATED — see "Engine sync" below, never edit here
│           ├── calculations.ts   # Core ROI formulas
│           ├── constants.ts      # The 11 presets
│           ├── modelCatalog.ts   # Catalog fetch, cache, embedded snapshot
│           ├── format.ts         # pluralize() + Intl money formatters
│           ├── types.ts          # TypeScript interfaces
│           └── golden-scenarios.json  # Reference figures the engine must reproduce
├── web/src/widgets/
│   └── calculate-roi-v4/         # The only widget. Unregistered folders get deleted.
├── scripts/
│   ├── sync-engine.mjs           # Copies the engine from the calculator (--check for CI)
│   └── generate-goldens.mjs      # Regenerates golden-scenarios.json
├── .github/workflows/
│   ├── ci.yml                    # Drift check + types + tests, per PR and push to master
│   └── sync-engine.yml           # Weekly (Mon 07:00 UTC): syncs, regenerates goldens, opens a PR
├── alpic.json                    # Alpic deployment config
├── tsconfig.json                 # Excludes *.test.ts from the server build
└── vite.config.ts                # Skybridge Vite plugin
```

Tests live beside the code: `server/src/lib/engine.test.ts`, `server/src/catalog.test.ts` and
`server/src/formatting.test.ts`. `npm test` runs 41 of them across those 3 files. Several are
regression guards rather than unit tests: they fail if a hand-built `$` prefix or a naive
`unitName + "s"` reappears, or if the registered widget list stops matching what has source.

---

## MCP Tools

Four are registered. Only one has a widget: `web/src/widgets/` holds exactly one folder, and
three superseded `calculate-roi` versions were once compiled into the bundle with nothing
registering them. If a folder is not registered in `index.ts`, delete it.

| Tool | Registration | Notes |
|---|---|---|
| `calculate-roi-v4` | `registerWidget` | The only widget. Full ROI, payback, net benefit, cost breakdown, and a break-even volume — **absent under `ValueMethod.RETENTION`**, see below. Accepts a `model` argument resolved against the catalog by id **or by name**, since an assistant knows "Claude Haiku 4.5" and not the slug. |
| `lookup-model-price` | `registerTool` | List, batch and prompt-cache prices for one model, or the top models by ELO. |
| `load-preset` | `registerTool` | Returns one of **11** presets without computing. |
| `sensitivity-analysis` | `registerTool` | Impact ranking at ±20%. No widget, despite the name matching a folder that used to exist. |

All four are read-only (`readOnlyHint`) and take no credentials.

**Presets:** support, knowledgeQA, meetingSummary, marketingContent, codingTask, invoice,
callSummary, agentWorkflow, recommendation, retention, premium.

Every `calculate-roi-v4` response ends with a deep link back into the web calculator, built by
`deeplink.ts`. Preset keys are mapped to the hub's use-case keys there (`support` →
`supportTicket`, `invoice` → `invoiceProcessing`).

### `breakEvenVolume` is optional — the only nullable figure in the results

`CalculationResults.breakEvenVolume` is `number | undefined`, and it is `undefined` for
`ValueMethod.RETENTION` (the `retention` preset). The break-even derivation cancels volume off
both sides of the equation, which only holds while `grossValuePerUnit` is volume-invariant.
Under Retention it is not: the total comes from `customersImpactedPerMonth` and the unit value
is back-derived by dividing by volume, so there is no threshold of that shape to report.

Two consequences for anything that renders results:

- **Never interpolate it directly.** A template literal or `.toLocaleString()` on `undefined`
  prints the word "undefined" into a sentence an assistant then reads aloud — it degrades
  quietly instead of failing where someone would notice. `server/src/index.ts` routes it
  through a single guarded `breakEvenCell`, and `formatting.test.ts` guards that.
- **Absent does not mean unreachable.** The other absence — unit margin never covering the
  fixed cost — is a genuine warning. Retention is not: the shipped preset clears +$1,220/month
  at 40% ROI with no break-even volume at all. The widget and the tool text say which of the
  two applies; a shared "N/A" would let the reader hear the alarming one.

The goldens do not cover this on their own: `engine.test.ts` iterates the keys a golden
*contains*, so a metric that reappears is not caught. `engine.test.ts` asserts the absence
explicitly instead.

## Engine sync — read this before touching server/src/lib/

Five files — `types.ts`, `calculations.ts`, `modelCatalog.ts`, `constants.ts` and `format.ts` —
are **copied verbatim** from the [AI ROI Calculator](https://github.com/OptimNow/ai-roi-calculator)
by `scripts/sync-engine.mjs` (see its `FILES` table for the authoritative list). Do not edit
them here: the next sync overwrites your change.

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

Two workflows keep the copies honest. `ci.yml` runs the sync check against the calculator's
main branch on every PR and push to master, so a red build means a human changed something.
`sync-engine.yml` runs every Monday: it syncs, regenerates the goldens, and opens (or updates)
a `chore/engine-sync` PR when the calculator moved on its own — typically the weekly price
snapshot refresh — so routine upstream drift never turns CI red.

## Model prices

`server/src/catalog.ts` resolves live prices from the OptimToken catalog (one fetch per
hour per process; the shared module's localStorage cache does not exist under Node). Every
path degrades to the embedded snapshot rather than failing a tool call, and `provenance()`
states which layer answered so a reported figure always carries its price date.

`server/src/deeplink.ts` builds the URL back into the web calculator, mirroring the contract
validated in the calculator's `utils/deepLink.ts`. Preset keys are mapped to the hub's
use-case keys (`support` → `supportTicket`, `invoice` → `invoiceProcessing`).

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

Deploys to Alpic Cloud. `npm run deploy` wraps the same command.

**Endpoint.** Both `/` and `/mcp` accept the MCP POST and answer 200. Quote `/mcp` everywhere
user-facing, because that is what README.md and the connector instructions give people. A GET
on `/mcp` returns 405, which is correct rather than broken: the transport is POST-only.

### Connecting to Claude Desktop / claude.ai

**Settings → Connectors → Add custom connector**, paste
`https://ai-roi-calculator-mc-e9dd36e7.alpic.live/mcp`. That is the only supported route — same
as README.md.

Do **not** document `claude_desktop_config.json` for this server: Desktop silently drops
`"type": "http"` entries from that file, and wrapping the URL in `npx mcp-remote` blows past
Desktop's ~6s `initialize` timeout on every conversation. Both fail quietly, which reads as
"the server is broken" when it isn't.

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

Requires **Node.js >= 24.14.0** (`engines` in package.json).

- `skybridge` — MCP app framework. **Pinned `^0.35.21`, do not cross 0.36.** Below 0.35.21,
  `_meta.ui.domain` is hashed from Alpic's internal path instead of the public connector URL
  (read from the `x-alpic-forwarded-url` header), so claude.ai/Desktop rejects every widget
  with "ui.domain validation failed". At 0.36.0 the `mountWidget` API the widget entry point
  depends on is removed. Vite major bumps (8.x) are likewise incompatible with skybridge < 1.x
  — close those dependabot PRs with `@dependabot ignore this major version`; 7.x bumps are fine.
- `@modelcontextprotocol/sdk` — MCP protocol SDK
- `zod` — Input schema validation
- `react`, `react-dom` — Widget UI rendering
- `vite` — Build tooling

Dev only: `alpic` (deployment CLI), `@skybridge/devtools`, `vitest` (test runner),
`esbuild` (bundles the engine for `generate-goldens.mjs`), `tsx`, `typescript`.
