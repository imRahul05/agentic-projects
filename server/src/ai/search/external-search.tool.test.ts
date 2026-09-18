import { describe, expect, it } from "vitest";
import type { ExternalSearchConfig } from "../../config/config.types.js";
import { MemoryCache } from "../../platform/cache/memory-cache.js";
import { AppError } from "../../platform/errors/app-error.js";
import type { Logger } from "../../platform/logging/logger.port.js";
import { FakeSearchClient } from "./clients/fake.client.js";
import { runExternalSearch, type ExternalSearchToolContext } from "./external-search.tool.js";
import type { SearchHit } from "./search-client.port.js";

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

const config: ExternalSearchConfig = {
  clientId: "fixture-client",
  apiKey: "unused-in-tests",
  maxResults: 3,
  timeoutMs: 1_000,
  cacheTtlMs: 60_000,
};

const berlinHits: readonly SearchHit[] = [
  {
    title: "Berlin weather 14 March 2026",
    url: "https://example.invalid/berlin",
    snippet: "9 C and light rain at 10:00 local time.",
    publishedAt: "2026-03-14T09:00:00Z",
  },
  {
    title: "Berlin hourly forecast",
    url: "https://example.invalid/berlin-hourly",
    snippet: "Rain easing after 14:00.",
  },
];

function contextWith(client: FakeSearchClient): ExternalSearchToolContext {
  return { client, cache: new MemoryCache(10), logger: stubLogger() };
}

describe("runExternalSearch", () => {
  it("returns hits with metadata on the happy path", async () => {
    const client = new FakeSearchClient({
      id: config.clientId,
      fixtures: { berlin: berlinHits },
    });

    const result = await runExternalSearch(
      { query: "Berlin weather 2026-03-14" },
      contextWith(client),
      config,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hits).toHaveLength(2);
    expect(result.meta).toEqual({ count: 2, cached: false, clientId: config.clientId });
  });

  it("treats no results as a successful empty answer", async () => {
    const client = new FakeSearchClient({ id: config.clientId, fixtures: { berlin: berlinHits } });

    const result = await runExternalSearch(
      { query: "Nowhereville weather 2026-03-14" },
      contextWith(client),
      config,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hits).toEqual([]);
    expect(result.meta.count).toBe(0);
  });

  it("reports a client failure as a readable envelope rather than throwing", async () => {
    const client = new FakeSearchClient({
      id: config.clientId,
      failWith: new AppError("SEARCH_UNAVAILABLE", { publicMessage: "upstream down" }),
    });

    const result = await runExternalSearch(
      { query: "Berlin weather 2026-03-14" },
      contextWith(client),
      config,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("SEARCH_UNAVAILABLE");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("serves a repeated query from cache without calling the client again", async () => {
    const client = new FakeSearchClient({ id: config.clientId, fixtures: { berlin: berlinHits } });
    const context = contextWith(client);

    const first = await runExternalSearch({ query: "Berlin weather 2026-03-14" }, context, config);
    const second = await runExternalSearch(
      { query: "  BERLIN   weather 2026-03-14 " },
      context,
      config,
    );

    expect(client.calls).toBe(1);
    expect(first.ok && first.meta.cached).toBe(false);
    expect(second.ok && second.meta.cached).toBe(true);
  });

  it("bypasses the cache when the ttl is zero", async () => {
    const client = new FakeSearchClient({ id: config.clientId, fixtures: { berlin: berlinHits } });
    const context = contextWith(client);
    const uncached: ExternalSearchConfig = { ...config, cacheTtlMs: 0 };

    await runExternalSearch({ query: "Berlin weather 2026-03-14" }, context, uncached);
    await runExternalSearch({ query: "Berlin weather 2026-03-14" }, context, uncached);

    expect(client.calls).toBe(2);
  });

  it("propagates an aborted request instead of masking it as a search outage", async () => {
    const client = new FakeSearchClient({ id: config.clientId, fixtures: { berlin: berlinHits } });
    const controller = new AbortController();
    controller.abort();

    await expect(
      runExternalSearch({ query: "Berlin weather 2026-03-14" }, contextWith(client), config, {
        abortSignal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
