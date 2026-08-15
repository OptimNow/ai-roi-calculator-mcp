import type { UseCaseInputs } from "./lib/types.js";
import { toModelId } from "./lib/modelCatalog.js";

/**
 * Link back into the web calculator carrying the scenario just computed, so the
 * conversation can end with "open this and adjust it yourself" rather than a
 * dead end. Mirrors the contract the calculator validates in utils/deepLink.ts.
 */

const CALCULATOR_URL = "https://airoicalculator.optimnow.io/";

/** MCP preset keys that differ from the hub's use-case keys the calculator expects. */
const PRESET_TO_HUB_USE_CASE: Record<string, string> = {
  support: "supportTicket",
  invoice: "invoiceProcessing",
};

export function calculatorUrl(inputs: UseCaseInputs, preset?: string): string {
  const url = new URL(CALCULATOR_URL);

  if (preset) {
    url.searchParams.set("useCase", PRESET_TO_HUB_USE_CASE[preset] ?? preset);
  }
  if (inputs.monthlyVolume > 0) {
    url.searchParams.set("volume", String(Math.round(inputs.monthlyVolume)));
  }

  const model = inputs.primaryModel;
  // Only catalog-priced models can be resolved on the other side; a custom or
  // per-call rate has no id to look up, so sending one would be misleading.
  if (model.modelId) {
    url.searchParams.set("model", model.modelId);
  } else if (model.provider && model.modelName && !model.useCallPricing) {
    url.searchParams.set("model", toModelId({ provider: model.provider, model: model.modelName }));
  }
  if (inputs.batchProcessing) {
    url.searchParams.set("batch", "1");
  }

  return url.toString();
}
