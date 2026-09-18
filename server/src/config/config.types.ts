export type Environment = "development" | "test" | "production";
export type LogLevel = "debug" | "info" | "warn" | "error";
export type SearchMode = "native" | "external";

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

/**
 * A model alias entry. `provider` must match a key in {@link AiConfig.providers};
 * `model` is the provider-native model id. Both come from configuration so that
 * no model or provider name is ever hardcoded in application code.
 */
export interface ModelSpec {
  readonly provider: string;
  readonly model: string;
  readonly label: string;
  readonly description?: string;
}

export interface AgentConfig {
  readonly maxSteps: number;
  readonly maxSearches: number;
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

export interface SearchUserLocation {
  readonly country?: string;
  readonly region?: string;
  readonly city?: string;
  readonly timezone?: string;
}

/**
 * Provider-executed web search. Tool ids are configured rather than hardcoded
 * because providers ship dated tool versions (e.g. Anthropic's
 * `webSearch_<date>`), so upgrading is an environment change.
 */
export interface NativeSearchConfig {
  readonly toolIdByProvider: Readonly<Record<string, string>>;
  readonly maxUses?: number;
  readonly allowedDomains?: readonly string[];
  readonly blockedDomains?: readonly string[];
  readonly userLocation?: SearchUserLocation;
}

export interface ExternalSearchConfig {
  readonly clientId: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly maxResults: number;
  readonly timeoutMs: number;
  readonly cacheTtlMs: number;
}

export interface SearchConfig {
  readonly mode: SearchMode;
  readonly native: NativeSearchConfig;
  readonly external?: ExternalSearchConfig;
}

export interface CacheConfig {
  readonly enabled: boolean;
  readonly maxEntries: number;
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

export interface ChatUiConfig {
  /** Empty-state prompt chips, served to the client so the UI hardcodes nothing. */
  readonly suggestions: readonly string[];
  readonly defaultLocale: string;
}

export interface AppConfig {
  readonly env: Environment;
  readonly http: HttpConfig;
  readonly ai: AiConfig;
  readonly search: SearchConfig;
  readonly cache: CacheConfig;
  readonly rateLimit: RateLimitConfig;
  readonly observability: ObservabilityConfig;
  readonly chat: ChatUiConfig;
  readonly features: Readonly<Record<string, boolean>>;
}
