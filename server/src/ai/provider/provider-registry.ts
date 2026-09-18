import { createAnthropic, type AnthropicProvider } from "@ai-sdk/anthropic";
import { createOpenAI, type OpenAIProvider, type OpenAIProviderSettings } from "@ai-sdk/openai";
import { createProviderRegistry } from "ai";
import type { AiConfig, ProviderCredentials } from "../../config/config.types.js";
import { AppError } from "../../platform/errors/app-error.js";

/** Provider keys are the one identity allowed to appear literally in this layer. */
export const PROVIDER_OPENAI = "openai";
export const PROVIDER_ANTHROPIC = "anthropic";

/** Separator between provider key and model id inside a registry reference. */
export const REGISTRY_SEPARATOR = ":";

/** `ai` does not re-export `FetchFunction`, so it is derived from a provider's settings. */
export type FetchFunction = NonNullable<OpenAIProviderSettings["fetch"]>;

/**
 * A registered provider instance. The discriminant lets the search layer reach
 * the provider-native tools without widening anything to `any`.
 */
export type LlmProvider =
  | { readonly kind: typeof PROVIDER_OPENAI; readonly instance: OpenAIProvider }
  | { readonly kind: typeof PROVIDER_ANTHROPIC; readonly instance: AnthropicProvider };

type ProviderInstances = Readonly<Record<string, OpenAIProvider | AnthropicProvider>>;

const buildRegistry = (providers: ProviderInstances) =>
  createProviderRegistry(providers, { separator: REGISTRY_SEPARATOR });

/** The `ai` provider registry, typed without naming unexported SDK internals. */
export type ModelRegistry = ReturnType<typeof buildRegistry>;

export interface LlmRegistry {
  readonly registry: ModelRegistry;
  /** Raw instances keyed by the provider id used in configuration. */
  readonly providers: Readonly<Record<string, LlmProvider>>;
}

export interface LlmRegistryDeps {
  readonly fetch?: FetchFunction;
}

function createProviderInstance(
  providerId: string,
  credentials: ProviderCredentials,
  deps: LlmRegistryDeps,
): LlmProvider {
  const settings = {
    apiKey: credentials.apiKey,
    baseURL: credentials.baseURL,
    fetch: deps.fetch,
  };

  switch (providerId) {
    case PROVIDER_OPENAI:
      return { kind: PROVIDER_OPENAI, instance: createOpenAI(settings) };
    case PROVIDER_ANTHROPIC:
      return { kind: PROVIDER_ANTHROPIC, instance: createAnthropic(settings) };
    default:
      throw new AppError("MODEL_UNAVAILABLE", {
        publicMessage: "The configured model provider is not supported by this build.",
        meta: { providerId },
      });
  }
}

/**
 * Registers exactly the providers present in `ai.providers`; a provider only
 * appears there once it is credentialed, so an unregistered provider is
 * indistinguishable from an unavailable one — which is what callers must see.
 */
export function createLlmRegistry(ai: AiConfig, deps: LlmRegistryDeps = {}): LlmRegistry {
  const providers: Record<string, LlmProvider> = {};
  const instances: Record<string, OpenAIProvider | AnthropicProvider> = {};

  for (const [providerId, credentials] of Object.entries(ai.providers)) {
    const provider = createProviderInstance(providerId, credentials, deps);
    providers[providerId] = provider;
    instances[providerId] = provider.instance;
  }

  return { registry: buildRegistry(instances), providers };
}
