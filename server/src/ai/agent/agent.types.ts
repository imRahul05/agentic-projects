import { InferAgentUIMessage, ToolLoopAgent } from "ai";
import { WeatherToolSet } from "../tools/tool-registry.js";
import { ToolContext } from "../tools/tool-context.js";

export interface ChatMessageMetadata {
  readonly modelAlias?: string;
  readonly providerId?: string;
  readonly durationMs?: number;
}

export type WeatherAgent = ToolLoopAgent<never, WeatherToolSet, ToolContext>;
export type WeatherUIMessage = InferAgentUIMessage<WeatherAgent, ChatMessageMetadata>;
