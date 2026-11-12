# CLAUDE.MD - AI ROI Calculator MCP App

**Project:** AI ROI Calculator MCP
**Framework:** Skybridge (MCP App Framework)
**Repo:** github.com/OptimNow/ai-roi-calculator-mcp — public, MIT licensed
**Deployed:** https://airoicalculator-mcp.optimnow.io/mcp (Fly.io app ai-roi-calculator-mcp)

---

## Commits and pull requests

Do not add `Co-Authored-By`, `Claude-Session` or "Generated with Claude Code" lines to commit messages or pull request descriptions.

## What This Project Does

An MCP (Model Context Protocol) app that exposes AI ROI calculation tools as interactive widgets inside AI conversations (Claude, ChatGPT, VS Code, Goose). Built with Skybridge framework.

**Origin:** Business logic copied from the standalone web app [ai-roi-calculator](https://github.com/OptimNow/ai-roi-calculator). The original app remains untouched.

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
`sync-engine.yml` runs every Monday: it syncs, regenerates the goldens, and, when only prices
moved, pushes the result to master with a deploy key, so routine upstream drift never turns CI
red. Anything else opens a `chore/engine-sync` PR and fails the run (docs/DESIGN.md, "Deployment").

## Model prices

`server/src/catalog.ts` resolves live prices from the OptimToken catalog (one fetch per
hour per process; the shared module's localStorage cache does not exist under Node). Every
path degrades to the embedded snapshot rather than failing a tool call, and `provenance()`
states which layer answered so a reported figure always carries its price date.

`server/src/deeplink.ts` builds the URL back into the web calculator, mirroring the contract
validated in the calculator's `utils/deepLink.ts`. Preset keys are mapped to the hub's
use-case keys (`support` → `supportTicket`, `invoice` → `invoiceProcessing`).

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

## Where the rest lives

`docs/DESIGN.md` holds the other sections of this file, moved verbatim on 2026-11-08. It is not
loaded automatically: read the section your task touches. A reference to "CLAUDE.md, <section>"
means that section in `docs/DESIGN.md`.

Sections in `docs/DESIGN.md`:

- Architecture
- Development

## Maintaining this file

Keep this file under 200 lines. It holds what an agent needs in every session. A new decision, its reasoning or its history goes into the matching section of `docs/DESIGN.md`, or a new section listed above. Add a rule here only if an agent would break something without it.

