import { describe, expect, it } from 'vitest';

import { findModel, getCatalog, provenance } from './catalog.js';
import { calculatorUrl } from './deeplink.js';
import { DEFAULT_INPUTS, PRESETS } from './lib/constants.js';
import type { UseCaseInputs } from './lib/types.js';

/**
 * These exercise the live AI Pricing Hub catalog when the network allows, and
 * fall through to the embedded snapshot when it does not — which is exactly the
 * behaviour the server relies on, so both paths are worth passing through.
 */

describe('catalog', () => {
  it('always resolves to a usable catalog', async () => {
    const catalog = await getCatalog();

    expect(catalog.models.length).toBeGreaterThan(20);
    expect(['live', 'cache', 'snapshot']).toContain(catalog.source);
    expect(catalog.pricedAt).toBeTruthy();
  });

  it('reuses the resolved catalog rather than refetching per call', async () => {
    const first = await getCatalog();
    const second = await getCatalog();

    expect(second).toBe(first);
  });

  it('states where the prices came from and when', async () => {
    expect(provenance(await getCatalog())).toMatch(/Prices .*published \d{4}-\d{2}-\d{2}/);
  });
});

describe('findModel', () => {
  it('finds a model by catalog id', async () => {
    const found = await findModel('anthropic/claude-haiku-4-5');

    expect(found?.model.model).toBe('Claude Haiku 4.5');
    expect(found?.params.pricePer1MInputTokens).toBeGreaterThan(0);
  });

  it('finds a model by the name an assistant would actually use', async () => {
    // Nobody types the slug; matching only on it would make the tool useless
    expect((await findModel('Claude Haiku 4.5'))?.model.model).toBe('Claude Haiku 4.5');
    expect((await findModel('anthropic claude haiku 4.5'))?.model.model).toBe('Claude Haiku 4.5');
  });

  it('carries the published cache and batch rates, not just list prices', async () => {
    const found = await findModel('anthropic/claude-haiku-4-5');

    expect(found?.params.cachedInputPricePer1M).toBeGreaterThan(0);
    expect(found?.params.batchInputPricePer1M).toBeGreaterThan(0);
    expect(found?.params.modelId).toBe('anthropic/claude-haiku-4-5');
  });

  it('returns null rather than guessing for an unknown model', async () => {
    expect(await findModel('definitely-not-a-model-xyz')).toBeNull();
    expect(await findModel('   ')).toBeNull();
  });
});

describe('calculatorUrl', () => {
  const inputs = (over: Partial<UseCaseInputs> = {}): UseCaseInputs =>
    ({ ...DEFAULT_INPUTS, ...PRESETS.support, ...over } as UseCaseInputs);

  it('maps preset keys to the use-case keys the calculator expects', () => {
    expect(new URL(calculatorUrl(inputs(), 'support')).searchParams.get('useCase')).toBe('supportTicket');
    expect(new URL(calculatorUrl(inputs(), 'invoice')).searchParams.get('useCase')).toBe('invoiceProcessing');
    expect(new URL(calculatorUrl(inputs(), 'codingTask')).searchParams.get('useCase')).toBe('codingTask');
  });

  it('carries the volume and the model id', () => {
    const params = new URL(calculatorUrl(inputs({ monthlyVolume: 25000 }), 'support')).searchParams;

    expect(params.get('volume')).toBe('25000');
    expect(params.get('model')).toBe('anthropic/claude-haiku-4-5');
  });

  it('flags batch workloads', () => {
    const url = calculatorUrl(inputs({ ...PRESETS.invoice } as Partial<UseCaseInputs>), 'invoice');

    expect(new URL(url).searchParams.get('batch')).toBe('1');
  });

  it('omits the model when it is a flat per-call rate', () => {
    // A per-call rate has no catalog id; sending one would misrepresent the scenario
    const perCall = inputs({
      primaryModel: {
        ...DEFAULT_INPUTS.primaryModel,
        modelId: undefined,
        useCallPricing: true,
        costPerCall: 0.02,
      },
    });

    expect(new URL(calculatorUrl(perCall, 'support')).searchParams.get('model')).toBeNull();
  });
});
