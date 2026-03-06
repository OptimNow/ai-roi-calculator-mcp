# MCP App -> ChatGPT App Migration Notes

## Current status

This repository is already a ChatGPT-compatible MCP app:
- MCP tools are defined on the server (`server/src/index.ts`).
- Input schemas are explicit (`zod` schemas).
- UI resources are widget-backed (`registerWidget(...)`).
- Skybridge emits the ChatGPT widget metadata (`openai/outputTemplate`) and MCP Apps metadata (`ui/resourceUri`).

## Important correction

For this architecture, you do not need to add a separate `app.json` file to make ChatGPT work.
The required descriptors are served through the MCP endpoint and tool/resource metadata.

## Required endpoint

Use:

`https://<host>/mcp`

This project uses streamable HTTP on `/mcp` (not root `/`).

## Implemented hardening in this repo

- Added read-only annotations (`readOnlyHint`) to all tools.
- Added ChatGPT tool invocation status metadata:
  - `openai/toolInvocation/invoking`
  - `openai/toolInvocation/invoked`
- Added widget UI preference metadata (`ui.prefersBorder`) for widget tools.
- Updated docs to reflect ChatGPT Developer Mode + `/mcp` connection flow.

## Architecture

ChatGPT
-> ChatGPT App connector
-> MCP endpoint (`/mcp`)
-> Skybridge server tools
-> ROI calculation logic and widget UI
