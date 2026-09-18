import { stepCountIs, type StopCondition } from "ai";
import type { AgentConfig } from "../../config/config.types.js";
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
