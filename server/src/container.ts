import { createWeatherAgent, type AgentRequest, type CreatedAgent } from "./ai/agent/agent.factory.js";
import { createModelResolver, type ModelResolver } from "./ai/provider/model-resolver.js";
import { createLlmRegistry } from "./ai/provider/provider-registry.js";
import { FakeSearchClient } from "./ai/search/clients/fake.client.js";
import { createTavilySearchClient } from "./ai/search/clients/tavily.client.js";
import type { SearchClient } from "./ai/search/search-client.port.js";
import { createSearchToolFactory, type SearchToolFactory } from "./ai/search/search-tool.factory.js";
import type { AppConfig, ExternalSearchConfig } from "./config/config.types.js";
import { MemoryCache } from "./platform/cache/memory-cache.js";
import type { CachePort } from "./platform/cache/cache.port.js";
import { SystemClock, type Clock } from "./platform/clock.js";
import { ConsoleLogger } from "./platform/logging/console-logger.js";
import type { Logger } from "./platform/logging/logger.port.js";
import { NoopMetrics } from "./platform/metrics/noop-metrics.js";
import type { Metrics } from "./platform/metrics/metrics.port.js";

/**
 * Everything the HTTP layer is allowed to depend on. Handlers receive this and
 * nothing else, so a test can hand them a container of fakes.
 */
export interface Container {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly metrics: Metrics;
  readonly clock: Clock;
  readonly cache: CachePort;
  readonly modelResolver: ModelResolver;
  readonly searchToolFactory: SearchToolFactory;
  /** A fresh agent per request: model choice and locale are per-request inputs. */
  createAgent(req: AgentRequest): CreatedAgent;
}

/**
 * The one client id that is not an HTTP endpoint: it exists so the server can run
 * in `external` search mode with no search credentials at all (tests, local
 * demos). Every other id is served over the configured endpoint.
 */
const OFFLINE_SEARCH_CLIENT_ID = "fake";

function createSearchClient(external: ExternalSearchConfig, logger: Logger): SearchClient {
  if (external.clientId === OFFLINE_SEARCH_CLIENT_ID) {
    return new FakeSearchClient({ id: external.clientId });
  }
  return createTavilySearchClient(external, { logger });
}

/**
 * The one wiring site in the server. Nothing else constructs a dependency, no
 * module holds a singleton, and `process.env` is read only by `loadConfig`.
 */
export function buildContainer(config: AppConfig): Container {
  const clock: Clock = new SystemClock();
  const logger: Logger = new ConsoleLogger(config.observability.logLevel, {
    service: config.observability.serviceName,
    env: config.env,
  });
  const metrics: Metrics = new NoopMetrics();
  const cache: CachePort = new MemoryCache(config.cache.maxEntries, clock, config.cache.enabled);

  const registry = createLlmRegistry(config.ai);
  const modelResolver = createModelResolver(config.ai, registry);
  const searchToolFactory = createSearchToolFactory({
    search: config.search,
    providers: registry.providers,
    // Only built in `external` mode; `native` search runs inside the provider.
    searchClient:
      config.search.external === undefined
        ? undefined
        : createSearchClient(config.search.external, logger),
    cache,
    logger,
  });

  return {
    config,
    logger,
    metrics,
    clock,
    cache,
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
