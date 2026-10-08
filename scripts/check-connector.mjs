#!/usr/bin/env node
/**
 * Verify a deployed connector by calling it, not by reading its source.
 *
 *   node scripts/check-connector.mjs [url]
 *
 * `url` defaults to PUBLIC_MCP_URL in server/src/public-url.ts, the published
 * one. Pass a different URL to check a local `npm run start` or the *.fly.dev
 * host; the expected sandbox domain is always the hash of the PUBLISHED URL,
 * because `pinPublicUrl` stamps that URL on every request whatever host it
 * arrived on. The script opens an MCP session and checks, in order:
 *
 *   1. initialize            -> HTTP 200 and serverInfo
 *   2. tools/list            -> the four tools
 *   3. resources/list + read -> every widget resource carries the sandbox
 *                               domain sha256(published url)[:32] +
 *                               ".claudemcpcontent.com" (in _meta.ui.domain for
 *                               the mcp-app variant, openai/widgetDomain for the
 *                               apps-sdk variant). The read is sent with
 *                               User-Agent "Claude-User" because Skybridge only
 *                               emits the hash for that agent.
 *   4. tools/call lookup-model-price -> source is live or cache (the OptimToken
 *                               catalogue was reached), not the embedded snapshot
 *
 * Everything it sees is printed verbatim; the exit code is non-zero on the
 * first mismatch. Run it after every deploy and before touching the directory
 * listing.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("../server/src/public-url.ts", import.meta.url)), "utf8");
const publishedUrl = /PUBLIC_MCP_URL = "([^"]+)"/.exec(source)?.[1];
if (!publishedUrl) throw new Error("PUBLIC_MCP_URL not found in server/src/public-url.ts");
const url = process.argv[2] ?? publishedUrl;
const expectedDomain = `${createHash("sha256").update(publishedUrl).digest("hex").slice(0, 32)}.claudemcpcontent.com`;

const EXPECTED_TOOLS = ["calculate-roi-v4", "lookup-model-price", "load-preset", "sensitivity-analysis"];

let failures = 0;
const check = (ok, label, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : `: ${detail}`}`);
  if (!ok) failures += 1;
};

let sessionId;
let nextId = 1;

/** POST one JSON-RPC message and return the parsed result (SSE or JSON body). */
async function rpc(method, params, extraHeaders = {}) {
  const body = { jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) };
  const isNotification = method.startsWith("notifications/");
  if (!isNotification) body.id = nextId++;
  const started = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const elapsed = Date.now() - started;
  sessionId ??= response.headers.get("mcp-session-id") ?? undefined;
  if (isNotification) return { status: response.status, elapsed };
  const text = await response.text();
  let payload;
  if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const data = text.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim());
    payload = JSON.parse(data.at(-1) ?? "null");
  } else {
    payload = JSON.parse(text || "null");
  }
  return { status: response.status, elapsed, payload };
}

console.log(`Connector under test: ${url}`);
console.log(`Published URL (public-url.ts): ${publishedUrl}`);
console.log(`Expected sandbox domain: ${expectedDomain}\n`);

const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "check-connector", version: "0" },
});
console.log(`initialize -> HTTP ${init.status} in ${init.elapsed} ms`);
console.log(JSON.stringify(init.payload?.result ?? init.payload, null, 2));
check(init.status === 200 && init.payload?.result?.serverInfo?.name === "ai-roi-calculator", "initialize serverInfo", init.payload?.result?.serverInfo?.version);
await rpc("notifications/initialized");

const tools = await rpc("tools/list");
const toolNames = (tools.payload?.result?.tools ?? []).map(t => t.name);
console.log(`\ntools/list -> HTTP ${tools.status}: ${JSON.stringify(toolNames)}`);
check(EXPECTED_TOOLS.every(n => toolNames.includes(n)) && toolNames.length === EXPECTED_TOOLS.length, "the four tools are listed");

const resources = await rpc("resources/list");
const uris = (resources.payload?.result?.resources ?? []).map(r => r.uri);
console.log(`\nresources/list -> HTTP ${resources.status}: ${JSON.stringify(uris)}`);
check(uris.length >= 1, "at least one widget resource", `${uris.length}`);
for (const uri of uris) {
  const read = await rpc("resources/read", { uri }, { "user-agent": "Claude-User" });
  const content = read.payload?.result?.contents?.[0];
  const meta = content?._meta ?? {};
  const domain = meta.ui?.domain ?? meta["openai/widgetDomain"];
  console.log(`resources/read ${uri} -> ${content?.mimeType} ${JSON.stringify(meta)}`);
  check(domain === expectedDomain, `${uri} sandbox domain`, domain);
}

const call = await rpc("tools/call", { name: "lookup-model-price", arguments: { model: "GPT-4o" } });
const sc = call.payload?.result?.structuredContent;
console.log(`\ntools/call lookup-model-price -> HTTP ${call.status} in ${call.elapsed} ms`);
console.log(JSON.stringify({ model: sc?.model, pricedAt: sc?.pricedAt, source: sc?.source }, null, 2));
check(sc?.source === "live" || sc?.source === "cache", "price source is live or cache (OptimToken reached)", `source ${sc?.source}`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
