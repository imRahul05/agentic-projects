import { WeatherCapability } from "../../../config/config.types.js";
import { LocationRef } from "../../domain/location.types.js";
import { CurrentConditions, Forecast, WeatherProviderError } from "../../domain/weather.types.js";
import { CallContext } from "../../ports/call-context.js";
import { ConditionsPort, CurrentOptions } from "../../ports/conditions.port.js";
import { ForecastOptions, ForecastPort } from "../../ports/forecast.port.js";
import { GeocodeQuery, GeocodingPort } from "../../ports/geocoding.port.js";
import { HealthCheckResult, WeatherProviderAdapter } from "../../ports/weather-provider.adapter.js";
import { HttpClient } from "../http-client.js";
import { mapOpenMeteoCurrent, mapOpenMeteoForecast, mapOpenMeteoGeocode } from "./open-meteo.mapper.js";
import {
  openMeteoForecastResponseSchema,
  openMeteoGeocodingResponseSchema,
} from "./open-meteo.schema.js";

export class OpenMeteoProvider
  implements WeatherProviderAdapter, GeocodingPort, ConditionsPort, ForecastPort
{
  readonly id = "open-meteo";
  readonly displayName = "Open-Meteo";
  readonly capabilities: ReadonlySet<WeatherCapability> = new Set([
    "geocode",
    "current",
    "forecast",
  ]);

  readonly geocoding = this;
  readonly conditions = this;
  readonly forecast = this;

  constructor(
    private readonly baseUrl: string = "https://api.open-meteo.com/v1",
    private readonly geocodingBaseUrl: string = "https://geocoding-api.open-meteo.com/v1",
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

    const limit = query.limit ?? 5;
    const url = `${this.geocodingBaseUrl}/search`;

    const raw = await this.httpClient.get<object>(url, {
      query: {
        name: trimmed,
        count: limit,
        language: query.locale?.split("-")[0] || "en",
        format: "json",
      },
      signal: ctx.signal,
    });

    const parsed = openMeteoGeocodingResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new WeatherProviderError({
        code: "PROVIDER_CONTRACT_ERROR",
        message: "Failed to parse Open-Meteo geocoding response",
        location: trimmed,
      });
    }

    if (!parsed.data.results || parsed.data.results.length === 0) {
      throw new WeatherProviderError({
        code: "LOCATION_NOT_FOUND",
        message: `Could not find any location matching "${trimmed}".`,
        location: trimmed,
      });
    }

    return parsed.data.results.map(mapOpenMeteoGeocode);
  }

  async getCurrent(
    location: LocationRef,
    options: CurrentOptions,
    ctx: CallContext
  ): Promise<CurrentConditions> {
    const url = `${this.baseUrl}/forecast`;
    const raw = await this.httpClient.get<object>(url, {
      query: {
        latitude: location.latitude,
        longitude: location.longitude,
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
        daily: "precipitation_probability_max",
        forecast_days: 1,
        timezone: location.timezone || "auto",
      },
      signal: ctx.signal,
    });

    const parsed = openMeteoForecastResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new WeatherProviderError({
        code: "PROVIDER_CONTRACT_ERROR",
        message: "Failed to parse Open-Meteo current conditions",
        location: location.name,
      });
    }

    return mapOpenMeteoCurrent(
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
    const days = Math.max(1, Math.min(options.days, 7));
    const url = `${this.baseUrl}/forecast`;

    const raw = await this.httpClient.get<object>(url, {
      query: {
        latitude: location.latitude,
        longitude: location.longitude,
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
        daily:
          "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
        forecast_days: days,
        timezone: location.timezone || "auto",
      },
      signal: ctx.signal,
    });

    const parsed = openMeteoForecastResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new WeatherProviderError({
        code: "PROVIDER_CONTRACT_ERROR",
        message: "Failed to parse Open-Meteo forecast",
        location: location.name,
      });
    }

    return mapOpenMeteoForecast(
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
    const start = Date.now();
    try {
      await this.httpClient.get(`${this.baseUrl}/forecast`, {
        query: { latitude: 51.5, longitude: -0.1, current: "temperature_2m" },
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
