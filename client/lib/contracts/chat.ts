import type { UIDataTypes, UIMessage } from "ai";

/**
 * Client-side mirror of the agent's UI message type.
 *
 * INTENTIONAL DUPLICATION. The server derives its type from the agent itself:
 *
 *   type WeatherUIMessage = InferAgentUIMessage<WeatherAgent, ChatMessageMetadata>
 *
 * There is no shared package between `client/` and `server/` yet, so the client
 * restates the minimum it needs in order to render: the metadata fields and the
 * one tool the agent owns. If the server's metadata or tool set changes, this
 * file must change with it. Keep it minimal — everything the UI actually draws
 * (text, citations, search progress) comes from the SDK's normalized part types,
 * not from anything provider-specific.
 */

/** Per-message provenance attached by the server on stream finish. */
export interface ChatMessageMetadata {
  readonly modelAlias?: string;
  readonly providerId?: string;
  readonly searchCount?: number;
  readonly durationMs?: number;
}

/**
 * The part type the SDK emits for the agent's single tool: `tool-` prefixed onto
 * the tool's registry key (`web_search`).
 */
export const WEB_SEARCH_PART_TYPE = "tool-web_search";

export interface WebSearchToolInput {
  readonly query?: string;
}

export type WeatherChatTools = {
  web_search: {
    input: WebSearchToolInput;
    /**
     * Deliberately `unknown`. Provider output shapes diverge — OpenAI returns
     * `{ action, sources[] }`, Anthropic returns `web_search_result[]` carrying
     * an `encryptedContent` blob — and the UI must never render it. Citations
     * are read from the normalized `source-url` parts instead.
     */
    output: unknown;
  };
};

export type WeatherUIMessage = UIMessage<ChatMessageMetadata, UIDataTypes, WeatherChatTools>;

export type WeatherUIMessagePart = WeatherUIMessage["parts"][number];

export type WebSearchToolPart = Extract<WeatherUIMessagePart, { type: typeof WEB_SEARCH_PART_TYPE }>;

export type SourceUrlPart = Extract<WeatherUIMessagePart, { type: "source-url" }>;

/** Body of `POST /api/chat`, minus `messages` which the transport supplies. */
export interface ChatRequestContext {
  readonly modelAlias?: string;
  readonly locale?: string;
  readonly timezone?: string;
}
