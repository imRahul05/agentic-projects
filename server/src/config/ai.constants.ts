import type { SearchMode } from "./config.types.js";

/**
 * Centralised AI constants.
 *
 * Everything here is non-secret catalog data that belongs in version control:
 * provider identifiers, the tool name the agent exposes, the provider-native
 * web-search tool versions, and the default agent budgets. Secrets (API keys,
 * base URLs) stay in the environment — see `.env.example`.
 *
 * This is the single source of truth. Nothing in `src/ai/**` or `src/http/**`
 * should redeclare any of these values.
 */

/** Provider identifiers. These are the keys used in the model registry. */
export const PROVIDER_IDS = {
  openai: "openai",
  anthropic: "anthropic",
} as const;

export type ProviderId = (typeof PROVIDER_IDS)[keyof typeof PROVIDER_IDS];

export const ALL_PROVIDER_IDS: readonly ProviderId[] = Object.values(PROVIDER_IDS);

export function isProviderId(value: string): value is ProviderId {
  return ALL_PROVIDER_IDS.includes(value as ProviderId);
}

/** Separator used by the AI SDK provider registry for `provider:model` refs. */
export const REGISTRY_SEPARATOR = ":";

/** The one tool this agent exposes. One agent, one tool. */
export const WEB_SEARCH_TOOL_NAME = "web_search";

/**
 * Provider-native web-search tool ids, per provider.
 *
 * These are versioned by the providers themselves — Anthropic ships dated
 * identifiers such as `webSearch_20260318` — so upgrading is a one-line change
 * here rather than a hunt through the search layer. The id is looked up on the
 * provider instance at runtime and fails loudly if it is not present.
 */
export const NATIVE_SEARCH_TOOL_IDS: Readonly<Record<ProviderId, string>> = {
  [PROVIDER_IDS.openai]: "webSearch",
  [PROVIDER_IDS.anthropic]: "webSearch_20260318",
};

/**
 * Agent budgets. With no authentication these are the real cost controls, so
 * they are deliberately conservative.
 */
export const AGENT_DEFAULTS = {
  /** Hard cap on tool-loop steps. */
  maxSteps: 5,
  /** How many searches the instructions permit per answer. */
  maxSearches: 3,
  /** Whole-request deadline. */
  totalTimeoutMs: 60_000,
  /** Per-step deadline. */
  stepTimeoutMs: 30_000,
  maxOutputTokens: 1024,
  /** Messages retained from the client-held history. */
  historyWindowMessages: 10,
  /** Upper bound on the serialized inbound message payload. */
  maxInputChars: 4_000,
} as const;

/** Web-search behaviour that is not a secret. */
export const SEARCH_DEFAULTS = {
  /**
   * `native`   — the model provider runs and cites the search (no extra key).
   * `external` — our own tool over a search API (portable, offline-testable).
   *
   * Annotated as `SearchMode` rather than inferred, so flipping this value is a
   * one-line edit that keeps both branches type-checked.
   */
  mode: "native" as SearchMode,
  /** Honoured by Anthropic; OpenAI's budget rides on the prompt + step cap. */
  maxUses: 3,
  /** Optional quality lever: restrict search to trusted weather sources. */
  allowedDomains: [] as readonly string[],
  blockedDomains: [] as readonly string[],
  /** Optional geographic bias for ambiguous place names. */
  userLocation: undefined as
    | { readonly country?: string; readonly region?: string; readonly city?: string; readonly timezone?: string }
    | undefined,
  /** External-mode client id; the key itself comes from the environment. */
  clientId: "fake",
  maxResults: 5,
  timeoutMs: 10_000,
  cacheTtlMs: 300_000,
} as const;

/**
 * Reasoning ("thinking") output.
 *
 * The AI SDK streams reasoning parts to the client by default, but a provider
 * only emits them if asked. OpenAI's reasoning models return a summary when
 * `reasoningSummary` is set; every model in the catalog is a reasoning model,
 * so this is on.
 *
 * Anthropic extended thinking is off by default on purpose: it requires a token
 * budget below maxOutputTokens and constrains other call settings, so it is
 * opt-in rather than a surprise at the first Claude request.
 */
export const REASONING_DEFAULTS = {
  openai: {
    enabled: true,
    /** "auto" | "concise" | "detailed" */
    summary: "auto",
    /** Left undefined so the provider's own default applies. */
    effort: undefined as "low" | "medium" | "high" | undefined,
  },
  anthropic: {
    enabled: false,
    budgetTokens: 2_048,
  },
} as const;

/** Chat surface copy, served through /api/capabilities so the client hardcodes nothing. */
export const CHAT_DEFAULTS = {
  defaultLocale: "en-US",
  suggestions: [
    "What's the weather in Lisbon right now?",
    "Will it rain in Tokyo tomorrow?",
    "Do I need a jacket in Berlin today?",
  ] as readonly string[],
} as const;
