"use client";

import { CloudSun, FileText, Paperclip } from "lucide-react";
import { Fragment, useMemo, type ReactNode } from "react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { AgentActivity } from "@/components/chat/agent-activity";
import { SourcesList } from "@/components/chat/sources-list";
import {
  WEB_SEARCH_PART_TYPE,
  type SourceUrlPart,
  type WeatherUIMessage,
  type WeatherUIMessagePart,
  type WebSearchToolPart,
} from "@/lib/contracts/chat";

function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds).toString()}s`;
}

/**
 * Exhaustive render of one *body* part — the things that belong in the answer
 * itself. Reasoning, `web_search` activity and citations are grouped out of the
 * stream order by {@link MessageItem} and rendered by their own components, so
 * their branches here return nothing.
 *
 * The `default` branch also renders nothing: a part shape we do not understand
 * is dropped rather than dumped at the reader as JSON.
 */
function MessagePart({ part }: { readonly part: WeatherUIMessagePart }): ReactNode {
  switch (part.type) {
    case "text":
      if (part.text.length === 0) {
        return null;
      }
      return <MessageResponse className="w-full">{part.text}</MessageResponse>;

    case "source-document":
      return (
        <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
          <FileText className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{part.title}</span>
        </div>
      );

    case "file":
      return (
        <a
          href={part.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{part.filename ?? part.mediaType}</span>
        </a>
      );

    // Grouped and rendered above, by `Reasoning`, `AgentActivity` and `SourcesList`.
    case "reasoning":
    case "tool-web_search":
    case "source-url":
      return null;

    // Reasoning traces the provider returns as a file, provider-internal custom
    // content, a dynamically named tool and step boundaries all have nothing a
    // reader needs.
    case "reasoning-file":
    case "custom":
    case "dynamic-tool":
    case "step-start":
      return null;

    default:
      return null;
  }
}

interface GroupedParts {
  readonly reasoningText: string;
  readonly reasoningStreaming: boolean;
  readonly searchParts: readonly WebSearchToolPart[];
  readonly sourceParts: readonly SourceUrlPart[];
}

/**
 * Reasoning arrives as a run of parts rather than one blob, so they are joined
 * into a single trace — one disclosure per message reads better than one per
 * chunk, and `Reasoning` takes a single string.
 */
function groupParts(parts: readonly WeatherUIMessagePart[]): GroupedParts {
  const reasoningChunks: string[] = [];
  const searchParts: WebSearchToolPart[] = [];
  const sourceParts: SourceUrlPart[] = [];
  let reasoningStreaming = false;

  for (const part of parts) {
    if (part.type === "reasoning") {
      if (part.text.trim().length > 0) {
        reasoningChunks.push(part.text);
      }
      reasoningStreaming = part.state === "streaming";
    } else if (part.type === WEB_SEARCH_PART_TYPE) {
      searchParts.push(part);
    } else if (part.type === "source-url") {
      sourceParts.push(part);
    }
  }

  return {
    reasoningText: reasoningChunks.join("\n\n"),
    reasoningStreaming,
    searchParts,
    sourceParts,
  };
}

export interface MessageItemProps {
  readonly message: WeatherUIMessage;
  /** True for the newest assistant message while the stream is still open. */
  readonly isStreaming: boolean;
}

export function MessageItem({ message, isStreaming }: MessageItemProps) {
  const grouped = useMemo(() => groupParts(message.parts), [message.parts]);

  if (message.role === "user") {
    return (
      // `MessageContent` styles the user bubble itself, off `group-[.is-user]`
      // selectors, so only the type scale and wrapping are added here.
      <Message
        className="max-w-[min(100%,36rem)]"
        from="user"
        role="article"
        aria-label="Your message"
      >
        <MessageContent className="text-[0.9375rem] leading-relaxed [overflow-wrap:anywhere]">
          {message.parts.map((part, index) => (
            <Fragment key={`${message.id}-${String(index)}`}>
              {part.type === "text" ? (
                <span className="whitespace-pre-wrap">{part.text}</span>
              ) : (
                <MessagePart part={part} />
              )}
            </Fragment>
          ))}
        </MessageContent>
      </Message>
    );
  }

  const metadata = message.metadata;
  const hasBody = message.parts.some((part) => part.type === "text" && part.text.length > 0);
  const hasMetadata =
    metadata !== undefined &&
    (metadata.modelAlias !== undefined ||
      metadata.searchCount !== undefined ||
      metadata.durationMs !== undefined);

  return (
    <Message
      className="max-w-full flex-row gap-3"
      from="assistant"
      role="article"
      aria-label="Weather agent response"
    >
      <span
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
        aria-hidden="true"
      >
        <CloudSun className="size-4" />
      </span>

      {/* `items-start` keeps the disclosures at their natural width; prose and
          citations opt back into full width. */}
      <MessageContent className="w-full max-w-full items-start gap-2.5 text-[0.9375rem] leading-relaxed [overflow-wrap:anywhere]">
        {/* Reasoning and the search trace come first — the order the server
            streams them in — so the answer below them is pushed down once,
            before any of its text arrives, rather than jumping later. */}
        {grouped.reasoningText.length === 0 ? null : (
          <Reasoning
            className="mb-0 w-full"
            defaultOpen={false}
            isStreaming={isStreaming && grouped.reasoningStreaming}
          >
            <ReasoningTrigger className="rounded-sm text-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" />
            <ReasoningContent className="mt-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2 text-xs">
              {grouped.reasoningText}
            </ReasoningContent>
          </Reasoning>
        )}

        <AgentActivity
          searchParts={grouped.searchParts}
          sourceParts={grouped.sourceParts}
          isStreaming={isStreaming}
        />

        {message.parts.map((part, index) => (
          <Fragment key={`${message.id}-${String(index)}`}>
            <MessagePart part={part} />
          </Fragment>
        ))}

        {isStreaming && !hasBody ? <span className="sr-only">Composing a response</span> : null}

        <SourcesList parts={grouped.sourceParts} />

        {!isStreaming && metadata !== undefined && hasMetadata ? (
          <p className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.6875rem] text-muted-foreground">
            {metadata.modelAlias === undefined ? null : <span>{metadata.modelAlias}</span>}
            {metadata.searchCount === undefined ? null : (
              <span>
                {metadata.searchCount} {metadata.searchCount === 1 ? "search" : "searches"}
              </span>
            )}
            {metadata.durationMs === undefined ? null : (
              <span>{formatDuration(metadata.durationMs)}</span>
            )}
          </p>
        ) : null}
      </MessageContent>
    </Message>
  );
}
