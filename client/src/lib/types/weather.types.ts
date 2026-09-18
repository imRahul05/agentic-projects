export type UnitSystem = "metric" | "imperial";

export interface LocationRef {
  readonly id: string;
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
  readonly standardCondition: string;
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
  readonly standardCondition: string;
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

export interface WeatherResponse {
  readonly location: LocationRef;
  readonly current?: CurrentConditions;
  readonly forecast?: Forecast;
  readonly meta: ProvenanceMeta;
}

export interface ModelOption {
  readonly alias: string;
  readonly label: string;
  readonly description?: string;
  readonly provider: string;
  readonly model: string;
}

export interface CapabilitiesResponse {
  readonly models: readonly ModelOption[];
  readonly units: readonly UnitSystem[];
  readonly weather: {
    readonly capabilities: readonly string[];
    readonly defaultProvider: string;
  };
  readonly limits: {
    readonly maxForecastDays: number;
    readonly maxCompareLocations: number;
  };
  readonly features: {
    readonly searchEnabled: boolean;
    readonly comparisonEnabled: boolean;
    readonly alertsEnabled: boolean;
    readonly historyEnabled: boolean;
  };
}

export interface GeocodeResponse {
  readonly locations: readonly LocationRef[];
  readonly meta: {
    readonly count: number;
  };
}

export interface ApiErrorDetail {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly requestId?: string;
}

export interface ApiErrorResponse {
  readonly error: ApiErrorDetail;
}
