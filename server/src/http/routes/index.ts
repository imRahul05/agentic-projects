import { Router } from "express";
import { ModelResolver } from "../../ai/provider/model-resolver.js";
import { AppConfig } from "../../config/config.types.js";
import { CachePort } from "../../platform/cache/cache.port.js";
import { Clock } from "../../platform/clock.js";
import { Logger } from "../../platform/logging/logger.port.js";
import { Metrics } from "../../platform/metrics/metrics.port.js";
import { WeatherService } from "../../weather/weather.service.types.js";
import { createRateLimiters } from "../middleware/rate-limit.js";
import { createCapabilitiesRouter } from "./capabilities.route.js";
import { createChatRouter } from "./chat.route.js";
import { createGeocodeRouter } from "./geocode.route.js";
import { createHealthRouter } from "./health.route.js";
import { createWeatherRouter } from "./weather.route.js";

export interface AppRouterDeps {
  readonly config: AppConfig;
  readonly weatherService: WeatherService;
  readonly modelResolver: ModelResolver;
  readonly cache: CachePort;
  readonly clock: Clock;
  readonly logger?: Logger;
  readonly metrics?: Metrics;
}

export function createAppRouter(deps: AppRouterDeps): Router {
  const router = Router();
  const rateLimiters = createRateLimiters(deps.config.rateLimit);

  // Health routes
  const healthRouter = createHealthRouter({ weatherService: deps.weatherService });
  router.use(healthRouter);

  // API router
  const apiRouter = Router();

  apiRouter.use(
    createChatRouter({
      weatherService: deps.weatherService,
      modelResolver: deps.modelResolver,
      aiConfig: deps.config.ai,
      cache: deps.cache,
      clock: deps.clock,
      logger: deps.logger,
      metrics: deps.metrics,
      rateLimiter: rateLimiters.chatRateLimiter,
    })
  );

  apiRouter.use(
    createWeatherRouter({
      weatherService: deps.weatherService,
      rateLimiter: rateLimiters.readRateLimiter,
    })
  );

  apiRouter.use(
    createGeocodeRouter({
      weatherService: deps.weatherService,
      rateLimiter: rateLimiters.readRateLimiter,
    })
  );

  apiRouter.use(
    createCapabilitiesRouter({
      modelResolver: deps.modelResolver,
      weatherService: deps.weatherService,
      config: deps.config,
    })
  );

  router.use(deps.config.http.basePath, apiRouter);

  return router;
}
