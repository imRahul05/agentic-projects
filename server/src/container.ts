import { createLlmRegistry, LlmRegistry } from "./ai/provider/provider-registry.js";
import { DefaultModelResolver, ModelResolver } from "./ai/provider/model-resolver.js";
import { AppConfig } from "./config/config.types.js";
import { CachePort } from "./platform/cache/cache.port.js";
import { MemoryCache } from "./platform/cache/memory-cache.js";
import { Clock, SystemClock } from "./platform/clock.js";
import { ConsoleLogger } from "./platform/logging/console-logger.js";
import { Logger } from "./platform/logging/logger.port.js";
import { Metrics } from "./platform/metrics/metrics.port.js";
import { NoopMetrics } from "./platform/metrics/noop-metrics.js";
import { buildProviderCatalog, ProviderCatalog } from "./weather/providers/provider-catalog.js";
import { DefaultWeatherService } from "./weather/weather.service.js";
import { WeatherService } from "./weather/weather.service.types.js";

export interface AppContainer {
  readonly config: AppConfig;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly metrics: Metrics;
  readonly cache: CachePort;
  readonly llmRegistry: LlmRegistry;
  readonly modelResolver: ModelResolver;
  readonly providerCatalog: ProviderCatalog;
  readonly weatherService: WeatherService;
}

export function buildContainer(
  config: AppConfig,
  overrides?: Partial<AppContainer>
): AppContainer {
  const clock = overrides?.clock ?? new SystemClock();
  const logger = overrides?.logger ?? new ConsoleLogger(config.observability.logLevel);
  const metrics = overrides?.metrics ?? new NoopMetrics();
  const cache =
    overrides?.cache ??
    new MemoryCache(config.cache.maxEntries, clock, config.cache.enabled);

  const llmRegistry = overrides?.llmRegistry ?? createLlmRegistry(config.ai);
  const modelResolver =
    overrides?.modelResolver ?? new DefaultModelResolver(llmRegistry, config.ai);

  const providerCatalog =
    overrides?.providerCatalog ?? buildProviderCatalog(config.weather);
  const weatherService =
    overrides?.weatherService ??
    new DefaultWeatherService(providerCatalog, cache, config.weather, logger, metrics);

  return {
    config,
    clock,
    logger,
    metrics,
    cache,
    llmRegistry,
    modelResolver,
    providerCatalog,
    weatherService,
  };
}
