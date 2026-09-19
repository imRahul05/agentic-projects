import { z } from "zod";
import type { AppConfig, SearchMode } from "./config.types.js";
import {
  AGENT_DEFAULTS,
  CHAT_DEFAULTS,
  NATIVE_SEARCH_TOOL_IDS,
  PROVIDER_IDS,
  SEARCH_DEFAULTS,
  type ProviderId,
} from "./ai.constants.js";
import {
  CLIENT_SELECTABLE_ALIASES,
  DEFAULT_MODEL_ALIAS,
  getModelCatalog,
  validateModelCatalog,
} from "./ai-models.config.js";

/**
 * The environment carries secrets and deployment-specific infrastructure only.
 * Model identifiers, provider ids, native tool versions and agent budgets live
 * in `ai.constants.ts` / `ai-models.config.ts` so they are reviewable in a diff.
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

  // HTTP / infrastructure
  PORT: integerFromString(8080, { min: 1, max: 65535 }),
  API_BASE_PATH: z.string().default("/api"),
  CORS_ORIGINS: csvList("http://localhost:3000"),
  TRUST_PROXY: trustProxySchema,
  BODY_LIMIT_BYTES: integerFromString(262144, { min: 1024 }),
  REQUEST_TIMEOUT_MS: integerFromString(90000, { min: 1000 }),

  // Secrets
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  /** Only needed when the search mode in ai.constants.ts is `external`. */
  SEARCH_API_KEY: z.string().optional(),
  SEARCH_BASE_URL: z.string().url().optional(),

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
});

/**
 * Cross-checks between the environment and the versioned AI config. Every
 * violation is reported, so a bad deployment learns all of its problems at once.
 */
export const rawEnvSchema = baseEnvSchema.superRefine((raw, ctx) => {
  for (const issue of validateModelCatalog()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message });
  }

  const configuredProviders = new Set<ProviderId>();
  if (raw.OPENAI_API_KEY) configuredProviders.add(PROVIDER_IDS.openai);
  if (raw.ANTHROPIC_API_KEY) configuredProviders.add(PROVIDER_IDS.anthropic);

  if (configuredProviders.size === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OPENAI_API_KEY"],
      message: "at least one model provider key is required (OPENAI_API_KEY or ANTHROPIC_API_KEY)",
    });
  }

  // An alias is only usable if its provider has credentials in this environment.
  for (const [alias, spec] of Object.entries(getModelCatalog())) {
    if (!configuredProviders.has(spec.provider as ProviderId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MODEL_CATALOG", alias],
        message: `alias "${alias}" needs provider "${spec.provider}", which has no API key configured`,
      });
    }
  }

  if (SEARCH_DEFAULTS.mode === "native") {
    for (const provider of configuredProviders) {
      if (!NATIVE_SEARCH_TOOL_IDS[provider]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["NATIVE_SEARCH_TOOL_IDS"],
          message: `missing native web-search tool id for configured provider "${provider}"`,
        });
      }
    }
  }

  if (SEARCH_DEFAULTS.mode === "external" && !raw.SEARCH_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SEARCH_API_KEY"],
      message: "is required when the search mode in ai.constants.ts is `external`",
    });
  }

  if (raw.REQUEST_TIMEOUT_MS < AGENT_DEFAULTS.totalTimeoutMs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REQUEST_TIMEOUT_MS"],
      message: `must be >= AGENT_DEFAULTS.totalTimeoutMs (${AGENT_DEFAULTS.totalTimeoutMs}), otherwise streams are cut off mid-answer`,
    });
  }
});

export type RawEnv = z.infer<typeof rawEnvSchema>;

export function mapRawEnvToAppConfig(raw: RawEnv): AppConfig {
  const providers: Record<string, { apiKey: string; baseURL?: string }> = {};
  if (raw.OPENAI_API_KEY) {
    providers[PROVIDER_IDS.openai] = { apiKey: raw.OPENAI_API_KEY, baseURL: raw.OPENAI_BASE_URL };
  }
  if (raw.ANTHROPIC_API_KEY) {
    providers[PROVIDER_IDS.anthropic] = { apiKey: raw.ANTHROPIC_API_KEY, baseURL: raw.ANTHROPIC_BASE_URL };
  }

  const searchMode: SearchMode = SEARCH_DEFAULTS.mode;

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
      modelAliases: getModelCatalog(),
      defaultAlias: DEFAULT_MODEL_ALIAS,
      clientSelectableAliases: CLIENT_SELECTABLE_ALIASES,
      agent: {
        maxSteps: AGENT_DEFAULTS.maxSteps,
        maxSearches: AGENT_DEFAULTS.maxSearches,
        totalTimeoutMs: AGENT_DEFAULTS.totalTimeoutMs,
        stepTimeoutMs: AGENT_DEFAULTS.stepTimeoutMs,
        maxOutputTokens: AGENT_DEFAULTS.maxOutputTokens,
        historyWindowMessages: AGENT_DEFAULTS.historyWindowMessages,
        maxInputChars: AGENT_DEFAULTS.maxInputChars,
      },
    },
    search: {
      mode: searchMode,
      native: {
        toolIdByProvider: NATIVE_SEARCH_TOOL_IDS,
        maxUses: SEARCH_DEFAULTS.maxUses,
        allowedDomains: SEARCH_DEFAULTS.allowedDomains.length > 0 ? SEARCH_DEFAULTS.allowedDomains : undefined,
        blockedDomains: SEARCH_DEFAULTS.blockedDomains.length > 0 ? SEARCH_DEFAULTS.blockedDomains : undefined,
        userLocation: SEARCH_DEFAULTS.userLocation,
      },
      external:
        searchMode === "external"
          ? {
              clientId: SEARCH_DEFAULTS.clientId,
              apiKey: raw.SEARCH_API_KEY ?? "",
              baseUrl: raw.SEARCH_BASE_URL,
              maxResults: SEARCH_DEFAULTS.maxResults,
              timeoutMs: SEARCH_DEFAULTS.timeoutMs,
              cacheTtlMs: SEARCH_DEFAULTS.cacheTtlMs,
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
      suggestions: CHAT_DEFAULTS.suggestions,
      defaultLocale: CHAT_DEFAULTS.defaultLocale,
    },
    features: {},
  };
}
