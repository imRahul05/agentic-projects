import { describe, expect, it } from "vitest";
import { createReasoningProviderOptions } from "./policies.js";
import { PROVIDER_IDS, REASONING_DEFAULTS } from "../../config/ai.constants.js";

describe("createReasoningProviderOptions", () => {
  it("asks OpenAI for a reasoning summary, which is what gives the thinking UI content", () => {
    const options = createReasoningProviderOptions(PROVIDER_IDS.openai);

    expect(options?.openai?.reasoningSummary).toBe(REASONING_DEFAULTS.openai.summary);
  });

  it("omits the effort setting so the provider default applies unless one is configured", () => {
    const options = createReasoningProviderOptions(PROVIDER_IDS.openai);

    if (REASONING_DEFAULTS.openai.effort === undefined) {
      expect(options?.openai).not.toHaveProperty("reasoningEffort");
    } else {
      expect(options?.openai?.reasoningEffort).toBe(REASONING_DEFAULTS.openai.effort);
    }
  });

  it("leaves Anthropic extended thinking off by default", () => {
    // Enabling it constrains maxOutputTokens and other call settings, so it is
    // opt-in rather than a surprise at the first Claude request.
    expect(REASONING_DEFAULTS.anthropic.enabled).toBe(false);
    expect(createReasoningProviderOptions(PROVIDER_IDS.anthropic)).toBeUndefined();
  });

  it("returns nothing for an unknown provider rather than inventing settings", () => {
    expect(createReasoningProviderOptions("not-a-provider")).toBeUndefined();
  });
});
