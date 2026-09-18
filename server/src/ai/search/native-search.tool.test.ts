import { describe, expect, it } from "vitest";
import type { AiConfig, NativeSearchConfig } from "../../config/config.types.js";
import { AppError } from "../../platform/errors/app-error.js";
import { createLlmRegistry } from "../provider/provider-registry.js";
import { createNativeSearchTools, WEB_SEARCH_TOOL_NAME } from "./native-search.tool.js";

const ai: AiConfig = {
  providers: {
    openai: { apiKey: "sk-test-openai" },
    anthropic: { apiKey: "sk-test-anthropic" },
  },
  modelAliases: {},
  defaultAlias: "unused",
  clientSelectableAliases: [],
  agent: {
    maxSteps: 2,
    maxSearches: 2,
    totalTimeoutMs: 30_000,
    stepTimeoutMs: 10_000,
    maxOutputTokens: 256,
    historyWindowMessages: 10,
    maxInputChars: 2_000,
  },
};

const nativeConfig: NativeSearchConfig = {
  // Tool ids live in configuration, exactly as a deployment would supply them.
  toolIdByProvider: { openai: "webSearch", anthropic: "webSearch_20250305" },
  maxUses: 3,
  allowedDomains: ["example.invalid"],
  userLocation: { city: "Berlin", country: "DE", timezone: "Europe/Berlin" },
};

function providers() {
  return createLlmRegistry(ai).providers;
}

function providerOrFail(id: string) {
  const provider = providers()[id];
  if (provider === undefined) throw new Error(`test setup: provider ${id} missing`);
  return provider;
}

describe("createNativeSearchTools", () => {
  it("builds the configured provider-executed tool for each provider", () => {
    for (const providerId of ["openai", "anthropic"]) {
      const tools = createNativeSearchTools(providerOrFail(providerId), providerId, nativeConfig);

      expect(Object.keys(tools)).toEqual([WEB_SEARCH_TOOL_NAME]);
      expect(tools[WEB_SEARCH_TOOL_NAME]).toBeDefined();
    }
  });

  it("fails loudly when the configured tool id is not on the provider", () => {
    const broken: NativeSearchConfig = {
      ...nativeConfig,
      toolIdByProvider: { anthropic: "webSearch_19990101" },
    };

    try {
      createNativeSearchTools(providerOrFail("anthropic"), "anthropic", broken);
      expect.unreachable("expected a SEARCH_UNAVAILABLE error");
    } catch (error) {
      expect(AppError.isAppError(error) ? error.code : error).toBe("SEARCH_UNAVAILABLE");
    }
  });

  it("fails when no tool id is configured for the provider", () => {
    const broken: NativeSearchConfig = { ...nativeConfig, toolIdByProvider: {} };

    try {
      createNativeSearchTools(providerOrFail("openai"), "openai", broken);
      expect.unreachable("expected a SEARCH_UNAVAILABLE error");
    } catch (error) {
      expect(AppError.isAppError(error) ? error.code : error).toBe("SEARCH_UNAVAILABLE");
    }
  });
});
