import { stepCountIs, type JSONValue, type StopCondition } from "ai";
import type { AgentConfig } from "../../config/config.types.js";
import { PROVIDER_IDS, REASONING_DEFAULTS } from "../../config/ai.constants.js";
import type { SearchToolSet } from "../search/search-tool.factory.js";

export interface AgentPolicies {
  /** Hard ceiling on tool-loop steps; the prompt's search budget sits under it. */
  readonly stopWhen: readonly StopCondition<SearchToolSet>[];
  readonly maxOutputTokens: number;
  /** Per-request budget for the whole run, applied by the caller of `generate`/`stream`. */
  readonly totalTimeoutMs: number;
  /** Per-step budget, applied by the caller of `generate`/`stream`. */
  readonly stepTimeoutMs: number;
}

export function createAgentPolicies(agent: AgentConfig): AgentPolicies {
  return {
    stopWhen: [stepCountIs(agent.maxSteps)],
    maxOutputTokens: agent.maxOutputTokens,
    totalTimeoutMs: agent.totalTimeoutMs,
    stepTimeoutMs: agent.stepTimeoutMs,
  };
}

/**
 * `ai` does not re-export `ProviderOptions`, so it is reconstructed from the
 * `JSONValue` it does export.
 */
export type ReasoningProviderOptions = Record<string, Record<string, JSONValue>>;

/**
 * Per-provider options that make the model emit its reasoning.
 *
 * The AI SDK forwards reasoning parts to the client on its own, but a provider
 * only produces them when asked, and each asks differently. Returning
 * `undefined` when nothing is enabled keeps the call settings clean.
 */
export function createReasoningProviderOptions(providerId: string): ReasoningProviderOptions | undefined {
  if (providerId === PROVIDER_IDS.openai && REASONING_DEFAULTS.openai.enabled) {
    const openai: Record<string, JSONValue> = { reasoningSummary: REASONING_DEFAULTS.openai.summary };
    if (REASONING_DEFAULTS.openai.effort !== undefined) {
      openai.reasoningEffort = REASONING_DEFAULTS.openai.effort;
    }
    return { openai };
  }

  if (providerId === PROVIDER_IDS.anthropic && REASONING_DEFAULTS.anthropic.enabled) {
    return {
      anthropic: {
        thinking: { type: "enabled", budgetTokens: REASONING_DEFAULTS.anthropic.budgetTokens },
      },
    };
  }

  return undefined;
}
