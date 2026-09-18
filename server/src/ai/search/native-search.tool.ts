import type { AnthropicProvider } from "@ai-sdk/anthropic";
import type { OpenAIProvider } from "@ai-sdk/openai";
import type { NativeSearchConfig, SearchUserLocation } from "../../config/config.types.js";
import { AppError } from "../../platform/errors/app-error.js";
import { PROVIDER_ANTHROPIC, PROVIDER_OPENAI, type LlmProvider } from "../provider/provider-registry.js";

/** The single tool name the agent, the prompt and the client all agree on. */
export const WEB_SEARCH_TOOL_NAME = "web_search";

type AnthropicWebSearchFactory = AnthropicProvider["tools"]["webSearch_20250305"];
type AnthropicWebSearchArgs = NonNullable<Parameters<AnthropicWebSearchFactory>[0]>;
export type AnthropicWebSearchTool = ReturnType<AnthropicWebSearchFactory>;

type OpenAIWebSearchFactory = OpenAIProvider["tools"]["webSearch"];
type OpenAIWebSearchArgs = NonNullable<Parameters<OpenAIWebSearchFactory>[0]>;
export type OpenAIWebSearchTool = ReturnType<OpenAIWebSearchFactory>;

export type NativeWebSearchTool = AnthropicWebSearchTool | OpenAIWebSearchTool;

export type NativeSearchToolSet = Readonly<Record<typeof WEB_SEARCH_TOOL_NAME, NativeWebSearchTool>>;

/**
 * Provider tool tables are plain objects keyed by tool id. The id comes from
 * configuration (Anthropic ships dated versions), so the lookup is by string
 * and the result is narrowed rather than indexed statically.
 */
type ProviderToolTable = Readonly<Record<string, unknown>>;

function isAnthropicWebSearchFactory(value: unknown): value is AnthropicWebSearchFactory {
  return typeof value === "function";
}

function isOpenAIWebSearchFactory(value: unknown): value is OpenAIWebSearchFactory {
  return typeof value === "function";
}

function missingTool(providerId: string, toolId: string): AppError {
  return new AppError("SEARCH_UNAVAILABLE", {
    publicMessage: "Web search is not available for the selected model.",
    meta: { providerId, toolId, reason: "native_tool_not_found" },
  });
}

function notConfigured(providerId: string): AppError {
  return new AppError("SEARCH_UNAVAILABLE", {
    publicMessage: "Web search is not available for the selected model.",
    meta: { providerId, reason: "native_tool_id_not_configured" },
  });
}

function toApproximateLocation(
  location: SearchUserLocation | undefined,
): { type: "approximate"; city?: string; region?: string; country?: string; timezone?: string } | undefined {
  if (location === undefined) return undefined;
  return {
    type: "approximate",
    city: location.city,
    region: location.region,
    country: location.country,
    timezone: location.timezone,
  };
}

function toAnthropicArgs(config: NativeSearchConfig): AnthropicWebSearchArgs {
  return {
    maxUses: config.maxUses,
    allowedDomains: config.allowedDomains === undefined ? undefined : [...config.allowedDomains],
    blockedDomains: config.blockedDomains === undefined ? undefined : [...config.blockedDomains],
    userLocation: toApproximateLocation(config.userLocation),
  };
}

function toOpenAIArgs(config: NativeSearchConfig): OpenAIWebSearchArgs {
  const hasDomainFilters = config.allowedDomains !== undefined || config.blockedDomains !== undefined;
  return {
    // OpenAI has no per-conversation search cap; `maxUses` is enforced through
    // the prompt budget and the step cap instead.
    filters: hasDomainFilters
      ? {
          allowedDomains: config.allowedDomains === undefined ? undefined : [...config.allowedDomains],
          blockedDomains: config.blockedDomains === undefined ? undefined : [...config.blockedDomains],
        }
      : undefined,
    userLocation: toApproximateLocation(config.userLocation),
  };
}

/**
 * Builds the provider-executed web-search tool for one provider and registers
 * it under the canonical tool name.
 */
export function createNativeSearchTools(
  provider: LlmProvider,
  providerId: string,
  config: NativeSearchConfig,
): NativeSearchToolSet {
  const toolId = config.toolIdByProvider[providerId];
  if (toolId === undefined || toolId.trim() === "") {
    throw notConfigured(providerId);
  }

  switch (provider.kind) {
    case PROVIDER_ANTHROPIC: {
      const table: ProviderToolTable = provider.instance.tools;
      const factory = table[toolId];
      if (!isAnthropicWebSearchFactory(factory)) throw missingTool(providerId, toolId);
      return { [WEB_SEARCH_TOOL_NAME]: factory(toAnthropicArgs(config)) };
    }
    case PROVIDER_OPENAI: {
      const table: ProviderToolTable = provider.instance.tools;
      const factory = table[toolId];
      if (!isOpenAIWebSearchFactory(factory)) throw missingTool(providerId, toolId);
      return { [WEB_SEARCH_TOOL_NAME]: factory(toOpenAIArgs(config)) };
    }
  }
}
