import { z } from "zod";
import type { ModelSpec } from "./config.types.js";
import { ALL_PROVIDER_IDS, PROVIDER_IDS } from "./ai.constants.js";

/**
 * The model catalog — the single place model identifiers are declared.
 *
 * Aliases are the only model identifier that crosses the wire: the browser asks
 * for `"default"` or `"fast"`, never for a raw model id, and the server maps it
 * here. Swapping to a newer model is a one-line edit in this file, reviewable in
 * a diff, with no change anywhere in the agent, routes or UI.
 *
 * A provider listed here only becomes usable once its API key is present in the
 * environment; an alias pointing at an uncredentialed provider is a startup
 * error rather than a runtime surprise.
 */
export const MODEL_CATALOG = {
  default: {
    provider: PROVIDER_IDS.anthropic,
    model: "claude-sonnet-5",
    label: "Balanced",
    description: "Default weather answers with live web search",
  },
  fast: {
    provider: PROVIDER_IDS.anthropic,
    model: "claude-haiku-4-5-20251001",
    label: "Fast",
    description: "Lowest latency, good for quick checks",
  },
} as const satisfies Readonly<Record<string, ModelSpec>>;

export type ModelAlias = keyof typeof MODEL_CATALOG;

/** Used when the client does not ask for a specific alias. */
export const DEFAULT_MODEL_ALIAS: ModelAlias = "default";

/**
 * Aliases the browser is allowed to choose between. Anything not listed here is
 * unreachable from the client even if it exists in the catalog, which is how a
 * costly model stays server-only.
 */
export const CLIENT_SELECTABLE_ALIASES: readonly ModelAlias[] = ["default", "fast"];

const modelSpecSchema = z.object({
  provider: z.enum([ALL_PROVIDER_IDS[0], ...ALL_PROVIDER_IDS.slice(1)]),
  model: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

const catalogSchema = z.record(modelSpecSchema).refine((catalog) => Object.keys(catalog).length > 0, {
  message: "MODEL_CATALOG must define at least one alias",
});

export interface ModelCatalogIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * Validates the catalog itself — shape, a known provider on every entry, and
 * that the default and client-selectable aliases actually exist. Credential
 * checks live in the config loader, which is the only place that sees the
 * environment.
 */
export function validateModelCatalog(): readonly ModelCatalogIssue[] {
  const issues: ModelCatalogIssue[] = [];

  const parsed = catalogSchema.safeParse(MODEL_CATALOG);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        path: `MODEL_CATALOG.${issue.path.join(".")}`,
        message: issue.message,
      });
    }
    return issues;
  }

  const aliases = Object.keys(MODEL_CATALOG);

  if (!aliases.includes(DEFAULT_MODEL_ALIAS)) {
    issues.push({
      path: "DEFAULT_MODEL_ALIAS",
      message: `"${DEFAULT_MODEL_ALIAS}" is not defined in MODEL_CATALOG (defined: ${aliases.join(", ")})`,
    });
  }

  for (const alias of CLIENT_SELECTABLE_ALIASES) {
    if (!aliases.includes(alias)) {
      issues.push({
        path: "CLIENT_SELECTABLE_ALIASES",
        message: `"${alias}" is not defined in MODEL_CATALOG`,
      });
    }
  }

  return issues;
}

/** The catalog widened to the shared `ModelSpec` record the rest of the app consumes. */
export function getModelCatalog(): Readonly<Record<string, ModelSpec>> {
  return MODEL_CATALOG;
}
