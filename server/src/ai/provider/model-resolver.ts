import { LanguageModel } from "ai";
import { AiConfig, ModelSpec } from "../../config/config.types.js";
import { AppError } from "../../platform/errors/app-error.js";
import { LlmRegistry } from "./provider-registry.js";

export interface PublicModelInfo {
  readonly alias: string;
  readonly label: string;
  readonly providerId: string;
  readonly description?: string;
}

export interface ResolvedModel {
  readonly model: LanguageModel;
  readonly spec: ModelSpec;
}

export interface ModelResolver {
  resolve(alias?: string): ResolvedModel;
  listSelectable(): readonly PublicModelInfo[];
}

export class DefaultModelResolver implements ModelResolver {
  constructor(
    private readonly registry: LlmRegistry,
    private readonly config: AiConfig
  ) {}

  resolve(alias?: string): ResolvedModel {
    const chosenAlias = alias || this.config.defaultAlias;

    if (!this.config.clientSelectableAliases.includes(chosenAlias)) {
      throw new AppError("MODEL_UNAVAILABLE", {
        status: 422,
        publicMessage: `Model alias "${chosenAlias}" is not selectable or allowed.`,
        meta: { alias: chosenAlias },
      });
    }

    const spec = this.config.modelAliases[chosenAlias];
    if (!spec) {
      throw new AppError("MODEL_UNAVAILABLE", {
        status: 422,
        publicMessage: `Unknown model alias "${chosenAlias}".`,
        meta: { alias: chosenAlias },
      });
    }

    // Check if provider credentials exist (unless mock)
    if (spec.provider !== "mock" && !this.config.providers[spec.provider]?.apiKey) {
      // If requested provider has no key, fallback to mock if available
      const mockSpec: ModelSpec = {
        provider: "mock",
        model: "mock-model",
        label: `${spec.label} (Mock Mode)`,
        description: "Provider key not set, operating in mock mode",
      };
      try {
        const mockModel = this.registry.languageModel("mock:mock-model");
        return { model: mockModel, spec: mockSpec };
      } catch {
        throw new AppError("MODEL_UNAVAILABLE", {
          status: 503,
          publicMessage: `Provider "${spec.provider}" is not configured and mock fallback failed.`,
          meta: { provider: spec.provider },
        });
      }
    }

    const modelRef: `${string}:${string}` = `${spec.provider}:${spec.model}`;
    try {
      const model = this.registry.languageModel(modelRef);
      return { model, spec };
    } catch (err: Error | unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      throw new AppError("MODEL_UNAVAILABLE", {
        status: 503,
        publicMessage: `Failed to resolve model ${modelRef}: ${e.message}`,
        meta: { modelRef },
      });
    }
  }

  listSelectable(): readonly PublicModelInfo[] {
    const results: PublicModelInfo[] = [];
    for (const alias of this.config.clientSelectableAliases) {
      const spec = this.config.modelAliases[alias];
      if (spec) {
        results.push({
          alias,
          label: spec.label,
          providerId: spec.provider,
          description: spec.description,
        });
      }
    }
    return results;
  }
}
