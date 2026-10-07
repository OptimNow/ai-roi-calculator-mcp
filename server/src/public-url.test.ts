import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PUBLIC_MCP_URL, UI_DOMAIN, uiDomainFor, pinPublicUrl, FORWARDED_URL_HEADER } from "./public-url.js";

/**
 * The connector URL is chosen once: the widget sandbox domain is a hash of it,
 * and every document and the Claude directory listing carry a copy. These
 * tests pin the URL and the hash to literal values, so a change anywhere shows
 * up as a failing test rather than as a blank widget frame that only a
 * claude.ai render test would reveal.
 */

const repoFile = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), "utf8");

describe("public URL", () => {
  it("is the canonical form, byte for byte", () => {
    // The literal is the point: the test must break when the constant moves.
    expect(PUBLIC_MCP_URL).toBe("https://airoicalculator-mcp.optimnow.io/mcp");
    const url = new URL(PUBLIC_MCP_URL);
    expect(url.protocol).toBe("https:");
    expect(url.pathname, "Skybridge mounts the transport at /mcp and nothing configures it").toBe("/mcp");
    expect(PUBLIC_MCP_URL.endsWith("/"), "keep the canonical form slash-free so the docs and the hash agree").toBe(false);
    expect(url.search).toBe("");
  });

  it("pins the sandbox domain to the literal hash of the canonical URL", () => {
    // sha256("https://airoicalculator-mcp.optimnow.io/mcp")[:32], computed independently
    // with node:crypto and reproduced by Skybridge 0.35.21 when the built server
    // was called with that URL in the header.
    expect(UI_DOMAIN).toBe("1bdad30a82b62a13cd97fa7ae4c45994.claudemcpcontent.com");
    expect(uiDomainFor(PUBLIC_MCP_URL)).toBe(UI_DOMAIN);
  });

  it("hashes the same way as the sibling connectors' pinned values", () => {
    // ai-pricing-hub-mcp public-url.test.ts and cloud-finops-skills test_ui.py
    // pin these. Same algorithm, independent implementations.
    expect(uiDomainFor("https://optimtoken-mcp.optimnow.io/mcp")).toBe("6bc975b213d359f660adf536cb8cebab.claudemcpcontent.com");
    expect(uiDomainFor("https://mcp.optimnow.io/mcp")).toBe("5164c823f8a966e5cb0f8571d5141bd9.claudemcpcontent.com");
  });
});

describe("pinPublicUrl", () => {
  it("stamps the canonical URL over whatever the client sent, in both header views", () => {
    const req = {
      headers: { host: "ai-roi-calculator-mcp.fly.dev", [FORWARDED_URL_HEADER]: "https://evil.example/mcp" } as Record<string, string | undefined>,
      // Node keeps the wire form too, case preserved; the MCP SDK reads this one.
      rawHeaders: ["Host", "ai-roi-calculator-mcp.fly.dev", "X-Alpic-Forwarded-Url", "https://evil.example/mcp", "Accept", "*/*"],
    };
    let calls = 0;
    pinPublicUrl(req, undefined, () => { calls += 1; });
    expect(req.headers[FORWARDED_URL_HEADER]).toBe(PUBLIC_MCP_URL);
    expect(req.rawHeaders).toEqual(["Host", "ai-roi-calculator-mcp.fly.dev", "Accept", "*/*", FORWARDED_URL_HEADER, PUBLIC_MCP_URL]);
    expect(calls, "the middleware must hand the request on exactly once").toBe(1);
  });

  it("adds the header when the client sent none", () => {
    const req = { headers: { host: "localhost:3000" } as Record<string, string | undefined>, rawHeaders: ["Host", "localhost:3000"] };
    pinPublicUrl(req, undefined, () => {});
    expect(req.headers[FORWARDED_URL_HEADER]).toBe(PUBLIC_MCP_URL);
    expect(req.rawHeaders).toEqual(["Host", "localhost:3000", FORWARDED_URL_HEADER, PUBLIC_MCP_URL]);
  });
});

describe("published copies", () => {
  it("every published copy of the URL matches the constant", () => {
    const readme = repoFile("README.md");
    expect(readme, "README connect block").toContain(`\n${PUBLIC_MCP_URL}\n`);
    expect(readme, "README Claude Code command").toContain(`claude mcp add --transport http ai-roi-calculator ${PUBLIC_MCP_URL}`);
    expect(repoFile("CLAUDE.md"), "CLAUDE.md Deployed line").toContain(`**Deployed:** ${PUBLIC_MCP_URL}`);
    const flyToml = repoFile("fly.toml");
    expect(flyToml, "fly.toml comment").toContain(PUBLIC_MCP_URL);
    expect(flyToml, "PUBLIC_APP_ORIGIN feeds the widget CSP and must be this URL's origin").toContain(`PUBLIC_APP_ORIGIN = "${new URL(PUBLIC_MCP_URL).origin}"`);
    expect(repoFile(".env.example")).toContain(`PUBLIC_APP_ORIGIN=${new URL(PUBLIC_MCP_URL).origin}`);

    // The retired host must not survive where a reader would copy a URL from.
    // CLAUDE.md may name it as history; the connect surfaces may not.
    for (const file of ["README.md", "fly.toml", ".env.example"]) {
      expect(repoFile(file), `${file} still names the retired Alpic host`).not.toContain("alpic.live");
    }
  });

  it("the version copies agree", () => {
    // package.json, its lockfile and the serverInfo literal in index.ts each
    // carry the version; nothing at runtime compares them.
    const pkg = JSON.parse(repoFile("package.json")) as { version: string };
    const lock = JSON.parse(repoFile("package-lock.json")) as { version: string; packages: Record<string, { version: string }> };
    const announced = /name: "ai-roi-calculator", version: "([^"]+)"/.exec(repoFile("server/src/index.ts"))?.[1];
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect({ lock: lock.version, lockRoot: lock.packages[""]?.version, announced }).toEqual({ lock: pkg.version, lockRoot: pkg.version, announced: pkg.version });
  });
});
