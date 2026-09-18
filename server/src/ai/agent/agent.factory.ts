import { ToolLoopAgent } from "ai";
import type { AgentConfig } from "../../config/config.types.js";
import type { Clock } from "../../platform/clock.js";
import type { Logger } from "../../platform/logging/logger.port.js";
import type { ModelResolver, ResolvedModel } from "../provider/model-resolver.js";
import type { SearchToolFactory } from "../search/search-tool.factory.js";
import type { WeatherAgent } from "./agent.types.js";
import { renderInstructions } from "./instructions.js";
import { createAgentPolicies } from "./policies.js";

export interface AgentDeps {
  modelResolver: ModelResolver;
  searchTools: SearchToolFactory;
  agentConfig: AgentConfig;
  logger: Logger;
  clock: Clock;
}

export interface AgentRequest {
  modelAlias?: string;
  locale: string;
  timezone?: string;
}

export interface CreatedAgent {
  agent: WeatherAgent;
  /** Returned so the transport can report which model actually answered. */
  resolved: ResolvedModel;
}

/**
 * Builds a fresh agent per request. Nothing is memoized at module scope: the
 * instructions embed the current time and the caller's locale, so a cached
 * agent would answer "today" with yesterday's date.
 */
export function createWeatherAgent(deps: AgentDeps, req: AgentRequest): CreatedAgent {
  const resolved = deps.modelResolver.resolve(req.modelAlias);
  const tools = deps.searchTools.create({ providerId: resolved.providerId });
  const policies = createAgentPolicies(deps.agentConfig);

  const instructions = renderInstructions({
    now: deps.clock.now(),
    timezone: req.timezone,
    locale: req.locale,
    maxSearches: deps.agentConfig.maxSearches,
  });

  deps.logger.debug("weather agent created", {
    alias: resolved.alias,
    providerId: resolved.providerId,
    maxSteps: deps.agentConfig.maxSteps,
  });

  const agent = new ToolLoopAgent({
    model: resolved.model,
    instructions,
    tools,
    stopWhen: [...policies.stopWhen],
    maxOutputTokens: policies.maxOutputTokens,
  });

  return { agent, resolved };
}
