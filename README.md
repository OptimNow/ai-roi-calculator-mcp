# AI ROI Calculator — MCP App

An MCP (Model Context Protocol) app that calculates ROI for AI/LLM implementations using a 3-layer cost framework. Works as an interactive tool inside AI conversations on **Claude**, **ChatGPT**, **VS Code**, and other MCP-compatible clients.

Built by [OptimNow](https://www.optimnow.io) with the [Skybridge](https://docs.skybridge.tech/) framework.

## Tools

| Tool | Description |
|------|-------------|
| `calculate-roi` | Calculate ROI for an AI project — returns ROI%, payback period, break-even volume, and cost breakdown |
| `sensitivity-analysis` | Run ±20% sensitivity analysis on key variables to identify ROI risk factors |
| `load-preset` | Load preset defaults for common use cases (support bot, invoice processing, etc.) |

### 3-Layer Cost Framework

- **Layer 1 (Infrastructure):** Model inference costs — token pricing, cache optimization, multi-model routing
- **Layer 2 (Harness):** Orchestration, retrieval, monitoring, tool APIs, operational overhead
- **Layer 3 (Business Value):** Cost Displacement, Revenue Uplift, Retention Uplift, or Premium Monetization

### Presets

Pre-configured defaults for common AI use cases:
- Customer Support Bot
- Invoice Processing
- E-commerce Recommendations
- Customer Retention AI
- AI Premium Features

## Getting Started

### Prerequisites

- Node.js 24+

### Install & Run

```bash
npm install
npm run dev
```

This starts the MCP server with Skybridge DevTools at `http://localhost:3000/`.

### Connect to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-roi-calculator": {
      "command": "cmd",
      "args": ["/c", "npx", "mcp-remote", "https://ai-roi-calculator-mc-e9dd36e7.alpic.live/"]
    }
  }
}
```

Restart Claude Desktop to connect.

### Connect to ChatGPT

1. Go to **Settings > Connected Apps**
2. Add the MCP server URL: `https://ai-roi-calculator-mc-e9dd36e7.alpic.live/`
3. ChatGPT will render interactive widget UIs for each tool

### Example Prompts

- "Load the support bot preset and calculate its ROI"
- "Calculate ROI for an AI project with 10,000 monthly transactions"
- "Run a sensitivity analysis on my AI implementation"

## Deployment

Deployed to [Alpic Cloud](https://alpic.ai/):

```bash
npx alpic deploy --yes --project-name ai-roi-calculator-mcp
```

## Related

- [AI ROI Calculator (standalone web app)](https://ai-roi-calculator.vercel.app) — the original interactive calculator
- [Skybridge Documentation](https://docs.skybridge.tech/)
- [MCP Protocol](https://modelcontextprotocol.io/)

## License

Private repository. All rights reserved.
