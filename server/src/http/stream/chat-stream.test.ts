import type { Server } from "node:http";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { createWeatherAgent, type AgentRequest, type CreatedAgent } from "../../ai/agent/agent.factory.js";
import type { ModelResolver, PublicModelInfo, ResolvedModel } from "../../ai/provider/model-resolver.js";
import { FakeSearchClient } from "../../ai/search/clients/fake.client.js";
import { createExternalSearchTool } from "../../ai/search/external-search.tool.js";
import { WEB_SEARCH_TOOL_NAME } from "../../ai/search/native-search.tool.js";
import type { SearchToolFactory, SearchToolSet } from "../../ai/search/search-tool.factory.js";
import { createApp } from "../../app.js";
import { loadConfig } from "../../config/config.js";
import type { AppConfig, ExternalSearchConfig } from "../../config/config.types.js";
import type { Container } from "../../container.js";
import { MemoryCache } from "../../platform/cache/memory-cache.js";
import { SystemClock } from "../../platform/clock.js";
import type { Logger, LogMeta } from "../../platform/logging/logger.port.js";
import { NoopMetrics } from "../../platform/metrics/noop-metrics.js";

const ANSWER = "It is 18 degrees and clear in Lisbon.";
const SOURCE_URL = "https://weather.example.test/lisbon";
const HISTORY_WINDOW = 4;

const baseConfig: AppConfig = loadConfig({
  NODE_ENV: "test",
  OPENAI_API_KEY: "openai-test-key",
});

/**
 * Agent budgets now live in `config/ai.constants.ts` rather than the
 * environment, so a test that needs a different window overrides the loaded
 * config directly instead of reaching for an env var.
 */
const config: AppConfig = {
  ...baseConfig,
  ai: {
    ...baseConfig.ai,
    agent: {
      ...baseConfig.ai.agent,
      historyWindowMessages: HISTORY_WINDOW,
      maxInputChars: 20_000,
    },
  },
};

const externalSearch: ExternalSearchConfig = {
  clientId: "fixture-client",
  apiKey: "unused-in-tests",
  maxResults: 2,
  timeoutMs: 1000,
  cacheTtlMs: 0,
};

class SilentLogger implements Logger {
  child(_bindings: LogMeta): Logger {
    return this;
  }
  debug(_msg: string, _meta?: LogMeta): void {}
  info(_msg: string, _meta?: LogMeta): void {}
  warn(_msg: string, _meta?: LogMeta): void {}
  error(_msg: string, _meta?: LogMeta): void {}
}

const logger = new SilentLogger();

function searchTools(): SearchToolFactory {
  const tools: SearchToolSet = {
    [WEB_SEARCH_TOOL_NAME]: createExternalSearchTool({
      config: externalSearch,
      context: {
        client: new FakeSearchClient({ id: externalSearch.clientId }),
        cache: new MemoryCache(4),
        logger,
      },
    }),
  };
  return { create: (): SearchToolSet => tools };
}

/** Records the prompt the model was actually handed, then streams a short answer. */
function answeringModel(capturedPrompts: unknown[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    modelId: "mock-model",
    doStream: async (options) => {
      capturedPrompts.push(options.prompt);
      return {
        stream: simulateReadableStream({
          chunkDelayInMs: 0,
          initialDelayInMs: 0,
          chunks: [
            { type: "stream-start" as const, warnings: [] },
            { type: "text-start" as const, id: "t1" },
            { type: "text-delta" as const, id: "t1", delta: ANSWER },
            { type: "text-end" as const, id: "t1" },
            // A citation, as a provider-executed web search emits one.
            {
              type: "source" as const,
              sourceType: "url" as const,
              id: "s1",
              url: SOURCE_URL,
              title: "Lisbon weather",
            },
            {
              type: "finish" as const,
              finishReason: { unified: "stop" as const, raw: undefined },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            },
          ],
        }),
      };
    },
  });
}

function resolver(model: MockLanguageModelV4): ModelResolver {
  const resolved: ResolvedModel = {
    alias: "default",
    providerId: "fixture-provider",
    spec: { provider: "fixture-provider", model: model.modelId, label: "Fixture" },
    model,
  };
  return {
    resolve: (): ResolvedModel => resolved,
    listSelectable: (): readonly PublicModelInfo[] => [],
  };
}

function container(model: MockLanguageModelV4): Container {
  const clock = new SystemClock();
  const modelResolver = resolver(model);
  const searchToolFactory = searchTools();

  return {
    config,
    logger,
    metrics: new NoopMetrics(),
    clock,
    cache: new MemoryCache(config.cache.maxEntries, clock, config.cache.enabled),
    modelResolver,
    searchToolFactory,
    createAgent(req: AgentRequest): CreatedAgent {
      return createWeatherAgent(
        {
          modelResolver,
          searchTools: searchToolFactory,
          agentConfig: config.ai.agent,
          logger,
          clock,
        },
        req,
      );
    },
  };
}

let server: Server | undefined;

async function start(model: MockLanguageModelV4): Promise<string> {
  const app = createApp(container(model));
  const started = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  server = started;
  const address = started.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return `http://127.0.0.1:${port}${config.http.basePath}/chat`;
}

afterEach(async () => {
  const running = server;
  server = undefined;
  if (running === undefined) return;
  await new Promise<void>((resolve, reject) => {
    running.close((error) => (error === undefined ? resolve() : reject(error)));
  });
});

function userMessage(id: string, text: string): unknown {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistantMessage(id: string, text: string): unknown {
  return { id, role: "assistant", parts: [{ type: "text", text }] };
}

/**
 * An assistant turn holding a completed web search, including the field a native
 * provider search requires back verbatim on the next turn.
 */
function searchMessage(id: string, encryptedContent: string): unknown {
  return {
    id,
    role: "assistant",
    parts: [
      {
        type: `tool-${WEB_SEARCH_TOOL_NAME}`,
        toolCallId: "call-1",
        state: "output-available",
        input: { query: "lisbon weather" },
        output: {
          query: "lisbon weather",
          hits: [
            {
              title: "Lisbon weather",
              url: "https://weather.example.test/lisbon",
              snippet: "18C and clear",
              encryptedContent,
            },
          ],
        },
      },
    ],
  };
}

async function postChat(url: string, messages: readonly unknown[]): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
  });
}

describe("chat stream", () => {
  it("streams a UI message stream with the protocol headers", async () => {
    const url = await start(answeringModel([]));
    const response = await postChat(url, [userMessage("m1", "weather in Lisbon?")]);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(response.headers.get("x-request-id")).not.toBeNull();
    expect(body).toContain("text-delta");
    expect(body).toContain(ANSWER);
    expect(body).toContain("[DONE]");
  });

  it("emits normalized source-url parts so one UI renders every provider's citations", async () => {
    const url = await start(answeringModel([]));
    const body = await (await postChat(url, [userMessage("m1", "weather?")])).text();

    // Without `sendSources: true` the provider's citations never reach the client.
    expect(body).toContain('"type":"source-url"');
    expect(body).toContain(SOURCE_URL);
  });

  it("attaches the model, provider, search count and duration as message metadata", async () => {
    const url = await start(answeringModel([]));
    const body = await (await postChat(url, [userMessage("m1", "weather?")])).text();

    expect(body).toContain('"messageMetadata"');
    expect(body).toContain('"modelAlias":"default"');
    expect(body).toContain('"providerId":"fixture-provider"');
    expect(body).toContain('"searchCount":0');
    expect(body).toContain('"durationMs"');
  });

  it("windows the history to the configured number of messages", async () => {
    const prompts: unknown[] = [];
    const url = await start(answeringModel(prompts));

    const messages = [
      userMessage("m1", "oldest question"),
      assistantMessage("m2", "oldest answer"),
      userMessage("m3", "middle question"),
      assistantMessage("m4", "middle answer"),
      userMessage("m5", "newest question"),
    ];
    const response = await postChat(url, messages);
    await response.text();

    expect(response.status).toBe(200);
    const prompt = JSON.stringify(prompts[0]);
    expect(prompt).toContain("newest question");
    expect(prompt).not.toContain("oldest question");
    expect(prompt).not.toContain("oldest answer");
  });

  it("replays a tool result's provider-required fields unmodified", async () => {
    const prompts: unknown[] = [];
    const url = await start(answeringModel(prompts));

    const response = await postChat(url, [
      userMessage("m1", "weather in Lisbon?"),
      searchMessage("m2", "opaque-provider-blob"),
      userMessage("m3", "and tomorrow?"),
    ]);
    await response.text();

    expect(response.status).toBe(200);
    // The tool part survived windowing and conversion byte for byte.
    expect(JSON.stringify(prompts[0])).toContain("opaque-provider-blob");
  });

  it("rejects an invalid message list before the model is called", async () => {
    const prompts: unknown[] = [];
    const url = await start(answeringModel(prompts));

    const response = await postChat(url, [{ role: "user", parts: "not-an-array" }]);
    const body: unknown = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(prompts).toHaveLength(0);
  });

  it("stops the agent when the client hangs up", async () => {
    const prompts: unknown[] = [];
    const url = await start(answeringModel(prompts));

    const abort = new AbortController();
    const pending = fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [userMessage("m1", "weather?")] }),
      signal: abort.signal,
    });
    abort.abort();

    await expect(pending).rejects.toThrow();
    // The server must survive a cancelled stream and keep serving.
    const next = await postChat(url, [userMessage("m2", "weather?")]);
    expect(next.status).toBe(200);
    await next.text();
  });
});
