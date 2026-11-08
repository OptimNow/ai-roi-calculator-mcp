# ai-roi-calculator-mcp: design reference

Sections moved verbatim from `CLAUDE.md` on 2026-11-08 to keep that file short. `CLAUDE.md`
keeps what an agent needs in every session and lists the sections below.

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
│   ├── ci.yml                    # Drift check + types + tests, per PR and push to master; deploys master to Fly
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
once.

**Releases deploy themselves.** The `deploy` job in `ci.yml` runs
`flyctl deploy --remote-only` on every push to `master`, after the `test` job has
passed, then asks the live server (on the fly.dev host, so the check does not depend
on DNS) for its `serverInfo.version` and fails unless it matches the `version` in
`server/src/index.ts`. It needs the `FLY_API_TOKEN` repository secret
(`fly tokens create deploy --app ai-roi-calculator-mcp`). Dependabot merges do not
trigger it: auto-merge is queued with `GITHUB_TOKEN`, and GitHub starts no workflow
from a push made with that token; those bumps ship with the next human merge, or at
once from Actions -> CI -> Run workflow on `master`. The first deploy is manual, since
the Fly app must exist before the job can roll it: `fly apps create ai-roi-calculator-mcp`,
then `fly deploy` from a checkout of the merged commit.

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
The resulting hash is pinned by `public-url.test.ts`. **Rendering confirmed by hand on
Claude Desktop on 2026-10-09** with the connector added under exactly that URL: the
ROI dashboard widget drew its frame. Consequences: users paste the URL exactly, with
`/mcp` and no trailing slash; the fly.dev host serves tool calls only. `PUBLIC_APP_ORIGIN` (set in `fly.toml`) still drives the widget CSP lists and
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

