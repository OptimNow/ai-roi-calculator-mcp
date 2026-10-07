# CLAUDE.MD - AI ROI Calculator MCP App

**Project:** AI ROI Calculator MCP
**Framework:** Skybridge (MCP App Framework)
**Repo:** github.com/OptimNow/ai-roi-calculator-mcp — public, MIT licensed
**Deployed:** https://airoicalculator-mcp.optimnow.io/mcp (Fly.io app ai-roi-calculator-mcp)

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
Deployment:   Fly.io (Dockerfile + fly.toml, region cdg, scale-to-zero)
Transport:    Streamable HTTP with SSE responses, at /mcp (https://airoicalculator-mcp.optimnow.io/mcp)
```

### Project Structure

```
ai-roi-calculator-mcp/
├── server/
│   └── src/
│       ├── index.ts              # MCP server — 1 widget + 3 tools
│       ├── catalog.ts            # Live OptimToken prices, process cache, snapshot fallback
│       ├── deeplink.ts           # Builds the link back into the web calculator
│       ├── public-url.ts         # PUBLIC_MCP_URL, the widget sandbox domain hash, pinPublicUrl middleware
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
│   ├── generate-goldens.mjs      # Regenerates golden-scenarios.json
│   └── check-connector.mjs       # Manual: call a deployed connector and check tools, ui.domain, price source
├── .github/workflows/
│   ├── ci.yml                    # Drift check + types + tests, per PR and push to master
│   ├── dependabot-automerge.yml  # Approves + auto-merges dependabot patch/minor; majors wait for a human
│   └── sync-engine.yml           # Weekly (Mon 07:00 UTC): syncs, regenerates goldens, opens a PR
├── Dockerfile                    # Two-stage Node 24 image: build, then `skybridge start`
├── .dockerignore                 # Keeps node_modules, dist, docs, scripts and tests out of the build context
├── fly.toml                      # Fly.io app config: cdg, scale-to-zero, 512 MB, PUBLIC_APP_ORIGIN
├── tsconfig.json                 # Excludes *.test.ts from the server build
└── vitest.config.ts              # Test runner config; resolves the engine's ./x.js specifiers to .ts
```

Tests live beside the code: `server/src/lib/engine.test.ts`, `server/src/catalog.test.ts`,
`server/src/formatting.test.ts` and `server/src/public-url.test.ts` (pins the connector URL, its
sandbox-domain hash, every published copy of the URL and the version copies). `npm test` runs 49
of them across those 4 files. Several are
regression guards rather than unit tests: they fail if a hand-built `$` prefix or a naive
`unitName + "s"` reappears, if the registered widget list stops matching what has source, or
if `load-preset` regains widget metadata or a `calculateROI` call (it rendered the dashboard
until 1.4.0, contradicting its own description).

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

Harness cost overrides (`orchestrationCostPerUnit` and the six siblings) are USD **per single
unit**. Vendors quote per 1,000 calls and the web calculator's UI divides on entry, but the
MCP schema has no such toggle — the field descriptions carry the divide-by-1,000 warning so
a relayed vendor quote does not land 1,000x too high.

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
npm run deploy     # fly deploy, from the repo root
```

Hosted on Fly.io since October 2026, beside `ai-pricing-hub-mcp`
(`optimtoken-mcp.optimnow.io`) and `cloud-finops-mcp` (`mcp.optimnow.io`), all three
operated the same way. `fly deploy` builds the `Dockerfile` on Fly's remote builder
and rolls the app named in `fly.toml`; the `.dockerignore` keeps `node_modules`,
`dist`, docs, scripts and tests out of the build context. `flyctl` is not an npm
package: install it from <https://fly.io/docs/flyctl/install/> and `fly auth login`
once. Nothing deploys on its own: a merge to `master` changes nothing until someone
runs this (the pricing hub has a CI deploy job for that; this repo does not yet).

The public URL is **one constant**, `PUBLIC_MCP_URL` in `server/src/public-url.ts`:
`https://airoicalculator-mcp.optimnow.io/mcp`. `public-url.test.ts` fails if any published
copy drifts from it. It is a custom domain on the Fly app: a CNAME
`airoicalculator-mcp.optimnow.io -> ai-roi-calculator-mcp.fly.dev` in the
`optimnow.io` zone (hosted on Wix DNS) plus a certificate from
`fly certs add airoicalculator-mcp.optimnow.io`. The `ai-roi-calculator-mcp.fly.dev`
host answers tool calls but is not published, and the widget does not render
through it (see below).

**Endpoint.** `/mcp` only: Fly does not map the root the way Alpic did, so `GET /`
is 404 and `GET /mcp` is 405, which is correct rather than broken: the transport is
POST-only.

**`ui.domain` is pinned to the published URL.** claude.ai renders the widget only
when the resource's `_meta.ui.domain` equals `sha256(<connector URL exactly as the
user pasted it>)[:32] + ".claudemcpcontent.com"`. Skybridge 0.35.21 hashes the
`x-alpic-forwarded-url` header when present, else the Host header plus the request
path. Alpic's ingress injected that header; Fly's proxy does not, so `pinPublicUrl`
in `public-url.ts` sets it on every request from `PUBLIC_MCP_URL`, writing both
`req.headers` and `rawHeaders` (the MCP SDK rebuilds the request from the raw list
through hono's Node adapter, so the parsed object alone never reaches Skybridge).
The resulting hash is pinned by `public-url.test.ts`. Consequences: users paste the
URL exactly, with `/mcp` and no trailing slash; the fly.dev host serves tool calls
only. `PUBLIC_APP_ORIGIN` (set in `fly.toml`) still drives the widget CSP lists and
the ChatGPT-side `openai/widgetDomain`; keep it equal to the URL's origin.

**Verify by calling, not by reading.** After every deploy:

```bash
node scripts/check-connector.mjs            # the published URL
node scripts/check-connector.mjs http://localhost:3000/mcp   # a local `npm run start`
```

It runs `initialize` and `tools/list`, reads every widget resource as `Claude-User`
and checks the sandbox domain against the pinned hash, then calls
`lookup-model-price` and checks `source` is `live` or `cache` (not the embedded
snapshot).

**Scale-to-zero drops the process cache.** `catalog.ts` caches the OptimToken
catalogue for an hour per process. With `min_machines_running = 0` the machine stops
after a few idle minutes and the next caller pays the machine start plus one upstream
fetch. Set it to 1 if that latency ever matters.

#### Alpic (retired)

Until October 2026 the connector was `https://ai-roi-calculator-mc-e9dd36e7.alpic.live/mcp`.
Alpic's free plan stops at 10,000 requests per billing month and answers
`402 request-limit-exceeded` until the counter resets on the 1st; the shared OptimNow
team hit it on 2026-09-09, and again on 2026-10-07. `alpic.json`, `.alpic/` and the
`alpic` CLI were removed with the move; the Alpic project itself lives on Alpic's side
until removed in its dashboard.

### Connecting to Claude Desktop / claude.ai

**Settings → Connectors → Add custom connector**, paste
`https://airoicalculator-mcp.optimnow.io/mcp` exactly, with `/mcp` and no trailing slash.
That is the only supported route, same as README.md.

Do **not** document `claude_desktop_config.json` for this server: Desktop silently drops
`"type": "http"` entries from that file, and wrapping the URL in `npx mcp-remote` blows past
Desktop's ~6s `initialize` timeout on every conversation. Both fail quietly, which reads as
"the server is broken" when it isn't.

---

## Key Design Decisions

1. **Skybridge `registerWidget()`** for tools with UI, `registerTool()` for data-only tools
2. **`structuredContent`** returns full data for widget rendering — ChatGPT and claude.ai/Desktop both render the widget (Desktop rendering requires skybridge >= 0.35.21, see Dependencies)
3. **`content`** returns markdown text for LLM-native display
4. **Zod schemas** validate all tool inputs with defaults matching the original app presets
5. **Pure calculation functions** from original app used without modification

---

## Constraints

- No API keys needed — all calculations run server-side
- No database — stateless tool execution
- Business logic in `server/src/lib/` is generated — see "Engine sync" above
- Brand color: Chartreuse (#ACE849) for OptimNow identity
- Widget UIs consume `useToolInfo()` hook from Skybridge (not React props)

---

## Dependencies

Requires **Node.js >= 24.14.0** (`engines` in package.json).

- `skybridge`: MCP app framework. **Pinned `^0.35.21`, do not cross 0.36.** 0.35.21 is the
  release that started hashing the `x-alpic-forwarded-url` header for `_meta.ui.domain`, which
  `pinPublicUrl` relies on (see Deployment); older versions ignore it and claude.ai/Desktop
  rejects every widget with "ui.domain validation failed". At 0.36.0 the `mountWidget` API the
  widget entry point depends on is removed. Re-read `dist/server/server.js`
  (`registerWidgetResource`) for the domain derivation before trusting the pin on a new version. Vite 8.x is in use since PR #28 and builds green on skybridge
  0.35.21 — the earlier "close vite 8 dependabot PRs" guidance no longer applies.
- `@modelcontextprotocol/sdk` — MCP protocol SDK
- `zod` — Input schema validation
- `react`, `react-dom` — Widget UI rendering
- `vite` — Build tooling

Dev only: `@skybridge/devtools`, `vitest` (test runner),
`esbuild` (bundles the engine for `generate-goldens.mjs`), `tsx`, `typescript`, and
`@types/node` — a direct devDependency on purpose: the extended `skybridge/tsconfig` declares
`"types": ["node"]`, and skybridge stopped shipping `@types/node` transitively at 0.35.x, so
removing it breaks the typecheck.
