import { WeatherCapability } from "../../../config/config.types.js";
import { LocationRef } from "../../domain/location.types.js";
import { CurrentConditions, Forecast, WeatherProviderError } from "../../domain/weather.types.js";
import { CallContext } from "../../ports/call-context.js";
import { ConditionsPort, CurrentOptions } from "../../ports/conditions.port.js";
import { ForecastOptions, ForecastPort } from "../../ports/forecast.port.js";
import { GeocodeQuery, GeocodingPort } from "../../ports/geocoding.port.js";
import { HealthCheckResult, WeatherProviderAdapter } from "../../ports/weather-provider.adapter.js";
import { HttpClient } from "../http-client.js";
import {
  mapWeatherApiCurrent,
  mapWeatherApiForecast,
  mapWeatherApiSearch,
} from "./weatherapi.mapper.js";
import {
  WeatherApiResponse,
  WeatherApiSearchItem,
  weatherApiResponseSchema,
  weatherApiSearchItemSchema,
} from "./weatherapi.schema.js";
import { z } from "zod";

export class WeatherApiProvider
  implements WeatherProviderAdapter, GeocodingPort, ConditionsPort, ForecastPort
{
  readonly id = "weatherapi";
  readonly displayName = "WeatherAPI";
  readonly capabilities: ReadonlySet<WeatherCapability> = new Set([
    "geocode",
    "current",
    "forecast",
  ]);

  readonly geocoding = this;
  readonly conditions = this;
  readonly forecast = this;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = "https://api.weatherapi.com/v1",
    private readonly httpClient: HttpClient = new HttpClient(7000, 2)
  ) {}

  async geocode(query: GeocodeQuery, ctx: CallContext): Promise<readonly LocationRef[]> {
    const trimmed = query.query.trim();
    if (!trimmed) {
      throw new WeatherProviderError({
        code: "LOCATION_NOT_FOUND",
        message: "Empty location provided.",
      });
    }

    if (!this.apiKey) {
      throw new WeatherProviderError({
        code: "INVALID_KEY",
        message: "WeatherAPI key is missing.",
      });
    }

    const url = `${this.baseUrl}/search.json`;
    const raw = await this.httpClient.get<object[]>(url, {
      query: {
        key: this.apiKey,
        q: trimmed,
      },
      signal: ctx.signal,
    });

    const parsed = z.array(weatherApiSearchItemSchema).safeParse(raw);
    if (!parsed.success) {
      throw new WeatherProviderError({
        code: "PROVIDER_CONTRACT_ERROR",
        message: "Failed to parse WeatherAPI search response",
        location: trimmed,
      });
    }

    if (parsed.data.length === 0) {
      throw new WeatherProviderError({
        code: "LOCATION_NOT_FOUND",
        message: `Could not find any location matching "${trimmed}".`,
        location: trimmed,
      });
    }

    return parsed.data.map(mapWeatherApiSearch);
  }

  async getCurrent(
    location: LocationRef,
    options: CurrentOptions,
    ctx: CallContext
  ): Promise<CurrentConditions> {
    if (!this.apiKey) {
      throw new WeatherProviderError({
        code: "INVALID_KEY",
        message: "WeatherAPI key is missing.",
      });
    }

    const url = `${this.baseUrl}/current.json`;
    const queryLocation = `${location.latitude},${location.longitude}`;

    const raw = await this.httpClient.get<object>(url, {
      query: {
        key: this.apiKey,
        q: queryLocation,
        aqi: "no",
      },
      signal: ctx.signal,
    });

    const parsed = weatherApiResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new WeatherProviderError({
        code: "PROVIDER_CONTRACT_ERROR",
        message: "Failed to parse WeatherAPI current conditions",
        location: location.name,
      });
    }

    return mapWeatherApiCurrent(
      parsed.data,
      location,
      options.units || "metric",
      this.id,
      false
    );
  }

  async getForecast(
    location: LocationRef,
    options: ForecastOptions,
    ctx: CallContext
  ): Promise<Forecast> {
    if (!this.apiKey) {
      throw new WeatherProviderError({
        code: "INVALID_KEY",
        message: "WeatherAPI key is missing.",
      });
    }

    const days = Math.max(1, Math.min(options.days, 7));
    const url = `${this.baseUrl}/forecast.json`;
    const queryLocation = `${location.latitude},${location.longitude}`;

    const raw = await this.httpClient.get<object>(url, {
      query: {
        key: this.apiKey,
        q: queryLocation,
        days,
        aqi: "no",
        alerts: "no",
      },
      signal: ctx.signal,
    });

    const parsed = weatherApiResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new WeatherProviderError({
        code: "PROVIDER_CONTRACT_ERROR",
        message: "Failed to parse WeatherAPI forecast response",
        location: location.name,
      });
    }

    return mapWeatherApiForecast(
      parsed.data,
      location,
      days,
      options.units || "metric",
      this.id,
      false,
      options.locale
    );
  }

  async health(ctx: CallContext): Promise<HealthCheckResult> {
    if (!this.apiKey) {
      return { ok: false, message: "WeatherAPI key not configured" };
    }

    const start = Date.now();
    try {
      await this.httpClient.get(`${this.baseUrl}/current.json`, {
        query: { key: this.apiKey, q: "London", aqi: "no" },
        timeoutMs: 3000,
        retries: 0,
        signal: ctx.signal,
      });
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: Error | unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      return { ok: false, message: e.message, latencyMs: Date.now() - start };
    }
  }
}
