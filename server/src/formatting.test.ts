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

describe('widget registrations', () => {
  it('registers exactly the widgets that still have source', () => {
    // Three superseded calculate-roi versions were still being compiled into
    // the production bundle with nothing registering them.
    const registered = [...indexSource.matchAll(/registerWidget\(\s*"([^"]+)"/g)].map(m => m[1]);

    expect(registered).toEqual(['calculate-roi-v4']);
  });
});
