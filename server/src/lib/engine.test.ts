import { describe, expect, it } from 'vitest';

import { calculateROI } from './calculations.js';
import { DEFAULT_INPUTS, PRESETS } from './constants.js';
import type { UseCaseInputs } from './types.js';
import { ValueMethod } from './types.js';
import goldens from './golden-scenarios.json' with { type: 'json' };

/**
 * The MCP server and the web app must answer the same question with the same
 * number. They used to hold independent copies of the engine, which drifted far
 * enough that the same preset returned a 7-point different ROI depending on
 * which one you asked — with nothing to detect it.
 *
 * The engine is now synced verbatim (scripts/sync-engine.mjs) and these goldens
 * are the change detector: touch a formula or a preset and the figures move,
 * failing here until someone updates them on purpose and reviews the diff.
 */

const preset = (key: string): UseCaseInputs =>
  ({ ...DEFAULT_INPUTS, ...(PRESETS as Record<string, Partial<UseCaseInputs>>)[key] } as UseCaseInputs);

const scenarioFor = (name: string): Record<string, unknown> =>
  (goldens.scenarios as Record<string, Record<string, unknown>>)[name];

describe('golden scenarios', () => {
  const scenarios = goldens.scenarios as Record<string, Record<string, unknown>>;

  it('covers every preset', () => {
    Object.keys(PRESETS).forEach(key => {
      expect(scenarios[`preset:${key}`], `no golden for preset ${key}`).toBeDefined();
    });
  });

  Object.keys(PRESETS).forEach(key => {
    it(`reproduces the recorded figures for preset "${key}"`, () => {
      const golden = scenarios[`preset:${key}`];
      const result = calculateROI(preset(key)) as unknown as Record<string, number>;

      Object.entries(golden).forEach(([metric, expected]) => {
        if (typeof expected === 'number') {
          expect(result[metric], metric).toBeCloseTo(expected, 5);
        } else {
          expect(result[metric], metric).toEqual(expected);
        }
      });
    });
  });
});

/**
 * The goldens only assert the keys they contain, so an absent metric is not
 * covered by them: if breakEvenVolume came back for Retention again, every
 * golden would still pass. These assert the absence itself.
 */
describe('break-even volume under Retention Uplift', () => {
  it('is undefined for retention presets and a number everywhere else', () => {
    Object.keys(PRESETS).forEach(key => {
      const inputs = preset(key);
      const { breakEvenVolume } = calculateROI(inputs);

      if (inputs.valueMethod === ValueMethod.RETENTION) {
        // Cf_amortized / (GV - C2) cancels volume off both sides, which is only
        // valid while grossValuePerUnit is volume-invariant. Under Retention the
        // total comes from customersImpactedPerMonth and the unit value is
        // back-derived by dividing by volume, so the equation has no solution of
        // that shape and the figure it used to print pointed the wrong way.
        expect(breakEvenVolume, key).toBeUndefined();
      } else {
        expect(breakEvenVolume, key).toBeTypeOf('number');
      }
    });
  });

  it('omits the metric from the retention golden rather than recording a stale number', () => {
    expect(scenarioFor('preset:retention')).not.toHaveProperty('breakEvenVolume');
  });
});

describe('churn reduction cap', () => {
  const retention = (churnReductionAbsolute: number): UseCaseInputs => ({
    ...preset('retention'),
    churnReductionAbsolute,
  });

  it('cannot retain more customers than were churning', () => {
    // baselineChurnRate was declared but never read: a 5-point reduction against
    // a 2.5-point baseline "saved" customers out of a negative churn rate.
    const capped = calculateROI(retention(5)).totalMonthlyValue;
    const atBaseline = calculateROI(retention(2.5)).totalMonthlyValue;

    expect(capped).toBeCloseTo(atBaseline, 5);
  });

  it('leaves a reduction below the baseline untouched', () => {
    // The shipped preset sits at 0.5 against a 2.5 baseline, which is why no
    // golden figure moved when the cap landed.
    const half = calculateROI(retention(0.5)).totalMonthlyValue;
    const full = calculateROI(retention(2.5)).totalMonthlyValue;

    expect(half).toBeCloseTo(full / 5, 5);
  });
});

describe('per-call billing', () => {
  const perCall: UseCaseInputs = {
    ...DEFAULT_INPUTS,
    primaryModel: {
      ...DEFAULT_INPUTS.primaryModel,
      useCallPricing: true,
      costPerCall: 0.02,
      avgInputTokensPerUnit: 999_999,
      avgOutputTokensPerUnit: 999_999,
    },
    routingSimplePercent: 100,
    retryRate: 0,
  };

  it('charges the flat rate and ignores the token counts entirely', () => {
    // Regression guard: the MCP used to accept costPerCall, advertise it in the
    // tool schema, then silently price the tokens instead — off by a factor of 44.
    expect(calculateROI(perCall).layer1CostPerUnit).toBeCloseTo(0.02, 6);
  });

  it('ignores cache and batch, which have no tokens to act on', () => {
    const optimized: UseCaseInputs = {
      ...perCall,
      cacheHitRate: 90,
      cachedTokenDiscount: 90,
      batchProcessing: true,
    };

    expect(calculateROI(optimized).layer1CostPerUnit).toBeCloseTo(0.02, 6);
  });

  it('still bills retries, because a retried call is charged again', () => {
    expect(calculateROI({ ...perCall, retryRate: 0.25 }).layer1CostPerUnit).toBeCloseTo(0.025, 6);
  });
});

describe('published cache and batch rates', () => {
  it('prefers a published cache-read price over the generic discount', () => {
    const inputs: UseCaseInputs = {
      ...DEFAULT_INPUTS,
      primaryModel: {
        ...DEFAULT_INPUTS.primaryModel,
        avgInputTokensPerUnit: 1000,
        avgOutputTokensPerUnit: 0,
        pricePer1MInputTokens: 1,
        cachedInputPricePer1M: 0.1,
      },
      routingSimplePercent: 100,
      cacheHitRate: 50,
      cachedTokenDiscount: 0, // must be ignored
      batchProcessing: false,
      retryRate: 0,
    };

    // 0.1 x 50% + 1.0 x 50% = 0.55 per 1M, over 1000 tokens
    expect(calculateROI(inputs).layer1CostPerUnit).toBeCloseTo(0.00055, 8);
  });

  it('leaves list prices alone when the model publishes no batch rate', () => {
    const noBatch: UseCaseInputs = {
      ...DEFAULT_INPUTS,
      primaryModel: {
        ...DEFAULT_INPUTS.primaryModel,
        batchInputPricePer1M: undefined,
        batchOutputPricePer1M: undefined,
      },
      batchProcessing: true,
    };
    const listPrice: UseCaseInputs = { ...noBatch, batchProcessing: false };

    expect(calculateROI(noBatch).layer1CostPerUnit).toBeCloseTo(
      calculateROI(listPrice).layer1CostPerUnit,
      8,
    );
  });
});

describe('preset integrity', () => {
  it('gives every preset a model identity from the pricing catalog', () => {
    Object.entries(PRESETS).forEach(([key, value]) => {
      if (!value.primaryModel) return;
      expect(value.primaryModel.modelId, `${key} lost its model identity`).toBeTruthy();
      expect(value.primaryModel.pricedAt, `${key} has no price date`).toBeTruthy();
    });
  });

  it('exposes the same preset keys the MCP tool advertises', () => {
    // The tool's enum is hand-written; this catches a preset added on one side only.
    const advertised = [
      'support', 'knowledgeQA', 'meetingSummary', 'marketingContent',
      'codingTask', 'invoice', 'callSummary', 'agentWorkflow',
      'recommendation', 'retention', 'premium',
    ];

    expect(Object.keys(PRESETS).sort()).toEqual([...advertised].sort());
  });
});
