import { z } from "zod";
import type { AppConfig, ModelSpec, SearchUserLocation } from "./config.types.js";

/**
 * Environment variables arrive as strings. These helpers keep the schema
 * declarative while still failing fast on malformed input — a misconfigured
 * deployment must refuse to boot rather than silently fall back to a default.
 */
const integerFromString = (
  defaultValue: number,
  bounds: { readonly min: number; readonly max?: number },
): z.ZodType<number, z.ZodTypeDef, unknown> =>
  z
    .union([z.string(), z.number()])
    .default(String(defaultValue))
    .transform((value, ctx): number => {
      const parsed = typeof value === "number" ? value : Number.parseInt(value.trim(), 10);
      if (!Number.isInteger(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `expected an integer, received "${String(value)}"` });
        return z.NEVER;
      }
      if (parsed < bounds.min || (bounds.max !== undefined && parsed > bounds.max)) {
        const range = bounds.max === undefined ? `>= ${bounds.min}` : `between ${bounds.min} and ${bounds.max}`;
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `expected an integer ${range}, received ${parsed}` });
        return z.NEVER;
      }
      return parsed;
    });

const booleanFromString = (defaultValue: boolean): z.ZodType<boolean, z.ZodTypeDef, unknown> =>
  z
    .union([z.string(), z.boolean()])
    .default(String(defaultValue))
    .transform((value, ctx): boolean => {
      if (typeof value === "boolean") return value;
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off", ""].includes(normalized)) return false;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `expected a boolean, received "${value}"` });
      return z.NEVER;
    });

const csvList = (defaultValue: string): z.ZodType<readonly string[], z.ZodTypeDef, unknown> =>
  z
    .string()
    .default(defaultValue)
    .transform((value): readonly string[] =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );

const jsonObject = <T>(schema: z.ZodType<T>, label: string): z.ZodType<T | undefined, z.ZodTypeDef, unknown> =>
  z
    .string()
    .optional()
    .transform((value, ctx): T | undefined => {
      if (value === undefined || value.trim() === "") return undefined;
      let raw: unknown;
      try {
        raw = JSON.parse(value);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be valid JSON` });
        return z.NEVER;
      }
      const result = schema.safeParse(raw);
      if (!result.success) {
        const detail = result.error.issues
          .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
          .join("; ");
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is invalid (${detail})` });
        return z.NEVER;
      }
      return result.data;
    });

const modelSpecSchema: z.ZodType<ModelSpec> = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

const userLocationSchema: z.ZodType<SearchUserLocation> = z.object({
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  timezone: z.string().optional(),
});

const trustProxySchema: z.ZodType<boolean | number, z.ZodTypeDef, unknown> = z
  .string()
  .default("false")
  .transform((value, ctx): boolean | number => {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
    const hops = Number.parseInt(normalized, 10);
    if (Number.isInteger(hops) && hops >= 0) return hops;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `TRUST_PROXY must be a boolean or a non-negative hop count, received "${value}"`,
    });
    return z.NEVER;
  });

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // HTTP
  PORT: integerFromString(8080, { min: 1, max: 65535 }),
  API_BASE_PATH: z.string().default("/api"),
  CORS_ORIGINS: csvList("http://localhost:3000"),
  TRUST_PROXY: trustProxySchema,
  BODY_LIMIT_BYTES: integerFromString(262144, { min: 1024 }),
  REQUEST_TIMEOUT_MS: integerFromString(60000, { min: 1000 }),

  // Model providers
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),

  /**
   * Required. Maps an alias the client may request to a concrete provider+model.
   * Deliberately has no built-in default so that model ids live only in config.
   */
  AI_MODEL_ALIASES: jsonObject(z.record(modelSpecSchema), "AI_MODEL_ALIASES"),
  AI_DEFAULT_MODEL_ALIAS: z.string().min(1).default("default"),
  AI_CLIENT_SELECTABLE_ALIASES: csvList(""),

  // Agent budgets
  AGENT_MAX_STEPS: integerFromString(5, { min: 1, max: 50 }),
  AGENT_MAX_SEARCHES: integerFromString(3, { min: 1, max: 20 }),
  AGENT_TOTAL_TIMEOUT_MS: integerFromString(60000, { min: 1000 }),
  AGENT_STEP_TIMEOUT_MS: integerFromString(30000, { min: 1000 }),
  AGENT_MAX_OUTPUT_TOKENS: integerFromString(1024, { min: 64 }),
  AGENT_HISTORY_WINDOW: integerFromString(10, { min: 1, max: 200 }),
  AGENT_MAX_INPUT_CHARS: integerFromString(4000, { min: 100 }),

  // Search
  SEARCH_MODE: z.enum(["native", "external"]).default("native"),
  SEARCH_NATIVE_TOOL_IDS: jsonObject(z.record(z.string().min(1)), "SEARCH_NATIVE_TOOL_IDS"),
  SEARCH_MAX_USES: integerFromString(3, { min: 1, max: 20 }),
  SEARCH_ALLOWED_DOMAINS: csvList(""),
  SEARCH_BLOCKED_DOMAINS: csvList(""),
  SEARCH_USER_LOCATION: jsonObject(userLocationSchema, "SEARCH_USER_LOCATION"),
  SEARCH_CLIENT: z.string().default("fake"),
  SEARCH_API_KEY: z.string().optional(),
  SEARCH_BASE_URL: z.string().url().optional(),
  SEARCH_MAX_RESULTS: integerFromString(5, { min: 1, max: 20 }),
  SEARCH_TIMEOUT_MS: integerFromString(10000, { min: 500 }),
  SEARCH_CACHE_TTL_MS: integerFromString(300000, { min: 0 }),

  // Cache
  CACHE_ENABLED: booleanFromString(true),
  CACHE_MAX_ENTRIES: integerFromString(500, { min: 1 }),

  // Rate limits
  RATE_LIMIT_CHAT_WINDOW_MS: integerFromString(60000, { min: 1000 }),
  RATE_LIMIT_CHAT_MAX: integerFromString(20, { min: 1 }),
  RATE_LIMIT_READ_WINDOW_MS: integerFromString(60000, { min: 1000 }),
  RATE_LIMIT_READ_MAX: integerFromString(120, { min: 1 }),

  // Observability
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  TELEMETRY_ENABLED: booleanFromString(false),
  SERVICE_NAME: z.string().min(1).default("weather-agent"),

  // Chat UI
  CHAT_SUGGESTIONS: z
    .string()
    .default("What's the weather in Lisbon right now?|Will it rain in Tokyo tomorrow?|Do I need a jacket in Berlin today?")
    .transform((value): readonly string[] =>
      value
        .split("|")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  CHAT_DEFAULT_LOCALE: z.string().min(2).default("en-US"),

  FEATURE_FLAGS: jsonObject(z.record(z.boolean()), "FEATURE_FLAGS"),
});

/**
 * Cross-field rules that a per-field schema cannot express. Every violation is
 * reported so a bad deployment learns about all of its problems at once.
 */
export const rawEnvSchema = baseEnvSchema.superRefine((raw, ctx) => {
  const configuredProviders = new Set<string>();
  if (raw.OPENAI_API_KEY) configuredProviders.add("openai");
  if (raw.ANTHROPIC_API_KEY) configuredProviders.add("anthropic");

  if (configuredProviders.size === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OPENAI_API_KEY"],
      message: "at least one model provider key is required (OPENAI_API_KEY or ANTHROPIC_API_KEY)",
    });
  }

  const aliases = raw.AI_MODEL_ALIASES;
  if (aliases === undefined || Object.keys(aliases).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AI_MODEL_ALIASES"],
      message:
        'is required, e.g. {"default":{"provider":"openai","model":"<model-id>","label":"Default"}} — model ids are never hardcoded in code',
    });
    return;
  }

  if (!(raw.AI_DEFAULT_MODEL_ALIAS in aliases)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AI_DEFAULT_MODEL_ALIAS"],
      message: `"${raw.AI_DEFAULT_MODEL_ALIAS}" is not defined in AI_MODEL_ALIASES (defined: ${Object.keys(aliases).join(", ")})`,
    });
  }

  for (const [alias, spec] of Object.entries(aliases)) {
    if (!configuredProviders.has(spec.provider)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_MODEL_ALIASES", alias, "provider"],
        message: `provider "${spec.provider}" has no configured credentials`,
      });
    }
  }

  for (const alias of raw.AI_CLIENT_SELECTABLE_ALIASES) {
    if (!(alias in aliases)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AI_CLIENT_SELECTABLE_ALIASES"],
        message: `"${alias}" is not defined in AI_MODEL_ALIASES`,
      });
    }
  }

  if (raw.SEARCH_MODE === "native") {
    const toolIds = raw.SEARCH_NATIVE_TOOL_IDS ?? {};
    for (const provider of configuredProviders) {
      if (!toolIds[provider]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SEARCH_NATIVE_TOOL_IDS"],
          message: `missing native web-search tool id for configured provider "${provider}" (SEARCH_MODE=native)`,
        });
      }
    }
  }

  if (raw.SEARCH_MODE === "external" && !raw.SEARCH_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SEARCH_API_KEY"],
      message: "is required when SEARCH_MODE=external",
    });
  }

  if (raw.AGENT_STEP_TIMEOUT_MS > raw.AGENT_TOTAL_TIMEOUT_MS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AGENT_STEP_TIMEOUT_MS"],
      message: "must not exceed AGENT_TOTAL_TIMEOUT_MS",
    });
  }

  if (raw.REQUEST_TIMEOUT_MS < raw.AGENT_TOTAL_TIMEOUT_MS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REQUEST_TIMEOUT_MS"],
      message: "must be >= AGENT_TOTAL_TIMEOUT_MS, otherwise streams are cut off mid-answer",
    });
  }
});

export type RawEnv = z.infer<typeof rawEnvSchema>;

export function mapRawEnvToAppConfig(raw: RawEnv): AppConfig {
  const providers: Record<string, { apiKey: string; baseURL?: string }> = {};
  if (raw.OPENAI_API_KEY) {
    providers.openai = { apiKey: raw.OPENAI_API_KEY, baseURL: raw.OPENAI_BASE_URL };
  }
  if (raw.ANTHROPIC_API_KEY) {
    providers.anthropic = { apiKey: raw.ANTHROPIC_API_KEY, baseURL: raw.ANTHROPIC_BASE_URL };
  }

  const modelAliases = raw.AI_MODEL_ALIASES ?? {};
  const selectableAliases =
    raw.AI_CLIENT_SELECTABLE_ALIASES.length > 0
      ? raw.AI_CLIENT_SELECTABLE_ALIASES
      : Object.keys(modelAliases);

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
      modelAliases,
      defaultAlias: raw.AI_DEFAULT_MODEL_ALIAS,
      clientSelectableAliases: selectableAliases,
      agent: {
        maxSteps: raw.AGENT_MAX_STEPS,
        maxSearches: raw.AGENT_MAX_SEARCHES,
        totalTimeoutMs: raw.AGENT_TOTAL_TIMEOUT_MS,
        stepTimeoutMs: raw.AGENT_STEP_TIMEOUT_MS,
        maxOutputTokens: raw.AGENT_MAX_OUTPUT_TOKENS,
        historyWindowMessages: raw.AGENT_HISTORY_WINDOW,
        maxInputChars: raw.AGENT_MAX_INPUT_CHARS,
      },
    },
    search: {
      mode: raw.SEARCH_MODE,
      native: {
        toolIdByProvider: raw.SEARCH_NATIVE_TOOL_IDS ?? {},
        maxUses: raw.SEARCH_MAX_USES,
        allowedDomains: raw.SEARCH_ALLOWED_DOMAINS.length > 0 ? raw.SEARCH_ALLOWED_DOMAINS : undefined,
        blockedDomains: raw.SEARCH_BLOCKED_DOMAINS.length > 0 ? raw.SEARCH_BLOCKED_DOMAINS : undefined,
        userLocation: raw.SEARCH_USER_LOCATION,
      },
      external:
        raw.SEARCH_MODE === "external"
          ? {
              clientId: raw.SEARCH_CLIENT,
              apiKey: raw.SEARCH_API_KEY ?? "",
              baseUrl: raw.SEARCH_BASE_URL,
              maxResults: raw.SEARCH_MAX_RESULTS,
              timeoutMs: raw.SEARCH_TIMEOUT_MS,
              cacheTtlMs: raw.SEARCH_CACHE_TTL_MS,
            }
          : undefined,
    },
    cache: {
      enabled: raw.CACHE_ENABLED,
      maxEntries: raw.CACHE_MAX_ENTRIES,
    },
    rateLimit: {
      chat: { windowMs: raw.RATE_LIMIT_CHAT_WINDOW_MS, max: raw.RATE_LIMIT_CHAT_MAX },
      read: { windowMs: raw.RATE_LIMIT_READ_WINDOW_MS, max: raw.RATE_LIMIT_READ_MAX },
    },
    observability: {
      logLevel: raw.LOG_LEVEL,
      telemetryEnabled: raw.TELEMETRY_ENABLED,
      serviceName: raw.SERVICE_NAME,
    },
    chat: {
      suggestions: raw.CHAT_SUGGESTIONS,
      defaultLocale: raw.CHAT_DEFAULT_LOCALE,
    },
    features: raw.FEATURE_FLAGS ?? {},
  };
}
