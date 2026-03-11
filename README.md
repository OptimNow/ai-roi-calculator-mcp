# AI ROI Calculator - ChatGPT/MCP App

An ROI calculator app that runs as an MCP server with widget UIs, compatible with ChatGPT Apps and other MCP clients.

Built with [Skybridge](https://docs.skybridge.tech/) and deployed on [Alpic](https://alpic.ai/).

## Demo

[![Watch the demo](https://cdn.loom.com/sessions/thumbnails/9e710b84a1484a0c8f242ec46185e809-with-play.gif)](https://www.loom.com/share/9e710b84a1484a0c8f242ec46185e809)

## What changed for ChatGPT Apps

This repo is already on the right architecture for ChatGPT Apps:
- MCP tools with explicit input schemas (Zod)
- Widget UI resources for interactive rendering
- Tool + widget metadata for ChatGPT (`openai/outputTemplate`, widget CSP/domain metadata)

With current Apps SDK guidance, you connect ChatGPT to the MCP endpoint (`/mcp`).
A standalone `app.json` is not required for this Skybridge MCP setup.

## Tools

- `calculate-roi-v2`: Calculate ROI and return dashboard metrics
- `load-preset`: Load defaults for common AI use cases

## Metric definitions

- `Net Benefit (P&L)` = `Monthly Value - (Variable Monthly Cost + Fixed Cost Amortization)`
- `Payback (months)` = `One-time Fixed Cost / (Monthly Value - Variable Monthly Cost)`
- `ROI curve (cumulative profit)` uses the same cash-flow basis as payback:
  `-One-time Fixed Cost + month * (Monthly Value - Variable Monthly Cost)`

## Project structure

```text
ai-roi-calculator-mcp/
|- server/src/index.ts
|- server/src/lib/
|- web/src/widgets/calculate-roi-v2/index.tsx
```

## Local development

### Prerequisites

- Node.js 24+

### Run

```bash
npm install
npm run dev
```

Skybridge DevTools runs at `http://localhost:3000`.
The MCP endpoint is `http://localhost:3000/mcp`.

## Connect to ChatGPT (Developer Mode)

1. Start the app locally (`npm run dev`) or deploy it.
2. Ensure ChatGPT Developer Mode is enabled:
   - `Settings -> Apps & Connectors -> Advanced settings`
3. In ChatGPT app setup, add your MCP server URL:
   - Local tunnel example: `https://<your-tunnel-domain>/mcp`
   - Deployed example: `https://<your-domain>/mcp`
4. Refresh/reconnect after metadata changes.

## Directory submission prep

For ChatGPT directory submission, set these production env vars:

```bash
PUBLIC_APP_ORIGIN=https://your-app.example.com
OPENAI_APPS_CHALLENGE=<token from OpenAI>
```

Optional CSP overrides are also supported:

```bash
WIDGET_CONNECT_DOMAINS=
WIDGET_RESOURCE_DOMAINS=
WIDGET_REDIRECT_DOMAINS=
WIDGET_FRAME_DOMAINS=
```

Once configured, the app exposes the domain verification file at `/.well-known/openai-apps-challenge`.
See `docs/chatgpt-directory-checklist.md` for the repo-specific submission checklist and draft test cases.

## Connect to Claude Desktop

```json
{
  "mcpServers": {
    "ai-roi-calculator": {
      "command": "cmd",
      "args": ["/c", "npx", "mcp-remote", "https://ai-roi-calculator-mc-e9dd36e7.alpic.live/mcp"]
    }
  }
}
```

## Build and deploy

```bash
npm run build
npm run start
npx alpic deploy --yes --project-name ai-roi-calculator-mcp
```

## Notes

- The MCP route is `/mcp` (not root `/`).
- Widget UIs are served automatically via Skybridge resource registration.
- This app is read-only (calculation-only) and does not persist data.
