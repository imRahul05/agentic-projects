import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";
import { AGENT_DEFAULTS, CHAT_DEFAULTS, NATIVE_SEARCH_TOOL_IDS, PROVIDER_IDS, SEARCH_DEFAULTS } from "./ai.constants.js";
import {
  CLIENT_SELECTABLE_ALIASES,
  DEFAULT_MODEL_ALIAS,
  MODEL_CATALOG,
  validateModelCatalog,
} from "./ai-models.config.js";

/**
 * The environment now carries secrets and infrastructure only. Model ids,
 * provider identity, native tool versions and agent budgets come from the
 * versioned AI config files, so these tests cover the seam between the two.
 */
const validEnv: Readonly<Record<string, string>> = {
  NODE_ENV: "test",
  ANTHROPIC_API_KEY: "anthropic-test-key",
};

function envWith(overrides: Readonly<Record<string, string>>): Record<string, string> {
  return { ...validEnv, ...overrides };
}

function issuesFor(env: Readonly<Record<string, string>>): readonly string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.issues;
    throw error;
  }
  throw new Error("expected loadConfig to throw a ConfigError");
}

describe("AI config files", () => {
  it("ships a catalog that validates", () => {
    expect(validateModelCatalog()).toEqual([]);
  });

  it("defines the default alias and every selectable alias in the catalog", () => {
    expect(Object.keys(MODEL_CATALOG)).toContain(DEFAULT_MODEL_ALIAS);
    for (const alias of CLIENT_SELECTABLE_ALIASES) {
      expect(Object.keys(MODEL_CATALOG)).toContain(alias);
    }
  });

  it("gives every configured provider a native web-search tool id", () => {
    for (const providerId of Object.values(PROVIDER_IDS)) {
      expect(NATIVE_SEARCH_TOOL_IDS[providerId]).toBeTruthy();
    }
  });

  it("keeps the per-step budget inside the whole-request budget", () => {
    expect(AGENT_DEFAULTS.stepTimeoutMs).toBeLessThanOrEqual(AGENT_DEFAULTS.totalTimeoutMs);
  });
});

describe("loadConfig", () => {
  it("maps a valid environment into the application config", () => {
    const config = loadConfig(validEnv);

    expect(config.env).toBe("test");
    expect(config.http.port).toBe(8080);
    expect(config.http.basePath).toBe("/api");
    expect(config.ai.providers.anthropic?.apiKey).toBe("anthropic-test-key");
    expect(config.cache.enabled).toBe(true);
  });

  it("sources the model catalog from the config file, not the environment", () => {
    const config = loadConfig(validEnv);

    expect(config.ai.defaultAlias).toBe(DEFAULT_MODEL_ALIAS);
    expect(Object.keys(config.ai.modelAliases)).toEqual(Object.keys(MODEL_CATALOG));
    expect(config.ai.clientSelectableAliases).toEqual(CLIENT_SELECTABLE_ALIASES);
  });

  it("ignores model identifiers supplied through the environment", () => {
    const config = loadConfig(
      envWith({
        AI_MODEL_ALIASES: JSON.stringify({ sneaky: { provider: "anthropic", model: "x", label: "X" } }),
        AI_DEFAULT_MODEL_ALIAS: "sneaky",
      }),
    );

    expect(config.ai.defaultAlias).toBe(DEFAULT_MODEL_ALIAS);
    expect(Object.keys(config.ai.modelAliases)).not.toContain("sneaky");
  });

  it("sources agent budgets and search settings from the config files", () => {
    const config = loadConfig(envWith({ AGENT_MAX_STEPS: "99", SEARCH_MODE: "external" }));

    expect(config.ai.agent.maxSteps).toBe(AGENT_DEFAULTS.maxSteps);
    expect(config.ai.agent.maxSearches).toBe(AGENT_DEFAULTS.maxSearches);
    expect(config.search.mode).toBe(SEARCH_DEFAULTS.mode);
    expect(config.search.native.toolIdByProvider).toEqual(NATIVE_SEARCH_TOOL_IDS);
  });

  it("serves chat copy from the config file", () => {
    const config = loadConfig(validEnv);

    expect(config.chat.suggestions).toEqual(CHAT_DEFAULTS.suggestions);
    expect(config.chat.defaultLocale).toBe(CHAT_DEFAULTS.defaultLocale);
  });

  it("still reads infrastructure from the environment", () => {
    const config = loadConfig(envWith({ PORT: "9123", CORS_ORIGINS: "https://a.test, https://b.test" }));

    expect(config.http.port).toBe(9123);
    expect(config.http.corsOrigins).toEqual(["https://a.test", "https://b.test"]);
  });

  it("refuses to boot without any provider credentials", () => {
    const issues = issuesFor({ NODE_ENV: "test" });
    expect(issues.join("\n")).toMatch(/at least one model provider key is required/);
  });

  it("rejects a catalog alias whose provider has no key in this environment", () => {
    // The shipped catalog is Anthropic-only, so an OpenAI-only environment
    // leaves every alias uncredentialed.
    const issues = issuesFor({ NODE_ENV: "test", OPENAI_API_KEY: "openai-test-key" });
    expect(issues.join("\n")).toMatch(/needs provider "anthropic", which has no API key configured/);
  });

  it("rejects a request timeout that would truncate a stream", () => {
    const issues = issuesFor(envWith({ REQUEST_TIMEOUT_MS: "2000" }));
    expect(issues.join("\n")).toMatch(/must be >= AGENT_DEFAULTS\.totalTimeoutMs/);
  });

  it("reports every problem at once rather than the first", () => {
    const issues = issuesFor({ NODE_ENV: "test", REQUEST_TIMEOUT_MS: "2000" });
    expect(issues.length).toBeGreaterThan(1);
  });

  it("rejects a malformed integer", () => {
    const issues = issuesFor(envWith({ PORT: "not-a-port" }));
    expect(issues.join("\n")).toMatch(/PORT/);
  });

  it("reads only the environment it is given, never process.env", () => {
    const config = loadConfig(envWith({ SERVICE_NAME: "scoped-service" }));
    expect(config.observability.serviceName).toBe("scoped-service");
  });
});
