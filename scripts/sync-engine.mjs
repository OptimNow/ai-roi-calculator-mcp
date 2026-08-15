#!/usr/bin/env node
/**
 * Syncs the calculation engine from the AI ROI Calculator into server/src/lib/.
 *
 * The MCP server and the web app must answer the same question with the same
 * number. They used to hold independent hand-maintained copies, which drifted:
 * the same preset returned a 7-point different ROI depending on which one you
 * asked. These files are now copied mechanically and never edited here.
 *
 *   node scripts/sync-engine.mjs            # copy, rewriting import specifiers
 *   node scripts/sync-engine.mjs --check    # exit 1 if the copy is stale (CI)
 *
 * Source repo resolution: --from <path>, then $ROI_CALCULATOR_PATH, then the
 * sibling ../ai-roi-calculator checkout.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TARGET_DIR = join(ROOT, 'server/src/lib');

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const fromFlag = argv.indexOf('--from');
const SOURCE_ROOT = resolve(
  fromFlag !== -1 && argv[fromFlag + 1]
    ? argv[fromFlag + 1]
    : process.env.ROI_CALCULATOR_PATH || join(ROOT, '..', 'ai-roi-calculator'),
);

/** Canonical file -> local name. Import specifiers are rewritten to ESM paths. */
const FILES = [
  { from: 'types.ts', to: 'types.ts' },
  { from: 'utils/calculations.ts', to: 'calculations.ts' },
  { from: 'utils/modelCatalog.ts', to: 'modelCatalog.ts' },
  { from: 'constants.ts', to: 'constants.ts' },
  // Display rules travel with the numbers: a figure should read the same way
  // whether it comes back from a tool call or off the web page.
  { from: 'utils/format.ts', to: 'format.ts' },
];

const BANNER = `// GENERATED FILE — do not edit here.
// Synced from the AI ROI Calculator by scripts/sync-engine.mjs.
// Change the calculator, then run: npm run sync:engine
`;

const fail = (message) => {
  console.error(`sync-engine: ${message}`);
  process.exit(1);
};

/**
 * The calculator is bundled by Vite, which resolves extensionless relative
 * imports. Node's ESM loader does not, so every relative specifier gains .js.
 * Paths also flatten: the calculator's utils/ and root files all land in lib/.
 */
const rewriteImports = (source) =>
  source.replace(
    /(\bfrom\s+['"])(\.[^'"]+)(['"])/g,
    (_match, open, specifier, close) => {
      const bare = specifier.replace(/^\.{1,2}\//, '').replace(/^utils\//, '');
      return `${open}./${bare}.js${close}`;
    },
  );

if (!existsSync(SOURCE_ROOT)) {
  fail(
    `calculator repo not found at ${SOURCE_ROOT}. ` +
      'Pass --from <path> or set ROI_CALCULATOR_PATH.',
  );
}

let stale = 0;
for (const { from, to } of FILES) {
  const sourcePath = join(SOURCE_ROOT, from);
  if (!existsSync(sourcePath)) fail(`missing source file ${sourcePath}`);

  const expected = BANNER + rewriteImports(readFileSync(sourcePath, 'utf8'));
  const targetPath = join(TARGET_DIR, to);
  const current = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : null;

  if (current === expected) {
    console.log(`  = ${to}`);
    continue;
  }

  if (CHECK_ONLY) {
    console.error(`  ✗ ${to} differs from ${from} in the calculator`);
    stale++;
    continue;
  }

  writeFileSync(targetPath, expected);
  console.log(`  ${current === null ? '+' : '~'} ${to}`);
}

if (CHECK_ONLY && stale > 0) {
  fail(
    `${stale} engine file(s) out of sync with the calculator. ` +
      'Run `npm run sync:engine` and commit the result.',
  );
}

console.log(
  CHECK_ONLY ? 'Engine is in sync.' : `Engine synced from ${SOURCE_ROOT}.`,
);
