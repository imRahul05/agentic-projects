import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createProviderRegistry, LanguageModel } from "ai";
import { MockLanguageModelV4, MockProviderV4 } from "ai/test";
import { AiConfig } from "../../config/config.types.js";

export function createLlmRegistry(config: AiConfig) {
  const providers: Record<string, ReturnType<typeof createOpenAI> | ReturnType<typeof createAnthropic> | MockProviderV4> = {};

  if (config.providers.openai?.apiKey) {
    providers.openai = createOpenAI({
      apiKey: config.providers.openai.apiKey,
      baseURL: config.providers.openai.baseURL,
    });
  }

  if (config.providers.anthropic?.apiKey) {
    providers.anthropic = createAnthropic({
      apiKey: config.providers.anthropic.apiKey,
      baseURL: config.providers.anthropic.baseURL,
    });
  }

  // Register mock provider for offline testing and keyless running
  providers.mock = new MockProviderV4({
    languageModels: {
      "mock-model": new MockLanguageModelV4(),
    },
  });

  return createProviderRegistry(providers, { separator: ":" });
}

export type LlmRegistry = ReturnType<typeof createLlmRegistry>;
