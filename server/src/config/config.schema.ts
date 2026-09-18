import { z } from "zod";
import { AppConfig, ModelSpec, WeatherCapability } from "./config.types.js";

const DEFAULT_MODEL_ALIASES: Readonly<Record<string, ModelSpec>> = {
  default: {
    provider: "openai",
    model: "gpt-4o-mini",
    label: "GPT-4o Mini (Default)",
    description: "Fast, accurate and cost-effective",
  },
  fast: {
    provider: "openai",
    model: "gpt-4o-mini",
    label: "Fast",
    description: "Lowest latency response",
  },
  reasoning: {
    provider: "openai",
    model: "gpt-4o",
    label: "GPT-4o (High Intelligence)",
    description: "Deep reasoning and detailed comparisons",
  },
};

export const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z
    .string()
    .default("8080")
    .refine((val: string): boolean => {
      const parsed = parseInt(val, 10);
      return !Number.isNaN(parsed) && parsed > 0 && parsed <= 65535;
    }, { message: "Invalid PORT" })
    .transform((val: string): number => parseInt(val, 10)),
  API_BASE_PATH: z.string().default(""),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((val: string): readonly string[] =>
      val.split(",").map((s: string): string => s.trim()).filter((s: string): boolean => s.length > 0)
    ),
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((val: string): boolean | number => {
      if (val === "true") return true;
      if (val === "false") return false;
      const num = parseInt(val, 10);
      return Number.isNaN(num) ? false : num;
    }),
  BODY_LIMIT_BYTES: z
    .string()
    .default("1048576")
    .transform((val: string): number => parseInt(val, 10)),
  REQUEST_TIMEOUT_MS: z
    .string()
    .default("30000")
    .transform((val: string): number => parseInt(val, 10)),

  // AI Providers
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_BASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_BASE_URL: z.string().optional(),

  // Model selection
  AI_MODEL_ALIASES: z
    .string()
    .optional()
    .refine((val?: string): boolean => {
      if (!val) return true;
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    }, { message: "AI_MODEL_ALIASES must be valid JSON" })
    .transform((val?: string): Record<string, ModelSpec> => {
      if (!val) return { ...DEFAULT_MODEL_ALIASES };
      const parsed = JSON.parse(val) as Record<string, ModelSpec>;
      return { ...DEFAULT_MODEL_ALIASES, ...parsed };
    }),
  AI_DEFAULT_MODEL_ALIAS: z.string().default("default"),
  AI_CLIENT_SELECTABLE_ALIASES: z
    .string()
    .default("default,fast,reasoning")
    .transform((val: string): readonly string[] =>
      val.split(",").map((s: string): string => s.trim()).filter((s: string): boolean => s.length > 0)
    ),

  // Agent budgets
  AGENT_MAX_STEPS: z
    .string()
    .default("6")
    .transform((val: string): number => parseInt(val, 10)),
  AGENT_TOTAL_TIMEOUT_MS: z
    .string()
    .default("25000")
    .transform((val: string): number => parseInt(val, 10)),
  AGENT_STEP_TIMEOUT_MS: z
    .string()
    .default("10000")
    .transform((val: string): number => parseInt(val, 10)),
  AGENT_MAX_OUTPUT_TOKENS: z
    .string()
    .default("2048")
    .transform((val: string): number => parseInt(val, 10)),
  AGENT_HISTORY_WINDOW: z
    .string()
    .default("10")
    .transform((val: string): number => parseInt(val, 10)),
  AGENT_MAX_INPUT_CHARS: z
    .string()
    .default("4000")
    .transform((val: string): number => parseInt(val, 10)),

  // Weather Providers
  WEATHER_PROVIDER: z.string().default("open-meteo"),
  WEATHER_FALLBACK_PROVIDERS: z
    .string()
    .default("mock")
    .transform((val: string): readonly string[] =>
      val.split(",").map((s: string): string => s.trim()).filter((s: string): boolean => s.length > 0)
    ),
  WEATHER_OPEN_METEO_BASE_URL: z.string().default("https://api.open-meteo.com/v1"),
  WEATHER_OPEN_METEO_GEOCODING_BASE_URL: z
    .string()
    .default("https://geocoding-api.open-meteo.com/v1"),
  WEATHER_OPEN_METEO_TIMEOUT_MS: z
    .string()
    .default("7000")
    .transform((val: string): number => parseInt(val, 10)),
  WEATHER_WEATHERAPI_BASE_URL: z.string().default("https://api.weatherapi.com/v1"),
  WEATHER_API_KEY: z.string().optional().default(""),
  WEATHER_WEATHERAPI_TIMEOUT_MS: z
    .string()
    .default("7000")
    .transform((val: string): number => parseInt(val, 10)),

  // Weather Defaults
  WEATHER_DEFAULT_UNITS: z.enum(["metric", "imperial"]).default("metric"),
  WEATHER_DEFAULT_FORECAST_DAYS: z
    .string()
    .default("5")
    .transform((val: string): number => parseInt(val, 10)),
  WEATHER_MAX_FORECAST_DAYS: z
    .string()
    .default("7")
    .transform((val: string): number => parseInt(val, 10)),
  WEATHER_GEOCODE_LIMIT: z
    .string()
    .default("5")
    .transform((val: string): number => parseInt(val, 10)),
  WEATHER_LOCALE: z.string().default("en-US"),

  // Cache
  CACHE_ENABLED: z
    .string()
    .default("true")
    .transform((val: string): boolean => val !== "false"),
  CACHE_MAX_ENTRIES: z
    .string()
    .default("500")
    .transform((val: string): number => parseInt(val, 10)),
  CACHE_TTL_GEOCODE_MS: z
    .string()
    .default("86400000")
    .transform((val: string): number => parseInt(val, 10)),
  CACHE_TTL_CURRENT_MS: z
    .string()
    .default("600000")
    .transform((val: string): number => parseInt(val, 10)),
  CACHE_TTL_FORECAST_MS: z
    .string()
    .default("1800000")
    .transform((val: string): number => parseInt(val, 10)),
  CACHE_TTL_ALERTS_MS: z
    .string()
    .default("300000")
    .transform((val: string): number => parseInt(val, 10)),
  CACHE_TTL_HISTORY_MS: z
    .string()
    .default("86400000")
    .transform((val: string): number => parseInt(val, 10)),

  // Rate Limits
  RATE_LIMIT_CHAT_WINDOW_MS: z
    .string()
    .default("60000")
    .transform((val: string): number => parseInt(val, 10)),
  RATE_LIMIT_CHAT_MAX: z
    .string()
    .default("30")
    .transform((val: string): number => parseInt(val, 10)),
  RATE_LIMIT_READ_WINDOW_MS: z
    .string()
    .default("60000")
    .transform((val: string): number => parseInt(val, 10)),
  RATE_LIMIT_READ_MAX: z
    .string()
    .default("100")
    .transform((val: string): number => parseInt(val, 10)),

  // Observability
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  TELEMETRY_ENABLED: z
    .string()
    .default("false")
    .transform((val: string): boolean => val === "true"),
  SERVICE_NAME: z.string().default("weather-ai-agent"),

  // Feature Flags
  FEATURE_FLAGS: z
    .string()
    .optional()
    .transform((val?: string): Record<string, boolean> => {
      if (!val) return {};
      try {
        return JSON.parse(val) as Record<string, boolean>;
      } catch {
        return {};
      }
    }),
});

export type RawEnv = z.infer<typeof rawEnvSchema>;

export function mapRawEnvToAppConfig(raw: RawEnv): AppConfig {
  const providers: Record<string, { apiKey?: string; baseURL?: string }> = {};
  if (raw.OPENAI_API_KEY) {
    providers.openai = {
      apiKey: raw.OPENAI_API_KEY,
      baseURL: raw.OPENAI_BASE_URL,
    };
  }
  if (raw.ANTHROPIC_API_KEY) {
    providers.anthropic = {
      apiKey: raw.ANTHROPIC_API_KEY,
      baseURL: raw.ANTHROPIC_BASE_URL,
    };
  }
  // mock provider is always available for testing
  providers.mock = {};

  const weatherProviders: Record<string, {
    baseUrl: string;
    geocodingBaseUrl?: string;
    apiKey?: string;
    timeoutMs: number;
    retries: number;
  }> = {
    "open-meteo": {
      baseUrl: raw.WEATHER_OPEN_METEO_BASE_URL,
      geocodingBaseUrl: raw.WEATHER_OPEN_METEO_GEOCODING_BASE_URL,
      timeoutMs: raw.WEATHER_OPEN_METEO_TIMEOUT_MS,
      retries: 2,
    },
    weatherapi: {
      baseUrl: raw.WEATHER_WEATHERAPI_BASE_URL,
      apiKey: raw.WEATHER_API_KEY || undefined,
      timeoutMs: raw.WEATHER_WEATHERAPI_TIMEOUT_MS,
      retries: 2,
    },
    mock: {
      baseUrl: "mock://weather",
      timeoutMs: 100,
      retries: 0,
    },
  };

  const ttlMs: Record<WeatherCapability, number> = {
    geocode: raw.CACHE_TTL_GEOCODE_MS,
    current: raw.CACHE_TTL_CURRENT_MS,
    forecast: raw.CACHE_TTL_FORECAST_MS,
    alerts: raw.CACHE_TTL_ALERTS_MS,
    history: raw.CACHE_TTL_HISTORY_MS,
  };

  return {
    env: raw.NODE_ENV,
    http: {
      port: raw.PORT,
      basePath: raw.API_BASE_PATH,
      trustProxy: raw.TRUST_PROXY,
      corsOrigins: raw.CORS_ORIGINS,
      bodyLimitBytes: raw.BODY_LIMIT_BYTES,
      requestTimeoutMs: raw.REQUEST_TIMEOUT_MS,
    },
    ai: {
      providers,
      modelAliases: raw.AI_MODEL_ALIASES || DEFAULT_MODEL_ALIASES,
      defaultAlias: raw.AI_DEFAULT_MODEL_ALIAS,
      clientSelectableAliases: raw.AI_CLIENT_SELECTABLE_ALIASES,
      agent: {
        maxSteps: raw.AGENT_MAX_STEPS,
        totalTimeoutMs: raw.AGENT_TOTAL_TIMEOUT_MS,
        stepTimeoutMs: raw.AGENT_STEP_TIMEOUT_MS,
        maxOutputTokens: raw.AGENT_MAX_OUTPUT_TOKENS,
        historyWindowMessages: raw.AGENT_HISTORY_WINDOW,
        maxInputChars: raw.AGENT_MAX_INPUT_CHARS,
      },
    },
    weather: {
      defaultProviderId: raw.WEATHER_PROVIDER,
      fallbackProviderIds: raw.WEATHER_FALLBACK_PROVIDERS,
      providers: weatherProviders,
      defaults: {
        units: raw.WEATHER_DEFAULT_UNITS,
        forecastDays: raw.WEATHER_DEFAULT_FORECAST_DAYS,
        maxForecastDays: raw.WEATHER_MAX_FORECAST_DAYS,
        geocodeLimit: raw.WEATHER_GEOCODE_LIMIT,
        locale: raw.WEATHER_LOCALE,
      },
    },
    cache: {
      enabled: raw.CACHE_ENABLED,
      maxEntries: raw.CACHE_MAX_ENTRIES,
      ttlMs,
    },
    rateLimit: {
      chat: {
        windowMs: raw.RATE_LIMIT_CHAT_WINDOW_MS,
        max: raw.RATE_LIMIT_CHAT_MAX,
      },
      read: {
        windowMs: raw.RATE_LIMIT_READ_WINDOW_MS,
        max: raw.RATE_LIMIT_READ_MAX,
      },
    },
    observability: {
      logLevel: raw.LOG_LEVEL,
      telemetryEnabled: raw.TELEMETRY_ENABLED,
      serviceName: raw.SERVICE_NAME,
    },
    features: raw.FEATURE_FLAGS || {},
  };
}
