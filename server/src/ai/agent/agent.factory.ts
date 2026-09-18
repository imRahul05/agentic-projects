import { ToolLoopAgent } from "ai";
import { AiConfig, UnitSystem } from "../../config/config.types.js";
import { Clock } from "../../platform/clock.js";
import { ModelResolver } from "../provider/model-resolver.js";
import { ToolContext } from "../tools/tool-context.js";
import { createWeatherTools } from "../tools/tool-registry.js";
import { WeatherAgent } from "./agent.types.js";
import { buildSystemInstructions } from "./instructions.js";
import { createAgentPolicies } from "./policies.js";

export interface AgentDeps {
  readonly modelResolver: ModelResolver;
  readonly config: AiConfig;
  readonly clock: Clock;
}

export interface AgentRequestOptions {
  readonly modelAlias?: string;
  readonly units: UnitSystem;
  readonly locale?: string;
  readonly timezone?: string;
  readonly toolContext: ToolContext;
}

export function createWeatherAgent(deps: AgentDeps, req: AgentRequestOptions): WeatherAgent {
  const resolved = deps.modelResolver.resolve(req.modelAlias);
  const tools = createWeatherTools();
  const policies = createAgentPolicies(deps.config.agent);

  const instructions = buildSystemInstructions({
    units: req.units,
    locale: req.locale || "en-US",
    timezone: req.timezone,
    now: deps.clock.now(),
  });

  return new ToolLoopAgent({
    model: resolved.model,
    instructions,
    tools,
    toolsContext: {
      search_location: req.toolContext,
      get_current_weather: req.toolContext,
      get_forecast: req.toolContext,
      compare_weather: req.toolContext,
    },
    stopWhen: policies.stopWhen,
    maxOutputTokens: policies.maxOutputTokens,
  });
}
