import { UnitSystem } from "../../config/config.types.js";
import { StandardCondition } from "./condition.js";
import { LocationRef } from "./location.types.js";

export interface GeoLocation {
  readonly name: string;
  readonly country: string;
  readonly region: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone?: string;
}

export interface ProvenanceMeta {
  readonly providerId: string;
  readonly fetchedAt: string;
  readonly cacheHit: boolean;
}

export interface CurrentConditions {
  readonly location: LocationRef;
  readonly temperature: number;
  readonly feelsLike: number;
  readonly condition: string;
  readonly standardCondition: StandardCondition;
  readonly humidity: number;
  readonly windSpeed: number;
  readonly precipitationProbability: number;
  readonly rainMm?: number;
  readonly uvIndex: number;
  readonly isDay: boolean;
  readonly localTime: string;
  readonly units: UnitSystem;
  readonly meta: ProvenanceMeta;
}

export interface DailyForecast {
  readonly date: string;
  readonly dayOfWeek: string;
  readonly minTemperature: number;
  readonly maxTemperature: number;
  readonly condition: string;
  readonly standardCondition: StandardCondition;
  readonly precipitationProbability: number;
  readonly rainMm: number;
  readonly windSpeed?: number;
}

export interface Forecast {
  readonly location: LocationRef;
  readonly days: readonly DailyForecast[];
  readonly units: UnitSystem;
  readonly meta: ProvenanceMeta;
}

export interface WeatherReport {
  readonly location: LocationRef;
  readonly current: CurrentConditions;
  readonly forecast: Forecast;
  readonly meta: ProvenanceMeta;
}

export interface LocationComparisonItem {
  readonly location: LocationRef;
  readonly current: CurrentConditions;
  readonly forecastDays: readonly DailyForecast[];
}

export interface WeatherComparison {
  readonly items: readonly LocationComparisonItem[];
  readonly summary: string;
  readonly units: UnitSystem;
}

export interface WeatherProviderErrorDetails {
  readonly code:
    | "LOCATION_NOT_FOUND"
    | "LOCATION_AMBIGUOUS"
    | "NETWORK_ERROR"
    | "RATE_LIMITED"
    | "INVALID_KEY"
    | "SERVICE_UNAVAILABLE"
    | "PROVIDER_CONTRACT_ERROR";
  readonly message: string;
  readonly location?: string;
}

export class WeatherProviderError extends Error {
  readonly code: WeatherProviderErrorDetails["code"];
  readonly requestedLocation?: string;

  constructor(details: WeatherProviderErrorDetails) {
    super(details.message);
    this.name = "WeatherProviderError";
    this.code = details.code;
    this.requestedLocation = details.location;
    Object.setPrototypeOf(this, WeatherProviderError.prototype);
  }
}
