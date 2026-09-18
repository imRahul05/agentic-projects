import { describe, expect, it } from "vitest";
import type { AiConfig } from "../../config/config.types.js";
import { AppError } from "../../platform/errors/app-error.js";
import { createModelResolver } from "./model-resolver.js";
import { createLlmRegistry } from "./provider-registry.js";

const OPENAI_KEY = "sk-test-openai-key";
const FAST_MODEL_ID = "model-id-that-must-not-leak";

const aiConfig: AiConfig = {
  providers: { openai: { apiKey: OPENAI_KEY } },
  modelAliases: {
    fast: {
      provider: "openai",
      model: FAST_MODEL_ID,
      label: "Fast",
      description: "Quick answers",
    },
    deep: { provider: "openai", model: "another-model-id", label: "Deep" },
    uncredentialed: { provider: "anthropic", model: "third-model-id", label: "Other" },
  },
  defaultAlias: "fast",
  clientSelectableAliases: ["fast", "deep"],
  agent: {
    maxSteps: 4,
    maxSearches: 2,
    totalTimeoutMs: 30_000,
    stepTimeoutMs: 10_000,
    maxOutputTokens: 512,
    historyWindowMessages: 10,
    maxInputChars: 2_000,
  },
};

function resolverFor(config: AiConfig = aiConfig) {
  return createModelResolver(config, createLlmRegistry(config));
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return AppError.isAppError(error) ? error.code : `unexpected:${String(error)}`;
  }
  return "no-error";
}

describe("createModelResolver", () => {
  it("resolves the default alias when none is requested", () => {
    const resolved = resolverFor().resolve();

    expect(resolved.alias).toBe("fast");
    expect(resolved.providerId).toBe("openai");
    expect(resolved.spec.model).toBe(FAST_MODEL_ID);
    expect(resolved.model).toBeDefined();
  });

  it("resolves an explicitly requested alias", () => {
    const resolved = resolverFor().resolve("deep");

    expect(resolved.alias).toBe("deep");
    expect(resolved.spec.label).toBe("Deep");
  });

  it("rejects an unknown alias instead of substituting a model", () => {
    expect(codeOf(() => resolverFor().resolve("does-not-exist"))).toBe("MODEL_UNAVAILABLE");
  });

  it("rejects an alias whose provider has no credentials", () => {
    expect(codeOf(() => resolverFor().resolve("uncredentialed"))).toBe("MODEL_UNAVAILABLE");
  });

  it("lists only client-selectable aliases and leaks no model ids or keys", () => {
    const listed = resolverFor().listSelectable();

    expect(listed.map((info) => info.alias)).toEqual(["fast", "deep"]);

    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain(FAST_MODEL_ID);
    expect(serialized).not.toContain("another-model-id");
    expect(serialized).not.toContain(OPENAI_KEY);
  });
});
