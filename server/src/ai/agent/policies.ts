import { stepCountIs } from "ai";
import { AgentConfig } from "../../config/config.types.js";

export function createAgentPolicies(config: AgentConfig) {
  return {
    stopWhen: [stepCountIs(config.maxSteps)],
    maxOutputTokens: config.maxOutputTokens,
  };
}
