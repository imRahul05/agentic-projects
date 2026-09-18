import { UnitSystem } from "../../config/config.types.js";

export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

export function fahrenheitToCelsius(f: number): number {
  return Math.round(((f - 32) * 5) / 9);
}

export function kphToMph(kph: number): number {
  return Math.round(kph * 0.621371);
}

export function mphToKph(mph: number): number {
  return Math.round(mph / 0.621371);
}

export function mmToInches(mm: number): number {
  return Math.round((mm / 25.4) * 100) / 100;
}

export function inchesToMm(inches: number): number {
  return Math.round(inches * 25.4 * 10) / 10;
}

export interface ConvertedValues {
  readonly temperature: number;
  readonly feelsLike: number;
  readonly windSpeed: number;
  readonly rainAmount: number;
  readonly unitLabelTemp: string;
  readonly unitLabelSpeed: string;
  readonly unitLabelPrecip: string;
}

export function convertUnits(
  celsius: number,
  feelsLikeCelsius: number,
  windSpeedKph: number,
  rainMm: number,
  targetUnits: UnitSystem
): ConvertedValues {
  if (targetUnits === "imperial") {
    return {
      temperature: celsiusToFahrenheit(celsius),
      feelsLike: celsiusToFahrenheit(feelsLikeCelsius),
      windSpeed: kphToMph(windSpeedKph),
      rainAmount: mmToInches(rainMm),
      unitLabelTemp: "°F",
      unitLabelSpeed: "mph",
      unitLabelPrecip: "in",
    };
  }

  return {
    temperature: Math.round(celsius),
    feelsLike: Math.round(feelsLikeCelsius),
    windSpeed: Math.round(windSpeedKph),
    rainAmount: Math.round(rainMm * 10) / 10,
    unitLabelTemp: "°C",
    unitLabelSpeed: "km/h",
    unitLabelPrecip: "mm",
  };
}
