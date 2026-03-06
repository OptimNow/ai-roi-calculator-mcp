import { McpServer } from "skybridge/server";
import { z } from "zod";
import { calculateROI } from "./lib/calculations.js";
import { PRESETS, DEFAULT_INPUTS } from "./lib/constants.js";
import { ValueMethod } from "./lib/types.js";

const modelParamsSchema = z.object({
  avgInputTokensPerUnit: z.number().min(0).describe("Average input tokens per unit"),
  avgOutputTokensPerUnit: z.number().min(0).describe("Average output tokens per unit"),
  pricePer1MInputTokens: z.number().min(0).describe("Price per 1M input tokens (USD)"),
  pricePer1MOutputTokens: z.number().min(0).describe("Price per 1M output tokens (USD)"),
  costPerCall: z.number().min(0).describe("Flat cost per API call (alternative to token pricing)"),
  useCallPricing: z.boolean().describe("Use per-call pricing instead of token-based"),
});

const useCaseInputSchema = z.object({
  useCaseName: z.string().default("AI Project"),
  unitName: z.string().default("transaction"),
  monthlyVolume: z.number().min(0).describe("Monthly transaction volume"),
  successRate: z.number().min(0).max(100).default(95).describe("Success rate (0-100%)"),
  analysisHorizonMonths: z.number().min(1).default(12),

  integrationCost: z.number().min(0).default(5000),
  trainingTuningCost: z.number().min(0).default(2000),
  changeManagementCost: z.number().min(0).default(1000),
  amortizationMonths: z.number().min(1).default(12),

  primaryModel: modelParamsSchema.default({
    avgInputTokensPerUnit: 1000,
    avgOutputTokensPerUnit: 500,
    pricePer1MInputTokens: 0.15,
    pricePer1MOutputTokens: 0.6,
    costPerCall: 0.005,
    useCallPricing: false,
  }),
  secondaryModel: modelParamsSchema.default({
    avgInputTokensPerUnit: 1000,
    avgOutputTokensPerUnit: 500,
    pricePer1MInputTokens: 2.5,
    pricePer1MOutputTokens: 10,
    costPerCall: 0.005,
    useCallPricing: false,
  }),
  routingSimplePercent: z.number().min(0).max(100).default(100),
  cacheHitRate: z.number().min(0).max(100).default(10),
  cachedTokenDiscount: z.number().min(0).max(100).default(90),

  orchestrationCostPerUnit: z.number().min(0).default(0.001),
  retrievalCostPerUnit: z.number().min(0).default(0.002),
  toolApiCostPerUnit: z.number().min(0).default(0),
  loggingMonitoringCostPerUnit: z.number().min(0).default(0.0005),
  safetyGuardrailsCostPerUnit: z.number().min(0).default(0.0005),
  networkEgressCostPerUnit: z.number().min(0).default(0.0001),
  storageCostPerUnit: z.number().min(0).default(0.0001),
  retryRate: z.number().min(0).max(1).default(0.1),
  overheadMultiplier: z.number().min(1).default(1.0),

  valueMethod: z.nativeEnum(ValueMethod).default(ValueMethod.COST_DISPLACEMENT),

  baselineHumanCostPerUnit: z.number().min(0).default(5),
  deflectionRate: z.number().min(0).max(100).default(40),
  residualHumanReviewRate: z.number().min(0).max(100).default(10),
  residualReviewCostPerUnit: z.number().min(0).default(2.5),

  baselineConversionRate: z.number().min(0).max(100).default(2.5),
  conversionUpliftAbsolute: z.number().min(0).default(0.5),
  averageOrderValue: z.number().min(0).default(100),
  grossMargin: z.number().min(0).max(100).default(60),

  baselineChurnRate: z.number().min(0).max(100).default(1.0),
  churnReductionAbsolute: z.number().min(0).default(0.1),
  annualValuePerCustomer: z.number().min(0).default(1200),
  customersImpactedPerMonth: z.number().min(0).default(1000),

  pricePerSubscriberPerMonth: z.number().min(0).default(20),
  subscribers: z.number().min(0).default(500),
  nonAiCOGSPerSubscriber: z.number().min(0).default(2),
});

const server = new McpServer(
  {
    name: "ai-roi-calculator",
    version: "1.0.2",
  },
  { capabilities: {} },
);

const readOnlyAnnotations = { readOnlyHint: true };

server.registerWidget(
  "calculate-roi-v3",
  {
    description: "AI ROI Calculator - Interactive dashboard showing ROI metrics",
    _meta: {
      ui: {
        prefersBorder: true,
      },
    },
  },
  {
    title: "Calculate ROI",
    description:
      "Calculate ROI for an AI/LLM implementation using a 3-layer cost framework. " +
      "Returns ROI percentage, payback period, break-even volume, cost breakdown, and net benefit. " +
      "Use 'load-preset' first to get recommended defaults for common use cases.",
    inputSchema: useCaseInputSchema.shape,
    annotations: readOnlyAnnotations,
    _meta: {
      "openai/toolInvocation/invoking": "Calculating ROI",
      "openai/toolInvocation/invoked": "ROI calculation complete",
    },
  },
  async (inputs) => {
    try {
      const fullInputs = { ...DEFAULT_INPUTS, ...inputs };
      const results = calculateROI(fullInputs);

      return {
        structuredContent: {
          inputs: fullInputs,
          results,
        },
        content: [
          {
            type: "text",
            text: [
              `## ${fullInputs.useCaseName} - ROI Analysis`,
              "",
              "| Metric | Value |",
              "|--------|-------|",
              `| ROI | ${results.roiPercentage.toFixed(1)}% |`,
              `| Monthly Volume | ${results.effectiveMonthlyVolume.toLocaleString()} ${fullInputs.unitName}s |`,
              `| Monthly Cost | $${results.totalMonthlyCost.toFixed(2)} |`,
              `| Monthly Value | $${results.totalMonthlyValue.toFixed(2)} |`,
              `| Net Monthly Benefit | $${results.netMonthlyBenefit.toFixed(2)} |`,
              `| Annualized Net Benefit | $${results.annualizedNetBenefit.toFixed(2)} |`,
              `| Payback Period | ${results.paybackMonths} months |`,
              `| Break-even Volume | ${results.breakEvenVolume !== undefined ? results.breakEvenVolume.toLocaleString() : "N/A"} ${fullInputs.unitName}s/month |`,
              "",
              "### Cost Breakdown",
              "| Layer | Per Unit | Monthly |",
              "|-------|----------|---------|",
              `| L1 Infrastructure | $${results.layer1CostPerUnit.toFixed(6)} | $${results.layer1MonthlyCost.toFixed(2)} |`,
              `| L2 Harness | $${results.layer2CostPerUnit.toFixed(6)} | $${results.layer2MonthlyCost.toFixed(2)} |`,
              `| Fixed (amortized) | - | $${results.monthlyAmortizedFixedCost.toFixed(2)} |`,
              "",
              `**Value Method:** ${fullInputs.valueMethod}`,
            ].join("\n"),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Calculation error: ${error}` }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "load-preset",
  {
    title: "Load ROI preset",
    description:
      "Load a preset configuration for a common AI use case. " +
      "Available presets: support (Customer Support Bot), invoice (Invoice Processing), " +
      "recommendation (E-commerce Recommendations), retention (Customer Retention AI), " +
      "premium (AI Premium Features). Returns pre-filled inputs you can pass to calculate-roi-v3.",
    inputSchema: {
      preset: z
        .enum(["support", "invoice", "recommendation", "retention", "premium"])
        .describe("The preset use case to load"),
    },
    annotations: readOnlyAnnotations,
    _meta: {
      "openai/toolInvocation/invoking": "Loading preset",
      "openai/toolInvocation/invoked": "Preset loaded",
    },
  },
  async ({ preset }) => {
    const presetData = PRESETS[preset];
    if (!presetData) {
      return {
        content: [{ type: "text", text: `Unknown preset: ${preset}` }],
        isError: true,
      };
    }

    const fullInputs = { ...DEFAULT_INPUTS, ...presetData };

    return {
      content: [
        {
          type: "text",
          text: [
            `## Preset Loaded: ${fullInputs.useCaseName}`,
            "",
            "| Setting | Value |",
            "|---------|-------|",
            `| Unit | ${fullInputs.unitName} |`,
            `| Monthly Volume | ${fullInputs.monthlyVolume.toLocaleString()} |`,
            `| Success Rate | ${fullInputs.successRate}% |`,
            `| Value Method | ${fullInputs.valueMethod} |`,
            `| Primary Model Input Tokens | ${fullInputs.primaryModel.avgInputTokensPerUnit} |`,
            `| Primary Model Output Tokens | ${fullInputs.primaryModel.avgOutputTokensPerUnit} |`,
            "",
            "You can now run `calculate-roi-v3` with these defaults, or modify individual fields.",
          ].join("\n"),
        },
      ],
      isError: false,
    };
  },
);

server.run();

export type AppType = typeof server;


