import { McpServer } from "skybridge/server";
import { z } from "zod";
import { calculateROI } from "./lib/calculations.js";
import { PRESETS, DEFAULT_INPUTS } from "./lib/constants.js";
import { ValueMethod } from "./lib/types.js";

const modelParamsSchema = z.object({
  avgInputTokensPerUnit: z.number().min(0).optional().describe("Average input tokens per unit"),
  avgOutputTokensPerUnit: z.number().min(0).optional().describe("Average output tokens per unit"),
  pricePer1MInputTokens: z.number().min(0).optional().describe("Price per 1M input tokens (USD)"),
  pricePer1MOutputTokens: z.number().min(0).optional().describe("Price per 1M output tokens (USD)"),
  costPerCall: z.number().min(0).optional().describe("Flat cost per API call (alternative to token pricing)"),
  useCallPricing: z.boolean().optional().describe("Use per-call pricing instead of token-based"),
});

const useCaseInputSchema = z.object({
  preset: z
    .enum(["support", "invoice", "recommendation", "retention", "premium"])
    .optional()
    .describe("Optional preset to load before applying any custom input overrides"),
  useCaseName: z.string().optional().describe("Use case name"),
  unitName: z.string().optional().describe("Unit name"),
  monthlyVolume: z.number().min(0).optional().describe("Monthly transaction volume"),
  successRate: z.number().min(0).max(100).optional().describe("Success rate (0-100%)"),
  analysisHorizonMonths: z.number().min(1).optional().describe("Analysis horizon in months"),

  integrationCost: z.number().min(0).optional(),
  trainingTuningCost: z.number().min(0).optional(),
  changeManagementCost: z.number().min(0).optional(),
  amortizationMonths: z.number().min(1).optional(),

  primaryModel: modelParamsSchema.optional(),
  secondaryModel: modelParamsSchema.optional(),
  routingSimplePercent: z.number().min(0).max(100).optional(),
  cacheHitRate: z.number().min(0).max(100).optional(),
  cachedTokenDiscount: z.number().min(0).max(100).optional(),

  orchestrationCostPerUnit: z.number().min(0).optional(),
  retrievalCostPerUnit: z.number().min(0).optional(),
  toolApiCostPerUnit: z.number().min(0).optional(),
  loggingMonitoringCostPerUnit: z.number().min(0).optional(),
  safetyGuardrailsCostPerUnit: z.number().min(0).optional(),
  networkEgressCostPerUnit: z.number().min(0).optional(),
  storageCostPerUnit: z.number().min(0).optional(),
  retryRate: z.number().min(0).max(1).optional(),
  overheadMultiplier: z.number().min(1).optional(),

  valueMethod: z.nativeEnum(ValueMethod).optional(),

  baselineHumanCostPerUnit: z.number().min(0).optional(),
  deflectionRate: z.number().min(0).max(100).optional(),
  residualHumanReviewRate: z.number().min(0).max(100).optional(),
  residualReviewCostPerUnit: z.number().min(0).optional(),

  baselineConversionRate: z.number().min(0).max(100).optional(),
  conversionUpliftAbsolute: z.number().min(0).optional(),
  averageOrderValue: z.number().min(0).optional(),
  grossMargin: z.number().min(0).max(100).optional(),

  baselineChurnRate: z.number().min(0).max(100).optional(),
  churnReductionAbsolute: z.number().min(0).optional(),
  annualValuePerCustomer: z.number().min(0).optional(),
  customersImpactedPerMonth: z.number().min(0).optional(),

  pricePerSubscriberPerMonth: z.number().min(0).optional(),
  subscribers: z.number().min(0).optional(),
  nonAiCOGSPerSubscriber: z.number().min(0).optional(),
});

const server = new McpServer(
  {
    name: "ai-roi-calculator",
    version: "1.1.0",
  },
  { capabilities: {} },
);

const readOnlyAnnotations = { readOnlyHint: true };
const appsSdkWidgetUri = "ui://widgets/apps-sdk/calculate-roi-v4.html";
const mcpAppWidgetUri = "ui://widgets/ext-apps/calculate-roi-v4.html";

server.registerWidget(
  "calculate-roi-v4",
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
      "Use this when you want the full interactive ROI dashboard for an AI/LLM implementation. " +
      "It can run directly from a preset such as 'support' and render KPI cards, break-even banner, ROI curve, and financial overview. " +
      "Returns ROI percentage, payback period, break-even volume, cost breakdown, and net benefit. " +
      "You do not need to call 'load-preset' first unless you only want the raw preset values. " +
      "IMPORTANT: When presenting results, report ALL dollar amounts and percentages EXACTLY as returned in the summary. " +
      "Do NOT recalculate, round, or estimate any figures — especially do not compute annual from monthly yourself. " +
      "Use the summary field verbatim when presenting results in text.",
    inputSchema: useCaseInputSchema.shape,
    annotations: readOnlyAnnotations,
    _meta: {
      "openai/toolInvocation/invoking": "Calculating ROI",
      "openai/toolInvocation/invoked": "ROI calculation complete",
    },
  },
  async (inputs) => {
    try {
      const presetData = inputs.preset ? PRESETS[inputs.preset] : undefined;
      const fullInputs = {
        ...DEFAULT_INPUTS,
        ...presetData,
        ...inputs,
        primaryModel: {
          ...DEFAULT_INPUTS.primaryModel,
          ...presetData?.primaryModel,
          ...inputs.primaryModel,
        },
        secondaryModel: {
          ...DEFAULT_INPUTS.secondaryModel,
          ...presetData?.secondaryModel,
          ...inputs.secondaryModel,
        },
      };
      const results = calculateROI(fullInputs);

      const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const summary = [
        `${fullInputs.useCaseName} — ROI Summary`,
        `ROI: ${results.roiPercentage.toFixed(1)}%`,
        `Net Monthly Benefit: $${fmt(results.netMonthlyBenefit)}`,
        `Annualized Net Benefit: $${fmt(results.annualizedNetBenefit)}`,
        `Payback: ${results.paybackMonths} months`,
        `Break-even Volume: ${results.breakEvenVolume !== undefined ? results.breakEvenVolume.toLocaleString() : "N/A"} ${fullInputs.unitName}s/month`,
        `Monthly Cost: $${fmt(results.totalMonthlyCost)} | Monthly Value: $${fmt(results.totalMonthlyValue)}`,
      ].join(" | ");

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
              `| Net Monthly Benefit | $${fmt(results.netMonthlyBenefit)} |`,
              `| Annualized Net Benefit | $${fmt(results.annualizedNetBenefit)} |`,
              `| Payback Period | ${results.paybackMonths} months |`,
              `| Break-even Volume | ${results.breakEvenVolume !== undefined ? results.breakEvenVolume.toLocaleString() : "N/A"} ${fullInputs.unitName}s/month |`,
              `| Monthly Cost | $${fmt(results.totalMonthlyCost)} |`,
              `| Monthly Value | $${fmt(results.totalMonthlyValue)} |`,
              "",
              `> Report these figures exactly as shown. Full cost layer breakdown is in the interactive widget.`,
              "",
              `**Summary:** ${summary}`,
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
      "premium (AI Premium Features). Returns raw preset values only and does not render the dashboard.",
    inputSchema: {
      preset: z
        .enum(["support", "invoice", "recommendation", "retention", "premium"])
        .describe("The preset use case to load"),
    },
    annotations: readOnlyAnnotations,
    _meta: {
      "openai/toolInvocation/invoking": "Loading preset",
      "openai/toolInvocation/invoked": "Preset loaded",
      "openai/outputTemplate": appsSdkWidgetUri,
      ui: {
        resourceUri: mcpAppWidgetUri,
      },
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

    const fullInputs = {
      ...DEFAULT_INPUTS,
      ...presetData,
      primaryModel: {
        ...DEFAULT_INPUTS.primaryModel,
        ...presetData.primaryModel,
      },
      secondaryModel: {
        ...DEFAULT_INPUTS.secondaryModel,
        ...presetData.secondaryModel,
      },
    };
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
            "Preset loaded and dashboard rendered with default values.",
          ].join("\n"),
        },
      ],
      isError: false,
    };
  },
);

server.run();

export type AppType = typeof server;



