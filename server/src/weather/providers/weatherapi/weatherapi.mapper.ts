import { UnitSystem } from "../../../config/config.types.js";
import { normalizeConditionText } from "../../domain/condition.js";
import { LocationRef } from "../../domain/location.types.js";
import { convertUnits } from "../../domain/units.js";
import { CurrentConditions, DailyForecast, Forecast } from "../../domain/weather.types.js";
import {
  WeatherApiResponse,
  WeatherApiSearchItem,
} from "./weatherapi.schema.js";

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

export function mapWeatherApiSearch(item: WeatherApiSearchItem): LocationRef {
  return {
    id: `weatherapi:${item.lat},${item.lon}`,
    name: item.name,
    country: item.country,
    region: item.region,
    latitude: item.lat,
    longitude: item.lon,
  };
}

export function mapWeatherApiCurrent(
  data: WeatherApiResponse,
  location: LocationRef,
  units: UnitSystem,
  providerId: string,
  cacheHit: boolean
): CurrentConditions {
  const c = data.current;
  const converted = convertUnits(c.temp_c, c.feelslike_c, c.wind_kph, c.precip_mm, units);
  const conditionText = c.condition.text;
  const standardCondition = normalizeConditionText(conditionText);

  const rainProb =
    data.forecast && data.forecast.forecastday.length > 0
      ? data.forecast.forecastday[0].day.daily_chance_of_rain
      : 0;

  return {
    location,
    temperature: converted.temperature,
    feelsLike: converted.feelsLike,
    condition: conditionText,
    standardCondition,
    humidity: c.humidity,
    windSpeed: converted.windSpeed,
    precipitationProbability: rainProb,
    rainMm: converted.rainAmount,
    uvIndex: c.uv,
    isDay: c.is_day === 1,
    localTime: data.location.localtime,
    units,
    meta: {
      providerId,
      fetchedAt: new Date().toISOString(),
      cacheHit,
    },
  };
}

export function mapWeatherApiForecast(
  data: WeatherApiResponse,
  location: LocationRef,
  daysCount: number,
  units: UnitSystem,
  providerId: string,
  cacheHit: boolean,
  locale: string = "en-US"
): Forecast {
  const daysArray = data.forecast?.forecastday || [];
  const forecastDays: DailyForecast[] = [];

  const count = Math.min(daysArray.length, daysCount);
  for (let i = 0; i < count; i++) {
    const item = daysArray[i];
    const condText = item.day.condition.text;
    const standardCond = normalizeConditionText(condText);

    const convertedMin = convertUnits(item.day.mintemp_c, item.day.mintemp_c, 0, 0, units);
    const convertedMax = convertUnits(
      item.day.maxtemp_c,
      item.day.maxtemp_c,
      item.day.maxwind_kph || 0,
      item.day.totalprecip_mm,
      units
    );

    forecastDays.push({
      date: item.date,
      dayOfWeek: getDayOfWeek(item.date, locale),
      minTemperature: convertedMin.temperature,
      maxTemperature: convertedMax.temperature,
      condition: condText,
      standardCondition: standardCond,
      precipitationProbability: item.day.daily_chance_of_rain,
      rainMm: convertedMax.rainAmount,
      windSpeed: convertedMax.windSpeed,
    });
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
