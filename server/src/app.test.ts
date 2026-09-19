import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentRequest, CreatedAgent } from "./ai/agent/agent.factory.js";
import type { ModelResolver, PublicModelInfo } from "./ai/provider/model-resolver.js";
import type { SearchToolFactory, SearchToolSet } from "./ai/search/search-tool.factory.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config/config.js";
import type { AppConfig } from "./config/config.types.js";
import type { Container } from "./container.js";
import { MemoryCache } from "./platform/cache/memory-cache.js";
import { SystemClock } from "./platform/clock.js";
import type { Logger, LogMeta } from "./platform/logging/logger.port.js";
import { NoopMetrics } from "./platform/metrics/noop-metrics.js";

const PROVIDER_SECRET = "anthropic-test-key";

const testEnv: Readonly<Record<string, string>> = {
  NODE_ENV: "test",
  OPENAI_API_KEY: PROVIDER_SECRET,
  AI_MODEL_ALIASES: JSON.stringify({
    default: { provider: "anthropic", model: "test-model-a", label: "Balanced", description: "d" },
  }),
  AI_DEFAULT_MODEL_ALIAS: "default",
  SEARCH_NATIVE_TOOL_IDS: JSON.stringify({ anthropic: "webSearch_test" }),
  AGENT_MAX_INPUT_CHARS: "500",
  CORS_ORIGINS: "http://localhost:3000",
};

/** Silent logger: a passing test should not print. */
class SilentLogger implements Logger {
  child(_bindings: LogMeta): Logger {
    return this;
  }
  debug(_msg: string, _meta?: LogMeta): void {}
  info(_msg: string, _meta?: LogMeta): void {}
  warn(_msg: string, _meta?: LogMeta): void {}
  error(_msg: string, _meta?: LogMeta): void {}
}

const selectableModels: readonly PublicModelInfo[] = [
  { alias: "default", label: "Balanced", providerId: "anthropic", description: "d" },
];

/**
 * A container of fakes. The agent factory deliberately throws — and throws
 * something full of secrets — so the error path can be checked without ever
 * reaching a provider.
 */
function fakeContainer(config: AppConfig): Container {
  const clock = new SystemClock();
  const modelResolver: ModelResolver = {
    resolve(): never {
      throw new Error("model resolution is not exercised in this test");
    },
    listSelectable(): readonly PublicModelInfo[] {
      return selectableModels;
    },
  };
  const searchToolFactory: SearchToolFactory = {
    create(): SearchToolSet {
      throw new Error("search tools are not exercised in this test");
    },
  };

  return {
    config,
    logger: new SilentLogger(),
    metrics: new NoopMetrics(),
    clock,
    cache: new MemoryCache(config.cache.maxEntries, clock, config.cache.enabled),
    modelResolver,
    searchToolFactory,
    createAgent(_req: AgentRequest): CreatedAgent {
      throw new Error(
        `upstream refused: POST https://api.anthropic.test/v1/messages api-key=${PROVIDER_SECRET}`,
      );
    },
  };
}

const config = loadConfig(testEnv);
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createApp(fakeContainer(config));
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
});

function chatBody(text: string): string {
  return JSON.stringify({
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text }] }],
  });
}

async function postChat(body: string): Promise<Response> {
  return fetch(`${baseUrl}${config.http.basePath}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("createApp", () => {
  it("constructs without throwing and without listening", () => {
    expect(() => createApp(fakeContainer(config))).not.toThrow();
  });

  it("serves liveness without touching an upstream", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", service: config.observability.serviceName });
  });

  it("reports readiness from configuration alone", async () => {
    const response = await fetch(`${baseUrl}/readyz`);
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ready",
      providers: ["openai"],
      search: { mode: "native", ok: true },
    });
  });

  it("publishes capabilities without any secret", async () => {
    const response = await fetch(`${baseUrl}${config.http.basePath}/capabilities`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({
      models: selectableModels,
      search: { mode: "native", maxSearches: config.ai.agent.maxSearches },
      limits: {
        maxSteps: config.ai.agent.maxSteps,
        maxInputChars: config.ai.agent.maxInputChars,
      },
      defaultLocale: config.chat.defaultLocale,
    });
    expect(text).not.toContain(PROVIDER_SECRET);
    // The provider-native model id must never reach the client.
    expect(text).not.toContain("test-model-a");
  });

  it("echoes a sane inbound request id and generates one otherwise", async () => {
    const withId = await fetch(`${baseUrl}/healthz`, {
      headers: { "x-request-id": "trace-abc-123" },
    });
    expect(withId.headers.get("x-request-id")).toBe("trace-abc-123");

    const withJunk = await fetch(`${baseUrl}/healthz`, { headers: { "x-request-id": "no" } });
    expect(withJunk.headers.get("x-request-id")).not.toBe("no");
    expect(withJunk.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("answers an unknown path with the error envelope", async () => {
    const response = await fetch(`${baseUrl}/nope`);
    const body: unknown = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({ error: { message: "Not found." } });
  });

  it("allows a configured origin and exposes the stream headers", async () => {
    const response = await fetch(`${baseUrl}${config.http.basePath}/chat`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "x-vercel-ai-ui-message-stream",
    );
  });

  it("does not allow an unconfigured origin", async () => {
    const response = await fetch(`${baseUrl}/healthz`, {
      headers: { origin: "http://evil.test" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects a history over the configured input budget with 422", async () => {
    const response = await postChat(chatBody("x".repeat(config.ai.agent.maxInputChars + 1)));
    const body: unknown = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects a malformed body with 422 and field errors", async () => {
    const response = await postChat(JSON.stringify({ messages: [] }));
    const body: unknown = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(JSON.stringify(body)).toContain("messages");
  });

  it("rejects messages the AI SDK cannot validate before any model call", async () => {
    const response = await postChat(JSON.stringify({ messages: [{ role: "nope" }] }));
    const body: unknown = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("masks provider detail out of a failure", async () => {
    const response = await postChat(chatBody("weather in Lisbon?"));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toMatchObject({
      error: { code: "INTERNAL_ERROR", message: "An internal server error occurred." },
    });
    expect(text).not.toContain(PROVIDER_SECRET);
    expect(text).not.toContain("api.anthropic.test");
    expect(text).not.toContain("anthropic");
    expect(text).not.toContain("stack");
  });

  it("rejects a body over the configured size limit", async () => {
    const response = await postChat(
      JSON.stringify({ messages: [{ role: "user", text: "x".repeat(config.http.bodyLimitBytes) }] }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
