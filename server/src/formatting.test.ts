import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatUsd, pluralize } from './lib/format.js';

const indexSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'index.ts'),
  'utf8',
);

/**
 * Tool output is read by an assistant and repeated to a person, so a misplaced
 * currency sign or a bad plural travels further here than on a web page.
 */

describe('money in tool output', () => {
  it('puts the sign before the symbol', () => {
    // Was "$-49.20": the "$" was hand-prefixed to a formatted number
    expect(formatUsd(-49.2)).toBe('-$49.20');
  });

  it('leaves no hand-built currency prefixes in index.ts', () => {
    // `$${...}` in a template literal is how the bug was written
    expect(indexSource).not.toMatch(/\$\$\{/);
  });
});

describe('unit names in tool output', () => {
  it('pluralises a consonant-y unit correctly', () => {
    // Was "querys/month"
    expect(pluralize('query')).toBe('queries');
  });

  it('leaves no naive unitName + "s" in index.ts', () => {
    expect(indexSource).not.toMatch(/unitName\}s/);
  });
});

describe('optional metrics in tool output', () => {
  it('reaches break-even volume through a guarded cell, never inline', () => {
    // breakEvenVolume is absent under Retention Uplift. Touched directly from an
    // output template it would print "undefined" into the sentence an assistant
    // reads aloud, rather than failing where someone would notice.
    const outputLines = indexSource
      .split('\n')
      .filter(line => line.includes('Break-even Volume'));

    expect(outputLines.length).toBeGreaterThan(0);
    outputLines.forEach(line => {
      expect(line, line.trim()).not.toMatch(/results\.breakEvenVolume/);
    });

    expect(indexSource).toMatch(/results\.breakEvenVolume !== undefined/);
  });

  it('says why the volume is absent instead of a bare N/A', () => {
    // "N/A" reads as "not reachable" — a warning — on a retention scenario that
    // may be comfortably profitable. The two absences mean different things.
    expect(indexSource).toMatch(/retention value is not volume-driven/);
    expect(indexSource).toMatch(/not reachable at any volume/);
  });
});

describe('load-preset stays data-only', () => {
  it('carries no widget metadata and computes nothing', () => {
    // load-preset once carried openai/outputTemplate + ui.resourceUri and ran
    // calculateROI, so "show me the assumptions without computing" was
    // impossible and the tool contradicted its own description. It returns
    // raw preset inputs; calculate-roi-v4 is the only renderer.
    const block = indexSource.slice(
      indexSource.indexOf('"load-preset"'),
      indexSource.indexOf('"sensitivity-analysis"'),
    );

    expect(block).not.toMatch(/outputTemplate|resourceUri/);
    expect(block).not.toMatch(/calculateROI\(/);
  });
});

describe('widget registrations', () => {
  it('registers exactly the widgets that still have source', () => {
    // Three superseded calculate-roi versions were still being compiled into
    // the production bundle with nothing registering them.
    const registered = [...indexSource.matchAll(/registerWidget\(\s*"([^"]+)"/g)].map(m => m[1]);

    expect(registered).toEqual(['calculate-roi-v4']);
  });
});
