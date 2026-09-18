import type { LanguageModel } from "ai";
import type { AiConfig, ModelSpec } from "../../config/config.types.js";
import { AppError } from "../../platform/errors/app-error.js";
import { REGISTRY_SEPARATOR, type LlmRegistry } from "./provider-registry.js";

export interface ResolvedModel {
  readonly alias: string;
  readonly providerId: string;
  readonly spec: ModelSpec;
  readonly model: LanguageModel;
}

/** Everything the client is allowed to learn about a model. Never a model id. */
export interface PublicModelInfo {
  readonly alias: string;
  readonly label: string;
  readonly providerId: string;
  readonly description?: string;
}

export interface ModelResolver {
  /** `undefined` resolves the configured default alias. */
  resolve(alias?: string): ResolvedModel;
  listSelectable(): readonly PublicModelInfo[];
}

const UNAVAILABLE_MESSAGE = "The requested model is not available.";

export function createModelResolver(ai: AiConfig, registry: LlmRegistry): ModelResolver {
  function resolve(alias?: string): ResolvedModel {
    const requested = alias ?? ai.defaultAlias;
    const spec = ai.modelAliases[requested];

    if (spec === undefined) {
      throw new AppError("MODEL_UNAVAILABLE", {
        publicMessage: UNAVAILABLE_MESSAGE,
        meta: { alias: requested, reason: "unknown_alias" },
      });
    }

    if (registry.providers[spec.provider] === undefined) {
      throw new AppError("MODEL_UNAVAILABLE", {
        publicMessage: UNAVAILABLE_MESSAGE,
        meta: { alias: requested, reason: "provider_not_registered" },
      });
    }

    const modelRef: `${string}${typeof REGISTRY_SEPARATOR}${string}` = `${spec.provider}${REGISTRY_SEPARATOR}${spec.model}`;

    try {
      return {
        alias: requested,
        providerId: spec.provider,
        spec,
        model: registry.registry.languageModel(modelRef),
      };
    } catch (error) {
      // Never substitute a different model: a silent swap makes answers
      // unattributable and hides a broken deployment.
      throw AppError.from(error, {
        code: "MODEL_UNAVAILABLE",
        publicMessage: UNAVAILABLE_MESSAGE,
        meta: { alias: requested, reason: "registry_rejected" },
      });
    }
  }

  function listSelectable(): readonly PublicModelInfo[] {
    const infos: PublicModelInfo[] = [];

    for (const alias of ai.clientSelectableAliases) {
      const spec = ai.modelAliases[alias];
      if (spec === undefined) continue;
      infos.push({
        alias,
        label: spec.label,
        providerId: spec.provider,
        description: spec.description,
      });
    }

    return infos;
  }

  return { resolve, listSelectable };
}
