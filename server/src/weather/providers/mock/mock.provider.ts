import { WeatherCapability } from "../../../config/config.types.js";
import { LocationRef } from "../../domain/location.types.js";
import { convertUnits } from "../../domain/units.js";
import {
  CurrentConditions,
  DailyForecast,
  Forecast,
  WeatherProviderError,
} from "../../domain/weather.types.js";
import { CallContext } from "../../ports/call-context.js";
import { ConditionsPort, CurrentOptions } from "../../ports/conditions.port.js";
import { ForecastOptions, ForecastPort } from "../../ports/forecast.port.js";
import { GeocodeQuery, GeocodingPort } from "../../ports/geocoding.port.js";
import { HealthCheckResult, WeatherProviderAdapter } from "../../ports/weather-provider.adapter.js";

export class MockWeatherProvider
  implements WeatherProviderAdapter, GeocodingPort, ConditionsPort, ForecastPort
{
  readonly id = "mock";
  readonly displayName = "Mock Provider";
  readonly capabilities: ReadonlySet<WeatherCapability> = new Set([
    "geocode",
    "current",
    "forecast",
  ]);

  readonly geocoding = this;
  readonly conditions = this;
  readonly forecast = this;

  async geocode(query: GeocodeQuery, _ctx: CallContext): Promise<readonly LocationRef[]> {
    const q = query.query.trim();
    if (!q) {
      throw new WeatherProviderError({
        code: "LOCATION_NOT_FOUND",
        message: "Empty location provided.",
      });
    }

    if (q.toLowerCase().includes("invalid") || q.toLowerCase().includes("nonexistent")) {
      throw new WeatherProviderError({
        code: "LOCATION_NOT_FOUND",
        message: `Could not find any location matching "${q}".`,
        location: q,
      });
    }

    if (q.toLowerCase().includes("fail")) {
      throw new WeatherProviderError({
        code: "SERVICE_UNAVAILABLE",
        message: "Mock geocoding service simulated failure.",
        location: q,
      });
    }

    return [
      {
        id: `mock:${q.toLowerCase().replace(/\s+/g, "-")}`,
        name: q.charAt(0).toUpperCase() + q.slice(1),
        country: "MockCountry",
        region: "MockRegion",
        latitude: 40.7128,
        longitude: -74.006,
        timezone: "UTC",
      },
    ];
  }

  async getCurrent(
    location: LocationRef,
    options: CurrentOptions,
    _ctx: CallContext
  ): Promise<CurrentConditions> {
    if (location.name.toLowerCase().includes("fail")) {
      throw new WeatherProviderError({
        code: "SERVICE_UNAVAILABLE",
        message: "Mock conditions service simulated failure.",
        location: location.name,
      });
    }

    const units = options.units || "metric";
    const converted = convertUnits(22, 23, 15, 0, units);

    return {
      location,
      temperature: converted.temperature,
      feelsLike: converted.feelsLike,
      condition: "Partly cloudy",
      standardCondition: "partly_cloudy",
      humidity: 55,
      windSpeed: converted.windSpeed,
      precipitationProbability: 10,
      rainMm: 0,
      uvIndex: 4,
      isDay: true,
      localTime: new Date().toISOString(),
      units,
      meta: {
        providerId: this.id,
        fetchedAt: new Date().toISOString(),
        cacheHit: false,
      },
    };
  }

  async getForecast(
    location: LocationRef,
    options: ForecastOptions,
    _ctx: CallContext
  ): Promise<Forecast> {
    if (location.name.toLowerCase().includes("fail")) {
      throw new WeatherProviderError({
        code: "SERVICE_UNAVAILABLE",
        message: "Mock forecast service simulated failure.",
        location: location.name,
      });
    }

    const units = options.units || "metric";
    const daysCount = Math.max(1, Math.min(options.days, 7));
    const today = new Date();
    const forecastDays: DailyForecast[] = [];

    const conditionsList = [
      { text: "Sunny", std: "clear" as const, min: 16, max: 24, prob: 0, rain: 0 },
      { text: "Partly cloudy", std: "partly_cloudy" as const, min: 15, max: 23, prob: 15, rain: 0 },
      { text: "Light rain", std: "rain" as const, min: 13, max: 19, prob: 60, rain: 4.5 },
      { text: "Scattered showers", std: "rain" as const, min: 14, max: 20, prob: 45, rain: 2.1 },
      { text: "Mainly clear", std: "clear" as const, min: 15, max: 25, prob: 10, rain: 0 },
      { text: "Thunderstorm", std: "thunderstorm" as const, min: 17, max: 22, prob: 80, rain: 12.0 },
      { text: "Overcast", std: "overcast" as const, min: 14, max: 18, prob: 25, rain: 0.5 },
    ];

    for (let i = 0; i < daysCount; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayInfo = conditionsList[i % conditionsList.length];

      const minConverted = convertUnits(dayInfo.min, dayInfo.min, 0, 0, units);
      const maxConverted = convertUnits(dayInfo.max, dayInfo.max, 12, dayInfo.rain, units);

      forecastDays.push({
        date: d.toISOString().split("T")[0],
        dayOfWeek: d.toLocaleDateString(options.locale || "en-US", { weekday: "short" }),
        minTemperature: minConverted.temperature,
        maxTemperature: maxConverted.temperature,
        condition: dayInfo.text,
        standardCondition: dayInfo.std,
        precipitationProbability: dayInfo.prob,
        rainMm: maxConverted.rainAmount,
      });
    }

    return {
      location,
      days: forecastDays,
      units,
      meta: {
        providerId: this.id,
        fetchedAt: new Date().toISOString(),
        cacheHit: false,
      },
    };
  }

  async health(_ctx: CallContext): Promise<HealthCheckResult> {
    return { ok: true, latencyMs: 1 };
  }
}
