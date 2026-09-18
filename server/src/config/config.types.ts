export type Environment = "development" | "test" | "production";
export type UnitSystem = "metric" | "imperial";
export type WeatherCapability = "geocode" | "current" | "forecast" | "alerts" | "history";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface HttpConfig {
  readonly port: number;
  readonly basePath: string;
  readonly trustProxy: boolean | number;
  readonly corsOrigins: readonly string[];
  readonly bodyLimitBytes: number;
  readonly requestTimeoutMs: number;
}

export interface ProviderCredentials {
  readonly apiKey?: string;
  readonly baseURL?: string;
}

export interface ModelSpec {
  readonly provider: string;
  readonly model: string;
  readonly label: string;
  readonly description?: string;
}

export interface AgentConfig {
  readonly maxSteps: number;
  readonly totalTimeoutMs: number;
  readonly stepTimeoutMs: number;
  readonly maxOutputTokens: number;
  readonly historyWindowMessages: number;
  readonly maxInputChars: number;
}

export interface AiConfig {
  readonly providers: Readonly<Record<string, ProviderCredentials>>;
  readonly modelAliases: Readonly<Record<string, ModelSpec>>;
  readonly defaultAlias: string;
  readonly clientSelectableAliases: readonly string[];
  readonly agent: AgentConfig;
}

export interface WeatherProviderEndpointConfig {
  readonly baseUrl: string;
  readonly geocodingBaseUrl?: string;
  readonly apiKey?: string;
  readonly timeoutMs: number;
  readonly retries: number;
}

export interface WeatherDefaultsConfig {
  readonly units: UnitSystem;
  readonly forecastDays: number;
  readonly maxForecastDays: number;
  readonly geocodeLimit: number;
  readonly locale: string;
}

export interface WeatherConfig {
  readonly defaultProviderId: string;
  readonly fallbackProviderIds: readonly string[];
  readonly providers: Readonly<Record<string, WeatherProviderEndpointConfig>>;
  readonly defaults: WeatherDefaultsConfig;
}

export interface CacheConfig {
  readonly enabled: boolean;
  readonly maxEntries: number;
  readonly ttlMs: Readonly<Record<WeatherCapability, number>>;
}

export interface RateLimitBucketConfig {
  readonly windowMs: number;
  readonly max: number;
}

export interface RateLimitConfig {
  readonly chat: RateLimitBucketConfig;
  readonly read: RateLimitBucketConfig;
}

export interface ObservabilityConfig {
  readonly logLevel: LogLevel;
  readonly telemetryEnabled: boolean;
  readonly serviceName: string;
}

export interface AppConfig {
  readonly env: Environment;
  readonly http: HttpConfig;
  readonly ai: AiConfig;
  readonly weather: WeatherConfig;
  readonly cache: CacheConfig;
  readonly rateLimit: RateLimitConfig;
  readonly observability: ObservabilityConfig;
  readonly features: Readonly<Record<string, boolean>>;
}
