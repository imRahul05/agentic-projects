import { UnitSystem } from "../../../config/config.types.js";
import { LocationRef } from "../../domain/location.types.js";
import { convertUnits } from "../../domain/units.js";
import { CurrentConditions, DailyForecast, Forecast } from "../../domain/weather.types.js";
import { getWmoInfo } from "../../domain/wmo-codes.js";
import { OpenMeteoForecastResponse, OpenMeteoGeocodingItem } from "./open-meteo.schema.js";

function getDayOfWeek(dateString: string, locale: string = "en-US"): string {
  const parts = dateString.split("-");
  if (parts.length !== 3) {
    return dateString;
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  return d.toLocaleDateString(locale, { weekday: "short" });
}

export function mapOpenMeteoGeocode(item: OpenMeteoGeocodingItem): LocationRef {
  return {
    id: `open-meteo:${item.id}`,
    name: item.name,
    country: item.country || "",
    region: item.admin1 || "",
    latitude: item.latitude,
    longitude: item.longitude,
    timezone: item.timezone,
  };
}

export function mapOpenMeteoCurrent(
  data: OpenMeteoForecastResponse,
  location: LocationRef,
  units: UnitSystem,
  providerId: string,
  cacheHit: boolean
): CurrentConditions {
  const current = data.current;
  const wmo = getWmoInfo(current.weather_code);
  const converted = convertUnits(
    current.temperature_2m,
    current.apparent_temperature,
    current.wind_speed_10m,
    current.precipitation,
    units
  );

  const rainProb =
    data.daily && data.daily.precipitation_probability_max.length > 0
      ? data.daily.precipitation_probability_max[0]
      : 0;

  return {
    location,
    temperature: converted.temperature,
    feelsLike: converted.feelsLike,
    condition: wmo.description,
    standardCondition: wmo.condition,
    humidity: Math.round(current.relative_humidity_2m),
    windSpeed: converted.windSpeed,
    precipitationProbability: Math.round(rainProb),
    rainMm: converted.rainAmount,
    uvIndex: 0,
    isDay: current.is_day === 1,
    localTime: current.time,
    units,
    meta: {
      providerId,
      fetchedAt: new Date().toISOString(),
      cacheHit,
    },
  };
}

export function mapOpenMeteoForecast(
  data: OpenMeteoForecastResponse,
  location: LocationRef,
  daysCount: number,
  units: UnitSystem,
  providerId: string,
  cacheHit: boolean,
  locale: string = "en-US"
): Forecast {
  const daily = data.daily;
  const forecastDays: DailyForecast[] = [];

  if (daily && daily.time.length > 0) {
    const count = Math.min(daily.time.length, daysCount);
    for (let i = 0; i < count; i++) {
      const dateStr = daily.time[i];
      const code = daily.weather_code[i] ?? 0;
      const wmo = getWmoInfo(code);

      const minT = daily.temperature_2m_min[i] ?? 0;
      const maxT = daily.temperature_2m_max[i] ?? 0;
      const precipSum = daily.precipitation_sum[i] ?? 0;

      const convertedMin = convertUnits(minT, minT, 0, 0, units);
      const convertedMax = convertUnits(maxT, maxT, 0, precipSum, units);

      forecastDays.push({
        date: dateStr,
        dayOfWeek: getDayOfWeek(dateStr, locale),
        minTemperature: convertedMin.temperature,
        maxTemperature: convertedMax.temperature,
        condition: wmo.description,
        standardCondition: wmo.condition,
        precipitationProbability: Math.round(daily.precipitation_probability_max[i] ?? 0),
        rainMm: convertedMax.rainAmount,
      });
    }
  }

  return {
    location,
    days: forecastDays,
    units,
    meta: {
      providerId,
      fetchedAt: new Date().toISOString(),
      cacheHit,
    },
  };
}
