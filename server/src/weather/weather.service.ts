import { UnitSystem, WeatherCapability, WeatherConfig } from "../config/config.types.js";
import { CachePort } from "../platform/cache/cache.port.js";
import { Logger } from "../platform/logging/logger.port.js";
import { Metrics } from "../platform/metrics/metrics.port.js";
import {
  isCoordinatesInput,
  isLocationRef,
  LocationInput,
  LocationRef,
} from "./domain/location.types.js";
import {
  CurrentConditions,
  Forecast,
  LocationComparisonItem,
  WeatherComparison,
  WeatherProviderError,
} from "./domain/weather.types.js";
import { CallContext } from "./ports/call-context.js";
import { CurrentOptions } from "./ports/conditions.port.js";
import { ForecastOptions } from "./ports/forecast.port.js";
import { GeocodeQuery } from "./ports/geocoding.port.js";
import { WeatherProviderAdapter } from "./ports/weather-provider.adapter.js";
import { ProviderCatalog } from "./providers/provider-catalog.js";
import { CompareOptions, WeatherService } from "./weather.service.types.js";

export class DefaultWeatherService implements WeatherService {
  constructor(
    private readonly catalog: ProviderCatalog,
    private readonly cache: CachePort,
    private readonly config: WeatherConfig,
    private readonly logger?: Logger,
    private readonly metrics?: Metrics
  ) {}

  capabilities(): ReadonlySet<WeatherCapability> {
    const caps = new Set<WeatherCapability>();
    for (const provider of this.catalog.list()) {
      for (const cap of provider.capabilities) {
        caps.add(cap);
      }
    }
    return caps;
  }

  async searchLocations(
    query: GeocodeQuery,
    ctx: CallContext
  ): Promise<readonly LocationRef[]> {
    const trimmed = query.query.trim();
    if (!trimmed) {
      return [];
    }

    const limit = query.limit ?? this.config.defaults.geocodeLimit;
    const cacheKey = `geocode:${trimmed.toLowerCase()}:${limit}:${query.locale || "en"}`;

    if (!ctx.bypassCache) {
      const cached = await this.cache.get<readonly LocationRef[]>(cacheKey);
      if (cached) {
        this.metrics?.increment("cache.hit", { capability: "geocode" });
        return cached;
      }
    }

    this.metrics?.increment("cache.miss", { capability: "geocode" });
    const providers = this.getProvidersFor("geocode");

    let lastError: Error | undefined;
    for (const provider of providers) {
      if (!provider.geocoding) continue;
      try {
        const results = await provider.geocoding.geocode(
          { query: trimmed, limit, locale: query.locale || this.config.defaults.locale },
          ctx
        );
        await this.cache.set(cacheKey, results, 86400000); // 24 hours
        return results;
      } catch (err: Error | unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        lastError = e;
        if (e instanceof WeatherProviderError && e.code === "LOCATION_NOT_FOUND") {
          throw e;
        }
        this.logger?.warn(
          `Geocoding provider ${provider.id} failed, attempting fallback`,
          { error: e.message }
        );
      }
    }

    if (lastError) throw lastError;
    return [];
  }

  async resolveLocation(input: LocationInput, ctx: CallContext): Promise<LocationRef> {
    if (isLocationRef(input)) {
      return input;
    }

    if (isCoordinatesInput(input)) {
      return {
        id: `coords:${input.latitude.toFixed(4)},${input.longitude.toFixed(4)}`,
        name: input.name || `${input.latitude.toFixed(2)}°, ${input.longitude.toFixed(2)}°`,
        country: "",
        region: "",
        latitude: input.latitude,
        longitude: input.longitude,
      };
    }

    const trimmed = input.trim();
    if (!trimmed) {
      throw new WeatherProviderError({
        code: "LOCATION_NOT_FOUND",
        message: "Location string cannot be empty.",
      });
    }

    const searchResults = await this.searchLocations(
      { query: trimmed, limit: 1 },
      ctx
    );

    if (searchResults.length === 0) {
      throw new WeatherProviderError({
        code: "LOCATION_NOT_FOUND",
        message: `Could not find any location matching "${trimmed}".`,
        location: trimmed,
      });
    }

    return searchResults[0];
  }

  async getCurrent(
    input: LocationInput,
    options: CurrentOptions,
    ctx: CallContext
  ): Promise<CurrentConditions> {
    const loc = await this.resolveLocation(input, ctx);
    const units: UnitSystem = options.units || this.config.defaults.units;
    const cacheKey = `current:${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}:${units}`;

    if (!ctx.bypassCache) {
      const cached = await this.cache.get<CurrentConditions>(cacheKey);
      if (cached) {
        this.metrics?.increment("cache.hit", { capability: "current" });
        return {
          ...cached,
          meta: { ...cached.meta, cacheHit: true },
        };
      }
    }

    this.metrics?.increment("cache.miss", { capability: "current" });
    const providers = this.getProvidersFor("current");

    let lastError: Error | undefined;
    for (const provider of providers) {
      if (!provider.conditions) continue;
      try {
        const conditions = await provider.conditions.getCurrent(
          loc,
          { units, locale: options.locale || this.config.defaults.locale },
          ctx
        );
        await this.cache.set(cacheKey, conditions, 600000); // 10m TTL
        return conditions;
      } catch (err: Error | unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        lastError = e;
        this.logger?.warn(
          `Conditions provider ${provider.id} failed, trying fallback`,
          { error: e.message }
        );
      }
    }

    if (lastError) throw lastError;
    throw new WeatherProviderError({
      code: "SERVICE_UNAVAILABLE",
      message: "All weather providers failed to fetch current conditions.",
      location: loc.name,
    });
  }

  async getForecast(
    input: LocationInput,
    options: ForecastOptions,
    ctx: CallContext
  ): Promise<Forecast> {
    const loc = await this.resolveLocation(input, ctx);
    const units: UnitSystem = options.units || this.config.defaults.units;
    const days = Math.max(
      1,
      Math.min(
        options.days || this.config.defaults.forecastDays,
        this.config.defaults.maxForecastDays
      )
    );
    const cacheKey = `forecast:${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}:${days}:${units}`;

    if (!ctx.bypassCache) {
      const cached = await this.cache.get<Forecast>(cacheKey);
      if (cached) {
        this.metrics?.increment("cache.hit", { capability: "forecast" });
        return {
          ...cached,
          meta: { ...cached.meta, cacheHit: true },
        };
      }
    }

    this.metrics?.increment("cache.miss", { capability: "forecast" });
    const providers = this.getProvidersFor("forecast");

    let lastError: Error | undefined;
    for (const provider of providers) {
      if (!provider.forecast) continue;
      try {
        const forecast = await provider.forecast.getForecast(
          loc,
          { days, units, locale: options.locale || this.config.defaults.locale },
          ctx
        );
        await this.cache.set(cacheKey, forecast, 1800000); // 30m TTL
        return forecast;
      } catch (err: Error | unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        lastError = e;
        this.logger?.warn(
          `Forecast provider ${provider.id} failed, trying fallback`,
          { error: e.message }
        );
      }
    }

    if (lastError) throw lastError;
    throw new WeatherProviderError({
      code: "SERVICE_UNAVAILABLE",
      message: "All weather providers failed to fetch forecast.",
      location: loc.name,
    });
  }

  async compare(
    inputs: readonly LocationInput[],
    options: CompareOptions,
    ctx: CallContext
  ): Promise<WeatherComparison> {
    if (inputs.length === 0) {
      throw new WeatherProviderError({
        code: "LOCATION_NOT_FOUND",
        message: "At least one location required for comparison.",
      });
    }

    const units: UnitSystem = options.units || this.config.defaults.units;
    const days = options.days || 3;

    const items: LocationComparisonItem[] = await Promise.all(
      inputs.map(async (input: LocationInput): Promise<LocationComparisonItem> => {
        const loc = await this.resolveLocation(input, ctx);
        const [current, forecast] = await Promise.all([
          this.getCurrent(loc, { units, locale: options.locale }, ctx),
          this.getForecast(loc, { days, units, locale: options.locale }, ctx),
        ]);
        return {
          location: loc,
          current,
          forecastDays: forecast.days,
        };
      })
    );

    const summaries: string[] = [];
    if (items.length >= 2) {
      const first = items[0];
      const second = items[1];
      const tempDiff = Math.abs(first.current.temperature - second.current.temperature);
      const warmer =
        first.current.temperature > second.current.temperature
          ? first.location.name
          : second.location.name;
      const unitLabel = units === "imperial" ? "°F" : "°C";

      summaries.push(
        `${warmer} is currently warmer by ${tempDiff}${unitLabel} (${first.location.name}: ${first.current.temperature}${unitLabel}, ${second.location.name}: ${second.current.temperature}${unitLabel}).`
      );
    } else if (items.length === 1) {
      const item = items[0];
      const unitLabel = units === "imperial" ? "°F" : "°C";
      summaries.push(
        `${item.location.name} currently has ${item.current.condition.toLowerCase()} at ${item.current.temperature}${unitLabel}.`
      );
    }

    return {
      items,
      summary: summaries.join(" "),
      units,
    };
  }

  private getProvidersFor(capability: WeatherCapability): readonly WeatherProviderAdapter[] {
    const list: WeatherProviderAdapter[] = [];
    const defaultProvider = this.catalog.getDefault();
    if (defaultProvider.capabilities.has(capability)) {
      list.push(defaultProvider);
    }

    for (const fallback of this.catalog.getFallbacks()) {
      if (fallback.capabilities.has(capability) && fallback.id !== defaultProvider.id) {
        list.push(fallback);
      }
    }

    return list;
  }
}
