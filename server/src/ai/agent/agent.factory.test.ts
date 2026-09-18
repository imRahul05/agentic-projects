import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import type { AgentConfig, ExternalSearchConfig } from "../../config/config.types.js";
import { MemoryCache } from "../../platform/cache/memory-cache.js";
import { SystemClock } from "../../platform/clock.js";
import type { Logger } from "../../platform/logging/logger.port.js";
import type { ModelResolver, ResolvedModel } from "../provider/model-resolver.js";
import { FakeSearchClient } from "../search/clients/fake.client.js";
import { createExternalSearchTool } from "../search/external-search.tool.js";
import { WEB_SEARCH_TOOL_NAME } from "../search/native-search.tool.js";
import type { SearchToolFactory, SearchToolSet } from "../search/search-tool.factory.js";
import { createWeatherAgent } from "./agent.factory.js";

const MAX_STEPS = 2;

const agentConfig: AgentConfig = {
  maxSteps: MAX_STEPS,
  maxSearches: 2,
  totalTimeoutMs: 30_000,
  stepTimeoutMs: 10_000,
  maxOutputTokens: 256,
  historyWindowMessages: 10,
  maxInputChars: 2_000,
};

const searchConfig: ExternalSearchConfig = {
  clientId: "fixture-client",
  apiKey: "unused-in-tests",
  maxResults: 2,
  timeoutMs: 1_000,
  cacheTtlMs: 0,
};

function stubLogger(): Logger {
  const logger: Logger = {
    child: () => logger,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  return logger;
}

function stubSearchTools(): SearchToolFactory {
  const tools: SearchToolSet = {
    [WEB_SEARCH_TOOL_NAME]: createExternalSearchTool({
      config: searchConfig,
      context: {
        client: new FakeSearchClient({ id: searchConfig.clientId }),
        cache: new MemoryCache(4),
        logger: stubLogger(),
      },
    }),
  };
  return { create: () => tools };
}

/** Always answers with the same tool call, so only the step cap can end the loop. */
function loopingModel(): MockLanguageModelV4 {
  let calls = 0;
  return new MockLanguageModelV4({
    modelId: "mock-model",
    doGenerate: async () => {
      calls += 1;
      return {
        content: [
          {
            type: "tool-call" as const,
            toolCallId: `call-${calls}`,
            toolName: WEB_SEARCH_TOOL_NAME,
            input: JSON.stringify({ query: "Berlin weather 2026-03-14" }),
          },
        ],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}

function stubResolver(model: MockLanguageModelV4): ModelResolver {
  const resolved: ResolvedModel = {
    alias: "fixture-alias",
    providerId: "fixture-provider",
    spec: { provider: "fixture-provider", model: model.modelId, label: "Fixture" },
    model,
  };
  return { resolve: () => resolved, listSelectable: () => [] };
}

function deps(model: MockLanguageModelV4) {
  return {
    modelResolver: stubResolver(model),
    searchTools: stubSearchTools(),
    agentConfig,
    logger: stubLogger(),
    clock: new SystemClock(),
  };
}

describe("createWeatherAgent", () => {
  it("builds an agent with exactly one web_search tool", () => {
    const created = createWeatherAgent(deps(loopingModel()), { locale: "en-US" });

    expect(Object.keys(created.agent.tools)).toEqual([WEB_SEARCH_TOOL_NAME]);
    expect(created.resolved.alias).toBe("fixture-alias");
    expect(created.resolved.providerId).toBe("fixture-provider");
  });

  it("stops a scripted tool loop at the configured step cap", async () => {
    const created = createWeatherAgent(deps(loopingModel()), {
      locale: "en-US",
      timezone: "Europe/Berlin",
    });

    const result = await created.agent.generate({ prompt: "What is the weather in Berlin today?" });

    expect(result.steps).toHaveLength(MAX_STEPS);
  });
});
