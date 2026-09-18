import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

/**
 * A minimal environment that must boot. Every test derives from it so a failure
 * points at the one field it changed.
 */
const validEnv: Readonly<Record<string, string>> = {
  NODE_ENV: "test",
  ANTHROPIC_API_KEY: "anthropic-test-key",
  AI_MODEL_ALIASES: JSON.stringify({
    default: { provider: "anthropic", model: "test-model-a", label: "Balanced" },
    fast: { provider: "anthropic", model: "test-model-b", label: "Fast" },
  }),
  AI_DEFAULT_MODEL_ALIAS: "default",
  SEARCH_NATIVE_TOOL_IDS: JSON.stringify({ anthropic: "webSearch_test" }),
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

describe("loadConfig", () => {
  it("maps a valid environment into the application config", () => {
    const config = loadConfig(validEnv);

    expect(config.env).toBe("test");
    expect(config.http.port).toBe(8080);
    expect(config.http.basePath).toBe("/api");
    expect(config.ai.defaultAlias).toBe("default");
    expect(config.ai.providers.anthropic?.apiKey).toBe("anthropic-test-key");
    expect(config.search.mode).toBe("native");
    expect(config.search.native.toolIdByProvider.anthropic).toBe("webSearch_test");
    expect(config.cache.enabled).toBe(true);
    expect(config.chat.suggestions.length).toBeGreaterThan(0);
  });

  it("defaults the selectable aliases to every defined alias", () => {
    const config = loadConfig(validEnv);
    expect([...config.ai.clientSelectableAliases].sort()).toEqual(["default", "fast"]);
  });

  it("honours an explicit selectable alias list", () => {
    const config = loadConfig(envWith({ AI_CLIENT_SELECTABLE_ALIASES: "fast" }));
    expect(config.ai.clientSelectableAliases).toEqual(["fast"]);
  });

  it("reads only the environment it is given, never process.env", () => {
    const config = loadConfig(envWith({ PORT: "9123" }));
    expect(config.http.port).toBe(9123);
  });

  it("fails when no provider credentials are configured", () => {
    const { ANTHROPIC_API_KEY: _removed, ...withoutKey } = validEnv;
    const issues = issuesFor(withoutKey);
    expect(issues.join("\n")).toContain("at least one model provider key is required");
  });

  it("fails when the model alias map is missing", () => {
    const { AI_MODEL_ALIASES: _removed, ...withoutAliases } = validEnv;
    const issues = issuesFor(withoutAliases);
    expect(issues.join("\n")).toContain("AI_MODEL_ALIASES");
  });

  it("fails when the alias map is not valid JSON", () => {
    const issues = issuesFor(envWith({ AI_MODEL_ALIASES: "{not json" }));
    expect(issues.join("\n")).toContain("must be valid JSON");
  });

  it("fails when the default alias is not defined", () => {
    const issues = issuesFor(envWith({ AI_DEFAULT_MODEL_ALIAS: "nope" }));
    expect(issues.join("\n")).toContain("not defined in AI_MODEL_ALIASES");
  });

  it("fails when an alias names a provider without credentials", () => {
    const issues = issuesFor(
      envWith({
        AI_MODEL_ALIASES: JSON.stringify({
          default: { provider: "openai", model: "test-model-a", label: "Balanced" },
        }),
      }),
    );
    expect(issues.join("\n")).toContain('provider "openai" has no configured credentials');
  });

  it("fails when native search has no tool id for a configured provider", () => {
    const { SEARCH_NATIVE_TOOL_IDS: _removed, ...withoutToolIds } = validEnv;
    const issues = issuesFor(withoutToolIds);
    expect(issues.join("\n")).toContain("missing native web-search tool id");
  });

  it("fails when external search has no api key", () => {
    const issues = issuesFor(envWith({ SEARCH_MODE: "external", SEARCH_API_KEY: "" }));
    expect(issues.join("\n")).toContain("required when SEARCH_MODE=external");
  });

  it("fails when the step timeout exceeds the total agent timeout", () => {
    const issues = issuesFor(
      envWith({ AGENT_STEP_TIMEOUT_MS: "70000", AGENT_TOTAL_TIMEOUT_MS: "60000" }),
    );
    expect(issues.join("\n")).toContain("must not exceed AGENT_TOTAL_TIMEOUT_MS");
  });

  it("fails when the http request timeout would cut a stream short", () => {
    const issues = issuesFor(
      envWith({ REQUEST_TIMEOUT_MS: "30000", AGENT_TOTAL_TIMEOUT_MS: "60000" }),
    );
    expect(issues.join("\n")).toContain("streams are cut off mid-answer");
  });

  it("reports every problem at once rather than the first", () => {
    const issues = issuesFor(
      envWith({ AI_DEFAULT_MODEL_ALIAS: "nope", REQUEST_TIMEOUT_MS: "1000" }),
    );
    expect(issues.length).toBeGreaterThan(1);
  });

  it("puts the issues in the error message so a failed boot is self-explaining", () => {
    const env = envWith({ AI_DEFAULT_MODEL_ALIAS: "nope" });
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/not defined in AI_MODEL_ALIASES/);
  });

  it("rejects a malformed integer instead of falling back to a default", () => {
    const issues = issuesFor(envWith({ PORT: "eight-thousand" }));
    expect(issues.join("\n")).toContain("expected an integer");
  });

  it("rejects an out-of-range trust proxy value", () => {
    const issues = issuesFor(envWith({ TRUST_PROXY: "maybe" }));
    expect(issues.join("\n")).toContain("TRUST_PROXY");
  });
});
