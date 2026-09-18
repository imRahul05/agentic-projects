import { UnitSystem } from "../../config/config.types.js";
import { CachePort } from "../../platform/cache/cache.port.js";
import { Clock } from "../../platform/clock.js";
import { Logger } from "../../platform/logging/logger.port.js";
import { Metrics } from "../../platform/metrics/metrics.port.js";
import { WeatherService } from "../../weather/weather.service.types.js";

export type ToolContext = {
  readonly weather: WeatherService;
  readonly cache: CachePort;
  readonly logger?: Logger;
  readonly metrics?: Metrics;
  readonly clock: Clock;
  readonly requestId: string;
  readonly units: UnitSystem;
  readonly locale?: string;
  readonly timezone?: string;
  readonly signal?: AbortSignal;
};
