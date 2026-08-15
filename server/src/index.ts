import { McpServer } from "skybridge/server";
import { z } from "zod";
import { calculateROI } from "./lib/calculations.js";
import { PRESETS, DEFAULT_INPUTS } from "./lib/constants.js";
import type { ModelParams, UseCaseInputs } from "./lib/types.js";
import { ValueMethod } from "./lib/types.js";
import { findModel, getCatalog, provenance } from "./catalog.js";
import { calculatorUrl } from "./deeplink.js";

declare const process: {
  env: Record<string, string | undefined>;
};

type TextResponse = {
  status: (code: number) => TextResponse;
  type: (contentType: string) => TextResponse;
  send: (body: string) => void;
};

const ALL_PRESETS = [
  "support", "knowledgeQA", "meetingSummary", "marketingContent",
  "codingTask", "invoice", "callSummary", "agentWorkflow",
  "recommendation", "retention", "premium",
] as const;

const modelParamsSchema = z.object({
  avgInputTokensPerUnit: z.number().min(0).optional().describe("Average input tokens per unit"),
  avgOutputTokensPerUnit: z.number().min(0).optional().describe("Average output tokens per unit"),
  pricePer1MInputTokens: z.number().min(0).optional().describe("Price per 1M input tokens (USD)"),
  pricePer1MOutputTokens: z.number().min(0).optional().describe("Price per 1M output tokens (USD)"),
  costPerCall: z
    .number()
    .min(0)
    .optional()
    .describe("Flat cost per request (USD). Only used when useCallPricing is true."),
  useCallPricing: z
    .boolean()
    .optional()
    .describe(
      "Bill a flat rate per request instead of per token. Use for per-page OCR, per-image " +
      "generation, per-minute transcription, or a negotiated per-request contract. " +
      "Token counts, cache and batch discounts are then ignored; retries still apply.",
    ),
  cachedInputPricePer1M: z
    .number()
    .min(0)
    .optional()
    .describe(
      "Provider's published prompt-cache read price per 1M input tokens. When set, it is " +
      "used for the cached share instead of the generic cachedTokenDiscount.",
    ),
  batchInputPricePer1M: z
    .number()
    .min(0)
    .optional()
    .describe("Provider's published batch API input price per 1M tokens (used when batchProcessing is true)"),
  batchOutputPricePer1M: z
    .number()
    .min(0)
    .optional()
    .describe("Provider's published batch API output price per 1M tokens"),
  modelName: z.string().optional().describe("Display name of the model these prices came from"),
  provider: z.string().optional().describe("Provider of the model these prices came from"),
});

const useCaseInputSchema = z.object({
  preset: z
    .enum(ALL_PRESETS)
    .optional()
    .describe(
      "Optional preset to load before applying any custom input overrides. " +
      "Available: support (Customer Support Bot), knowledgeQA (Knowledge Q&A), " +
      "meetingSummary (Meeting Summary), marketingContent (Marketing Content), " +
      "codingTask (Coding Task), invoice (Invoice Processing), " +
      "callSummary (Call Summary), agentWorkflow (Agent Workflow), " +
      "recommendation (E-commerce Recommendations), retention (Customer Retention AI), " +
      "premium (AI Premium Features)"
    ),
  model: z
    .string()
    .optional()
    .describe(
      "Model to price the scenario with, looked up live in the AI Pricing Hub catalog. " +
      "Accepts a catalog id ('anthropic/claude-haiku-4-5') or a name ('Claude Haiku 4.5', " +
      "'GPT-5.4'). Fills input/output prices plus the provider's published cache-read and " +
      "batch rates, overriding the preset's model. Use primaryModel instead for a negotiated " +
      "rate that is not in the catalog.",
    ),
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
  cacheHitRate: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Share of input tokens served from the prompt cache (0-100%)"),
  cachedTokenDiscount: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe(
      "Fallback discount on cached input tokens (0-100%). Ignored when the model carries a " +
      "published cachedInputPricePer1M.",
    ),
  batchProcessing: z
    .boolean()
    .optional()
    .describe(
      "Async workload: apply the provider's published batch rates (about -50%) where they " +
      "exist, and halve the cache-read price accordingly.",
    ),

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

/** Merge DEFAULT_INPUTS + optional preset + catalog model + user overrides */
function buildFullInputs(
  inputs: z.infer<typeof useCaseInputSchema>,
  catalogModel?: Partial<ModelParams>,
): UseCaseInputs {
  // `preset` selects the base and `model` is a catalog lookup key; neither is an
  // input field, so they must not travel into the returned object (and out
  // through structuredContent).
  const { preset, model: _modelQuery, ...overrides } = inputs;
  const presetData = preset ? PRESETS[preset] : undefined;
  return {
    ...DEFAULT_INPUTS,
    ...presetData,
    ...overrides,
    primaryModel: {
      ...DEFAULT_INPUTS.primaryModel,
      ...presetData?.primaryModel,
      // Catalog prices sit between the preset and the caller's explicit overrides
      ...catalogModel,
      ...inputs.primaryModel,
    },
    secondaryModel: {
      ...DEFAULT_INPUTS.secondaryModel,
      ...presetData?.secondaryModel,
      ...inputs.secondaryModel,
    },
  };
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const normalizeOrigin = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
};

const parseOriginList = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .filter((entry): entry is string => Boolean(entry));

const publicAppOrigin = normalizeOrigin(process.env.PUBLIC_APP_ORIGIN);
const widgetConnectDomains = parseOriginList(process.env.WIDGET_CONNECT_DOMAINS);
const widgetResourceDomains = parseOriginList(process.env.WIDGET_RESOURCE_DOMAINS);
const widgetRedirectDomains = parseOriginList(process.env.WIDGET_REDIRECT_DOMAINS);
const widgetFrameDomains = parseOriginList(process.env.WIDGET_FRAME_DOMAINS);
const openAiAppsChallenge = process.env.OPENAI_APPS_CHALLENGE?.trim();

if (publicAppOrigin) {
  if (widgetConnectDomains.length === 0) {
    widgetConnectDomains.push(publicAppOrigin);
  }
  if (widgetResourceDomains.length === 0) {
    widgetResourceDomains.push(publicAppOrigin);
  }
}

const widgetUiMeta = {
  prefersBorder: true,
  ...(publicAppOrigin ? { domain: publicAppOrigin } : {}),
  ...(
    widgetConnectDomains.length > 0 ||
    widgetResourceDomains.length > 0 ||
    widgetRedirectDomains.length > 0 ||
    widgetFrameDomains.length > 0
      ? {
          csp: {
            ...(widgetConnectDomains.length > 0 ? { connectDomains: widgetConnectDomains } : {}),
            ...(widgetResourceDomains.length > 0 ? { resourceDomains: widgetResourceDomains } : {}),
            ...(widgetRedirectDomains.length > 0 ? { redirectDomains: widgetRedirectDomains } : {}),
            ...(widgetFrameDomains.length > 0 ? { frameDomains: widgetFrameDomains } : {}),
          },
        }
      : {}
  ),
};

const server = new McpServer(
  { name: "ai-roi-calculator", version: "1.3.0" },
  { capabilities: {} },
);

const readOnlyAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
  destructiveHint: false,
};
const appsSdkWidgetUri = "ui://widgets/apps-sdk/calculate-roi-v4.html";
const mcpAppWidgetUri = "ui://widgets/ext-apps/calculate-roi-v4.html";

const openAiAppsChallengeHandler = (_req: unknown, res: TextResponse) => {
  if (!openAiAppsChallenge) {
    res.status(404).type("text/plain").send("OPENAI_APPS_CHALLENGE is not configured.");
    return;
  }

  res.type("text/plain").send(openAiAppsChallenge);
};

server.use("/.well-known/openai-apps-challenge", openAiAppsChallengeHandler);

// ─── Tool 1: Calculate ROI (widget) ────────────────────────────────────────

server.registerWidget(
  "calculate-roi-v4",
  {
    description: "AI ROI Calculator - Interactive dashboard showing ROI metrics",
    _meta: { ui: widgetUiMeta },
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
      const lookup = inputs.model ? await findModel(inputs.model) : null;
      if (inputs.model && !lookup) {
        return {
          content: [
            {
              type: "text",
              text:
                `No model matching "${inputs.model}" is in the AI Pricing Hub catalog. ` +
                `Try a catalog id such as "anthropic/claude-haiku-4-5", or pass explicit ` +
                `prices via primaryModel instead of a name.`,
            },
          ],
          isError: true,
        };
      }

      const fullInputs = buildFullInputs(inputs, lookup?.params);
      const results = calculateROI(fullInputs);
      const priceNote = lookup
        ? `${lookup.model.provider} ${lookup.model.model} — ${provenance(await getCatalog())}`
        : undefined;
      const openInCalculator = calculatorUrl(fullInputs, inputs.preset);

      const baselineMonthlyCost =
        fullInputs.valueMethod === ValueMethod.COST_DISPLACEMENT
          ? fullInputs.baselineHumanCostPerUnit * fullInputs.monthlyVolume
          : undefined;

      const summary = [
        `${fullInputs.useCaseName} — ROI Summary`,
        `ROI: ${results.roiPercentage.toFixed(1)}%`,
        `Net Monthly Benefit: $${fmt(results.netMonthlyBenefit)}`,
        `Annualized Net Benefit: $${fmt(results.annualizedNetBenefit)}`,
        `Payback: ${results.paybackMonths} months`,
        `Break-even Volume: ${results.breakEvenVolume !== undefined ? results.breakEvenVolume.toLocaleString() : "N/A"} ${fullInputs.unitName}s/month`,
        `Monthly Cost: $${fmt(results.totalMonthlyCost)} | Monthly Value: $${fmt(results.totalMonthlyValue)}`,
      ].join(" | ");

      const baselineRow =
        baselineMonthlyCost !== undefined
          ? `| Human Baseline (monthly) | $${fmt(baselineMonthlyCost)} |\n`
          : "";

      return {
        structuredContent: {
          inputs: fullInputs,
          results,
          modelPricing: lookup
            ? { modelId: lookup.params.modelId, pricedAt: lookup.pricedAt, source: lookup.source }
            : undefined,
          calculatorUrl: openInCalculator,
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
              baselineRow +
              `| Unit Cost (full stack) | $${results.totalCostPerUnit.toFixed(4)} |`,
              "",
              `> **Important:** Net benefit already accounts for ${fullInputs.successRate}% success rate, deflection rate, and residual review costs. Do not recompute savings from raw baseline figures.`,
              "",
              `> Report these figures exactly as shown. Do not recalculate or estimate any amounts.`,
              ...(priceNote ? ["", `> Model priced: ${priceNote}`] : []),
              "",
              `**Summary:** ${summary}`,
              "",
              `[Open this scenario in the calculator](${openInCalculator}) — adjust the assumptions and save it.`,
              "",
              `Methodology: https://airoicalculator.optimnow.io | Full formulas: https://github.com/OptimNow/ai-roi-calculator/blob/main/METHODOLOGY.md`,
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

// ─── Tool: Look up model prices ────────────────────────────────────────────

server.registerTool(
  "lookup-model-price",
  {
    title: "Look up model prices",
    description:
      "Use this to find current list prices for an AI model, or to see what is available, " +
      "before pricing a scenario. Prices come from the AI Pricing Hub catalog and include " +
      "the provider's published prompt-cache read and batch rates where they exist. " +
      "Call with a model name to price one model, or with no arguments for the top models " +
      "by Arena ELO. Report the price date alongside any figure — list prices move.",
    inputSchema: {
      model: z
        .string()
        .optional()
        .describe("Model name or catalog id. Omit to list the top models instead."),
      limit: z.number().min(1).max(50).optional().describe("How many models to list (default 15)"),
    },
    annotations: readOnlyAnnotations,
    _meta: {
      "openai/toolInvocation/invoking": "Checking model prices",
      "openai/toolInvocation/invoked": "Model prices retrieved",
    },
  },
  async ({ model, limit }) => {
    try {
      const catalog = await getCatalog();

      if (model) {
        const found = await findModel(model);
        if (!found) {
          return {
            content: [
              {
                type: "text",
                text: `No model matching "${model}" is in the catalog. Call this tool without arguments to see what is available.`,
              },
            ],
            isError: true,
          };
        }
        const m = found.model;
        const line = (label: string, value?: number) =>
          value === undefined ? `| ${label} | not published |` : `| ${label} | $${value} |`;

        return {
          structuredContent: { model: m, params: found.params, pricedAt: found.pricedAt, source: found.source },
          content: [
            {
              type: "text",
              text: [
                `## ${m.provider} ${m.model}`,
                "",
                "| Price (per 1M tokens) | USD |",
                "|---|---|",
                line("Input", m.inputPricePer1M),
                line("Output", m.outputPricePer1M),
                line("Batch input", m.batchInputPricePer1M),
                line("Batch output", m.batchOutputPricePer1M),
                line("Prompt-cache read", m.cachedInputPricePer1M),
                "",
                `Context ${m.contextWindow ?? "n/a"} · ${m.category ?? "uncategorised"}${m.eloScore ? ` · Arena ELO ${m.eloScore}` : ""}`,
                "",
                `> ${provenance(catalog)}`,
                "",
                `To price a business case on this model, call the ROI calculator tool with model: "${found.params.modelId}".`,
              ].join("\n"),
            },
          ],
          isError: false,
        };
      }

      const top = catalog.models.slice(0, limit ?? 15);
      return {
        structuredContent: { models: top, pricedAt: catalog.pricedAt, source: catalog.source },
        content: [
          {
            type: "text",
            text: [
              `## Top ${top.length} models by Arena ELO (of ${catalog.models.length})`,
              "",
              "| Model | Provider | In $/1M | Out $/1M | Cache read | ELO |",
              "|---|---|---|---|---|---|",
              ...top.map(
                (m) =>
                  `| ${m.model} | ${m.provider} | ${m.inputPricePer1M} | ${m.outputPricePer1M} | ${m.cachedInputPricePer1M ?? "—"} | ${m.eloScore ?? "—"} |`,
              ),
              "",
              `> ${provenance(catalog)}`,
              "",
              `Full comparison: https://aipricinghub.optimnow.io`,
            ].join("\n"),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Could not reach the pricing catalog: ${error}` }],
        isError: true,
      };
    }
  },
);

// ─── Tool 2: Load Preset ───────────────────────────────────────────────────

server.registerTool(
  "load-preset",
  {
    title: "Load ROI preset",
    description:
      "Use this when you want the default assumptions for a common AI ROI scenario before applying your own overrides. " +
      "Available presets: support (Customer Support Bot), knowledgeQA (Knowledge Q&A), " +
      "meetingSummary (Meeting Summary), marketingContent (Marketing Content), " +
      "codingTask (Coding Task), invoice (Invoice Processing), " +
      "callSummary (Call Summary), agentWorkflow (Agent Workflow), " +
      "recommendation (E-commerce Recommendations), retention (Customer Retention AI), " +
      "premium (AI Premium Features). " +
      "Returns the preset inputs together with the standard ROI dashboard payload.",
    inputSchema: {
      preset: z
        .enum(ALL_PRESETS)
        .describe("The preset use case to load"),
    },
    annotations: readOnlyAnnotations,
    _meta: {
      "openai/toolInvocation/invoking": "Loading preset",
      "openai/toolInvocation/invoked": "Preset loaded",
      "openai/outputTemplate": appsSdkWidgetUri,
      ui: { resourceUri: mcpAppWidgetUri },
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

    const fullInputs = buildFullInputs({ preset });
    const results = calculateROI(fullInputs);

    return {
      structuredContent: { inputs: fullInputs, results },
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

// ─── Tool 3: Sensitivity Analysis ──────────────────────────────────────────

server.registerTool(
  "sensitivity-analysis",
  {
    title: "Sensitivity Analysis",
    description:
      "Use this when you need to see which assumptions have the biggest impact on ROI for an AI scenario. " +
      "Takes the SAME inputs as 'calculate-roi-v4' (preset + optional overrides) and tests how ROI changes " +
      "when each key variable is varied by ±20%. " +
      "Returns a tornado-style table showing which assumptions have the biggest impact on ROI. " +
      "Use this tool when the user asks questions like 'which assumptions matter most?', " +
      "'what if the conversion uplift is different?', 'how sensitive is the ROI?', or " +
      "'what drives the outcome?'. " +
      "IMPORTANT: Pass the SAME inputs that were used for the base ROI calculation so the sensitivity " +
      "analysis is based on the correct scenario — do NOT use defaults if the user provided custom values. " +
      "Report the results EXACTLY as returned. Do NOT recalculate or add your own sensitivity estimates.",
    inputSchema: useCaseInputSchema.shape,
    annotations: readOnlyAnnotations,
    _meta: {
      "openai/toolInvocation/invoking": "Running sensitivity analysis",
      "openai/toolInvocation/invoked": "Sensitivity analysis complete",
    },
  },
  async (inputs) => {
    try {
      const fullInputs = buildFullInputs(inputs);

      // Base case
      const base = calculateROI(fullInputs);
      const baseROI = base.roiPercentage;
      const baseNetBenefit = base.netMonthlyBenefit;

      // Define the four sensitivity dimensions
      const dimensions = [
        {
          name: "Volume",
          description: `Monthly ${fullInputs.unitName} volume`,
          baseValue: `${fullInputs.monthlyVolume.toLocaleString()} ${fullInputs.unitName}s/mo`,
          lowMod: { volumeMultiplier: 0.8, successRateMultiplier: 1, costMultiplier: 1, valueMultiplier: 1 },
          highMod: { volumeMultiplier: 1.2, successRateMultiplier: 1, costMultiplier: 1, valueMultiplier: 1 },
        },
        {
          name: "Success Rate",
          description: "AI task success rate",
          baseValue: `${fullInputs.successRate}%`,
          lowMod: { volumeMultiplier: 1, successRateMultiplier: 0.8, costMultiplier: 1, valueMultiplier: 1 },
          highMod: { volumeMultiplier: 1, successRateMultiplier: 1.2, costMultiplier: 1, valueMultiplier: 1 },
        },
        {
          name: "Cost",
          description: "Infrastructure + harness costs",
          baseValue: `$${fmt(base.totalMonthlyCost)}/mo`,
          lowMod: { volumeMultiplier: 1, successRateMultiplier: 1, costMultiplier: 0.8, valueMultiplier: 1 },
          highMod: { volumeMultiplier: 1, successRateMultiplier: 1, costMultiplier: 1.2, valueMultiplier: 1 },
        },
        {
          name: "Value",
          description: valueLabel(fullInputs.valueMethod),
          baseValue: `$${fmt(base.totalMonthlyValue)}/mo`,
          lowMod: { volumeMultiplier: 1, successRateMultiplier: 1, costMultiplier: 1, valueMultiplier: 0.8 },
          highMod: { volumeMultiplier: 1, successRateMultiplier: 1, costMultiplier: 1, valueMultiplier: 1.2 },
        },
      ];

      const rows = dimensions.map((dim) => {
        const lowResult = calculateROI(fullInputs, dim.lowMod);
        const highResult = calculateROI(fullInputs, dim.highMod);
        const swing = Math.abs(highResult.roiPercentage - lowResult.roiPercentage);
        return {
          name: dim.name,
          description: dim.description,
          baseValue: dim.baseValue,
          roiAt80: lowResult.roiPercentage,
          roiAt120: highResult.roiPercentage,
          netAt80: lowResult.netMonthlyBenefit,
          netAt120: highResult.netMonthlyBenefit,
          swing,
        };
      });

      // Sort by swing descending (biggest impact first)
      rows.sort((a, b) => b.swing - a.swing);

      // Build markdown table
      const table = [
        "| Variable | Base Value | ROI at −20% | ROI at +20% | Swing | Net Benefit at −20% | Net Benefit at +20% |",
        "|----------|-----------|-------------|-------------|-------|---------------------|---------------------|",
        ...rows.map((r) =>
          `| ${r.name} | ${r.baseValue} | ${r.roiAt80.toFixed(1)}% | ${r.roiAt120.toFixed(1)}% | ${r.swing.toFixed(1)} pp | $${fmt(r.netAt80)} | $${fmt(r.netAt120)} |`
        ),
      ].join("\n");

      const topDriver = rows[0];

      return {
        structuredContent: {
          inputs: fullInputs,
          baseResults: base,
          sensitivity: rows,
        },
        content: [
          {
            type: "text",
            text: [
              `## ${fullInputs.useCaseName} - Sensitivity Analysis`,
              "",
              `**Base scenario:** ROI ${baseROI.toFixed(1)}% | Net monthly benefit $${fmt(baseNetBenefit)}`,
              "",
              "Each variable is tested at ±20% from its base value while all others remain constant.",
              "",
              table,
              "",
              `**Most impactful variable:** ${topDriver.name} (${topDriver.description}) — a ±20% change swings ROI by ${topDriver.swing.toFixed(1)} percentage points.`,
              "",
              `> These results are computed using the exact same calculation engine as the ROI dashboard. Report them exactly as shown — do not recalculate or estimate.`,
              "",
              `Methodology: https://airoicalculator.optimnow.io | Full formulas: https://github.com/OptimNow/ai-roi-calculator/blob/main/METHODOLOGY.md`,
            ].join("\n"),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Sensitivity analysis error: ${error}` }],
        isError: true,
      };
    }
  },
);

/** Human-readable label for the value dimension based on value method */
function valueLabel(method: ValueMethod): string {
  switch (method) {
    case ValueMethod.COST_DISPLACEMENT:
      return "Deflection rate & human cost savings";
    case ValueMethod.REVENUE_UPLIFT:
      return "Conversion uplift & revenue impact";
    case ValueMethod.RETENTION:
      return "Churn reduction & customer retention";
    case ValueMethod.PREMIUM_MONETIZATION:
      return "Subscription revenue & margins";
  }
}

server.run();

export type AppType = typeof server;
