import type { InferAgentUIMessage, ToolLoopAgent } from "ai";
import type { SearchToolSet } from "../search/search-tool.factory.js";

/** Per-message metadata the stream attaches so the client can show provenance. */
export interface ChatMessageMetadata {
  readonly modelAlias?: string;
  readonly providerId?: string;
  readonly searchCount?: number;
  readonly durationMs?: number;
}

/**
 * One agent, one tool. `CALL_OPTIONS` is `never` because everything the request
 * varies (model, locale, timezone) is baked in when the agent is constructed.
 */
export type WeatherAgent = ToolLoopAgent<never, SearchToolSet>;

export type WeatherUIMessage = InferAgentUIMessage<WeatherAgent, ChatMessageMetadata>;
