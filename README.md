# AI ROI Calculator MCP Server

> Built by [OptimNow](https://optimnow.io). Ask an AI assistant whether an AI project pays
> for itself, and get an answer built on live model prices, a 3-layer cost model, and
> arithmetic you can audit, instead of a plausible-sounding guess.

[![CI](https://github.com/OptimNow/ai-roi-calculator-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/OptimNow/ai-roi-calculator-mcp/actions/workflows/ci.yml)
[![MCP Server](https://img.shields.io/badge/MCP-Server-7C3AED)](https://modelcontextprotocol.io/)
[![ChatGPT Apps](https://img.shields.io/badge/ChatGPT-Apps%20SDK-10A37F?logo=openai&logoColor=white)](https://platform.openai.com/docs/apps)
[![Node](https://img.shields.io/badge/Node-24%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Prices](https://img.shields.io/badge/prices-OptimToken-ACE849?labelColor=2C2C2C)](https://optimtoken.optimnow.io)
[![GitHub Stars](https://img.shields.io/github/stars/OptimNow/ai-roi-calculator-mcp?style=flat)](https://github.com/OptimNow/ai-roi-calculator-mcp/stargazers)

---

## Connect in 30 seconds

The server is hosted, so there is nothing to install.

```
https://ai-roi-calculator-mc-e9dd36e7.alpic.live/mcp
```

| Client | How to add it |
|---|---|
| <img src="https://img.shields.io/badge/-Claude%20Code-D97757?logo=anthropic&logoColor=white" alt="Claude Code" height="22"/> | `claude mcp add --transport http ai-roi-calculator https://ai-roi-calculator-mc-e9dd36e7.alpic.live/mcp` |
| <img src="https://img.shields.io/badge/-Claude.ai%20%2F%20Desktop-D97757?logo=anthropic&logoColor=white" alt="Claude.ai / Desktop" height="22"/> | **Settings → Connectors → Add custom connector**, paste the URL above |
| <img src="https://img.shields.io/badge/-ChatGPT-10A37F?logo=openai&logoColor=white" alt="ChatGPT" height="22"/> | **Settings → Connectors → Add**, paste the URL. The ROI dashboard renders as an interactive widget |
| <img src="https://img.shields.io/badge/-Cursor-000000?logo=cursor&logoColor=white" alt="Cursor" height="22"/> <img src="https://img.shields.io/badge/-Windsurf-3DDC91?logoColor=white" alt="Windsurf" height="22"/> <img src="https://img.shields.io/badge/-VS%20Code-007ACC?logo=visualstudiocode&logoColor=white" alt="VS Code" height="22"/> | Add an HTTP MCP server entry pointing at the URL |

Then just ask:

> *"We handle 10,000 support tickets a month. What's the ROI of deflecting them with Claude Haiku 4.5?"*

---

## Why this exists

Ask any general-purpose model to size an AI business case and it will happily produce a
number. It will invent token prices, forget that retries are billed, ignore prompt caching
and batch discounts, and skip the orchestration, retrieval and monitoring that make up most
of the real bill. The answer looks confident, the arithmetic underneath is usually wrong,
and there is no way to check it.

This server replaces the guess with a model you can inspect:

- **Layer 1, inference.** Live per-model prices, including the provider's published
  prompt-cache read and batch rates. Retries are billed, because a retried call is charged.
- **Layer 2, harness.** Orchestration, retrieval, tool APIs, logging, guardrails, egress
  and storage: the part everyone forgets, and often the larger half of the bill.
- **Layer 3, business value.** 4 archetypes (cost displacement, revenue uplift, retention
  uplift, premium monetization), each with a realization rate, because not every
  technically-successful output turns into money.

Every figure it reports carries the price date it was computed from.

---

## Tools

| Tool | What it answers |
|---|---|
| **`calculate-roi-v4`** | "Is this worth doing?" Full ROI, payback, net benefit, cost breakdown, and a break-even volume for every value method except Retention Uplift — there value follows the customers you keep, not the volume, so no threshold exists. Renders an interactive dashboard in clients that support widgets. |
| **`lookup-model-price`** | "What does this model cost?" Live list, batch and prompt-cache prices for any model in the catalog, or the current top models. |
| **`load-preset`** | "What are sensible defaults for this use case?" Returns 1 of 11 preset scenarios without computing anything. |
| **`sensitivity-analysis`** | "What breaks this business case?" Impact ranking of volume, realization rate, cost and value at ±20%. |

All 4 are read-only and take no credentials. Nothing you send is stored.

**Presets:** `support`, `knowledgeQA`, `meetingSummary`, `marketingContent`, `codingTask`,
`invoice`, `callSummary`, `agentWorkflow`, `recommendation`, `retention`, `premium`.

Every answer ends with a deep link that opens the same scenario in the
[web calculator](https://airoicalculator.optimnow.io), so you can keep adjusting the
assumptions in the browser and save the result.

---

## Where the numbers come from

**Prices** are fetched live from the [OptimToken](https://optimtoken.optimnow.io)
catalog, which tracks 250+ models and refreshes daily from OpenRouter. If the hub is
unreachable, the server falls back to an embedded snapshot and says so, keeping every
figure attached to its provenance.

**Formulas** live in the [AI ROI Calculator](https://github.com/OptimNow/ai-roi-calculator)
and are copied here verbatim by `scripts/sync-engine.mjs`. The web app and this server must
answer the same question with the same number. They once drifted far enough that the same
preset returned a 7-point different ROI depending on which one you asked. CI now re-runs the
sync against the calculator on every PR and weekly, and a golden-scenario suite fails if any
preset's figures move.

The full mathematical specification, including every formula and its rationale, is in
[METHODOLOGY.md](https://github.com/OptimNow/ai-roi-calculator/blob/main/METHODOLOGY.md).

> **Do not edit `server/src/lib/`**: it is generated. Change the calculator, then run
> `npm run sync:engine` here and regenerate the goldens.

---

## Local development

Requires **Node.js 24+**.

```bash
npm install
npm run dev              # Skybridge dev server + MCP inspector
npm test                 # engine goldens, catalog, formatting guards
npm run build            # widgets + server
```

Working on the calculation engine:

```bash
npm run sync:engine        # pull the current engine from the calculator
npm run sync:engine:check  # CI mode, fails if the local copy is stale
node scripts/generate-goldens.mjs
```

By default the sync looks for the calculator checked out at `../ai-roi-calculator`. Override
it with `--from <path>` or `ROI_CALCULATOR_PATH`.

```text
ai-roi-calculator-mcp/
├─ server/src/index.ts        # tool + widget registrations
├─ server/src/catalog.ts      # live model prices, cached, snapshot fallback
├─ server/src/deeplink.ts     # links back into the web calculator
├─ server/src/lib/            # GENERATED, synced from the calculator
└─ web/src/widgets/calculate-roi-v4/
```

Built with [Skybridge](https://docs.skybridge.tech/), deployed on [Alpic](https://alpic.ai/).

---

## The rest of the family

| | |
|---|---|
| [**AI ROI Calculator**](https://airoicalculator.optimnow.io) | The web app. Same engine, full UI, saveable scenarios. |
| [**OptimToken**](https://optimtoken.optimnow.io) | Compare what 250+ models cost per request, with caching and batch factored in. |
| [**cloud-finops-skills**](https://github.com/OptimNow/cloud-finops-skills) | FinOps knowledge for AI agents: AWS, Azure, GCP, AI inference, SaaS. |
| [**finops-mcp-resources**](https://github.com/OptimNow/finops-mcp-resources) | MCP servers, tutorials and client guides for cloud cost work. |

---

Questions about your own AI cost estimate? [Talk to OptimNow](https://www.optimnow.io/contact).
