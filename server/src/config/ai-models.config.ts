import type { ModelSpec } from "./config.types.js";
import { PROVIDER_IDS, type ProviderId } from "./ai.constants.js";

/**
 * ── THE ONLY PLACE MODELS ARE DECLARED ───────────────────────────────────────
 *
 * One line per model: the model id on the left, the label the UI shows on the
 * right. The provider is inferred from the id, so a model name is written
 * exactly once in the whole codebase.
 *
 * To add a model: add a line. To change the default: edit DEFAULT_MODEL.
 * Model ids must be ones the installed provider SDK accepts.
 */
export const MODELS = {
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-5.6": "GPT-5.6",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.5": "GPT-5.5",
  "claude-sonnet-5": "Claude Sonnet 5",
} as const;

export type ModelId = keyof typeof MODELS;

/** Used whenever the client does not ask for a specific model. */
export const DEFAULT_MODEL: ModelId = "gpt-5.6-sol";

/**
 * Infers the provider from the model id. Keeping this a prefix rule is what
 * lets the table above stay one line per model.
 */
export function providerForModel(modelId: string): ProviderId | undefined {
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) {
    return PROVIDER_IDS.openai;
  }
  if (modelId.startsWith("claude-")) {
    return PROVIDER_IDS.anthropic;
  }
  return undefined;
}

export const ALL_MODEL_IDS: readonly ModelId[] = Object.keys(MODELS) as readonly ModelId[];

export interface ModelCatalogIssue {
  readonly path: string;
  readonly message: string;
}

/** Shape checks that do not depend on the environment. */
export function validateModelCatalog(): readonly ModelCatalogIssue[] {
  const issues: ModelCatalogIssue[] = [];

  if (ALL_MODEL_IDS.length === 0) {
    issues.push({ path: "MODELS", message: "at least one model must be declared" });
    return issues;
  }

  for (const modelId of ALL_MODEL_IDS) {
    if (providerForModel(modelId) === undefined) {
      issues.push({
        path: `MODELS.${modelId}`,
        message: `cannot infer a provider from "${modelId}" — extend providerForModel() for this family`,
      });
    }
    if (MODELS[modelId].trim().length === 0) {
      issues.push({ path: `MODELS.${modelId}`, message: "label must not be empty" });
    }
  }

  if (!ALL_MODEL_IDS.includes(DEFAULT_MODEL)) {
    issues.push({
      path: "DEFAULT_MODEL",
      message: `"${DEFAULT_MODEL}" is not declared in MODELS (declared: ${ALL_MODEL_IDS.join(", ")})`,
    });
  }

  return issues;
}

/**
 * The catalog, limited to models whose provider has credentials in this
 * environment. A multi-provider table is normal, and running with only one key
 * should simply offer fewer models rather than refuse to boot.
 */
export function getModelCatalog(
  credentialedProviders: ReadonlySet<ProviderId>,
): Readonly<Record<string, ModelSpec>> {
  const catalog: Record<string, ModelSpec> = {};

  for (const modelId of ALL_MODEL_IDS) {
    const provider = providerForModel(modelId);
    if (provider === undefined || !credentialedProviders.has(provider)) continue;
    catalog[modelId] = { provider, model: modelId, label: MODELS[modelId] };
  }

  return catalog;
}
