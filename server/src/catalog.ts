import {
  type CatalogModel,
  type ModelCatalog,
  catalogModelToParams,
  fetchModelCatalog,
  toModelId,
  SNAPSHOT_MODELS,
  SNAPSHOT_DATE,
} from "./lib/modelCatalog.js";
import type { ModelParams } from "./lib/types.js";

/**
 * Live model prices for the MCP server.
 *
 * The shared catalog module caches in localStorage, which does not exist here,
 * so this adds a process-level cache instead: one fetch per hour per instance
 * rather than one per tool call. The hub's own CDN caches for 24h anyway.
 */

const CACHE_TTL_MS = 60 * 60 * 1000;

let cached: { catalog: ModelCatalog; at: number } | null = null;
let inFlight: Promise<ModelCatalog> | null = null;

const SNAPSHOT_FALLBACK: ModelCatalog = {
  models: SNAPSHOT_MODELS,
  source: "snapshot",
  pricedAt: SNAPSHOT_DATE,
};

/**
 * Resolve the catalog, reusing a recent result. Never throws: on any failure the
 * caller gets the embedded snapshot, so a tool call still returns a real answer
 * with prices that are merely older.
 */
export async function getCatalog(): Promise<ModelCatalog> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.catalog;

  // Collapse concurrent calls onto one fetch — tool calls arrive in bursts
  if (!inFlight) {
    inFlight = fetchModelCatalog(true)
      .then((catalog) => {
        cached = { catalog, at: Date.now() };
        return catalog;
      })
      .catch(() => (cached?.catalog ?? SNAPSHOT_FALLBACK))
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}

export interface ModelLookup {
  model: CatalogModel;
  params: Partial<ModelParams>;
  pricedAt: string;
  source: ModelCatalog["source"];
}

/**
 * Find a model by catalog id ("anthropic/claude-haiku-4-5"), by exact name, or by
 * a loose "provider model" match — an assistant rarely knows the slug, and asking
 * it to guess one is a worse failure mode than matching on the name it does know.
 */
export async function findModel(query: string): Promise<ModelLookup | null> {
  const catalog = await getCatalog();
  const needle = query.trim().toLowerCase();
  if (!needle) return null;

  const byId = catalog.models.find((m) => toModelId(m) === needle);
  const byName = byId ?? catalog.models.find((m) => m.model.toLowerCase() === needle);
  const loose =
    byName ??
    catalog.models.find((m) => `${m.provider} ${m.model}`.toLowerCase() === needle) ??
    catalog.models.find((m) => `${m.provider} ${m.model}`.toLowerCase().includes(needle));

  if (!loose) return null;

  return {
    model: loose,
    params: catalogModelToParams(loose, catalog.pricedAt),
    pricedAt: catalog.pricedAt,
    source: catalog.source,
  };
}

/** Cheapest-first shortlist, for "what should I use for this?" questions. */
export async function listModels(limit = 25): Promise<{ models: CatalogModel[]; catalog: ModelCatalog }> {
  const catalog = await getCatalog();
  return { models: catalog.models.slice(0, limit), catalog };
}

/** Human-readable provenance line, so a reported figure carries its price date. */
export const provenance = (catalog: ModelCatalog): string => {
  const label =
    catalog.source === "live"
      ? "live from the AI Pricing Hub"
      : catalog.source === "cache"
        ? "cached from the AI Pricing Hub"
        : "from the embedded snapshot (hub unreachable)";
  return `Prices ${label}, published ${catalog.pricedAt.slice(0, 10)}.`;
};
