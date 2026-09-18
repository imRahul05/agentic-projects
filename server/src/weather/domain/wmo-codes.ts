import { StandardCondition } from "./condition.js";

export interface WmoCodeInfo {
  readonly description: string;
  readonly condition: StandardCondition;
}

export const WMO_CODE_MAP: Readonly<Record<number, WmoCodeInfo>> = {
  0: { description: "Clear sky", condition: "clear" },
  1: { description: "Mainly clear", condition: "clear" },
  2: { description: "Partly cloudy", condition: "partly_cloudy" },
  3: { description: "Overcast", condition: "overcast" },
  45: { description: "Fog", condition: "fog" },
  48: { description: "Depositing rime fog", condition: "fog" },
  51: { description: "Light drizzle", condition: "drizzle" },
  53: { description: "Moderate drizzle", condition: "drizzle" },
  55: { description: "Dense drizzle", condition: "drizzle" },
  56: { description: "Light freezing drizzle", condition: "freezing_rain" },
  57: { description: "Dense freezing drizzle", condition: "freezing_rain" },
  61: { description: "Slight rain", condition: "rain" },
  62: { description: "Moderate rain", condition: "rain" },
  63: { description: "Moderate rain", condition: "rain" },
  65: { description: "Heavy rain", condition: "rain" },
  66: { description: "Light freezing rain", condition: "freezing_rain" },
  67: { description: "Heavy freezing rain", condition: "freezing_rain" },
  71: { description: "Slight snow fall", condition: "snow" },
  73: { description: "Moderate snow fall", condition: "snow" },
  75: { description: "Heavy snow fall", condition: "snow" },
  77: { description: "Snow grains", condition: "snow" },
  80: { description: "Slight rain showers", condition: "rain" },
  81: { description: "Moderate rain showers", condition: "rain" },
  82: { description: "Violent rain showers", condition: "rain" },
  85: { description: "Slight snow showers", condition: "snow" },
  86: { description: "Heavy snow showers", condition: "snow" },
  95: { description: "Thunderstorm", condition: "thunderstorm" },
  96: { description: "Thunderstorm with slight hail", condition: "thunderstorm" },
  99: { description: "Thunderstorm with heavy hail", condition: "thunderstorm" },
};

export function getWmoInfo(code: number): WmoCodeInfo {
  return WMO_CODE_MAP[code] || { description: "Partly cloudy", condition: "partly_cloudy" };
}
