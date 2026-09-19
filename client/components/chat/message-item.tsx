"use client";

import { ChevronRight, CloudSun, FileText, Paperclip } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { SearchActivity } from "@/components/chat/search-activity";
import { SourcesList } from "@/components/chat/sources-list";
import type { SourceUrlPart, WeatherUIMessage, WeatherUIMessagePart } from "@/lib/contracts/chat";
import { cn } from "@/lib/utils";

function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds).toString()}s`;
}

function Reasoning({ text, streaming }: { readonly text: string; readonly streaming: boolean }) {
  if (text.trim().length === 0) {
    return null;
  }
  return (
    <details className="group rounded-lg border border-border bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <ChevronRight
          className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden="true"
        />
        {streaming ? "Thinking…" : "Reasoning"}
      </summary>
      <p className="border-t border-border px-2.5 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
        {text}
      </p>
    </details>
  );
}

/**
 * Exhaustive render of one message part.
 *
 * Every variant the SDK can emit has a branch, and the `default` branch renders
 * nothing — a part shape we do not understand is silently dropped rather than
 * dumped at the reader as JSON.
 */
function MessagePart({ part }: { readonly part: WeatherUIMessagePart }): ReactNode {
  switch (part.type) {
    case "text":
      if (part.text.length === 0) {
        return null;
      }
      return (
        <p className="w-full text-[0.9375rem] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
          {part.text}
        </p>
      );

    case "reasoning":
      return <Reasoning text={part.text} streaming={part.state === "streaming"} />;

    case "tool-web_search":
      return <SearchActivity part={part} />;

    // Rendered together, below the body, by `SourcesList`.
    case "source-url":
      return null;

    case "source-document":
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
          <FileText className="size-3.5" aria-hidden="true" />
          <span className="truncate">{part.title}</span>
        </div>
      );

    case "file":
      return (
        <a
          href={part.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Paperclip className="size-3.5" aria-hidden="true" />
          <span className="truncate">{part.filename ?? part.mediaType}</span>
        </a>
      );

    // Reasoning traces the provider returns as a file, provider-internal custom
    // content, a dynamically named tool, step boundaries and data parts all have
    // nothing a reader needs.
    case "reasoning-file":
    case "custom":
    case "dynamic-tool":
    case "step-start":
      return null;

    default:
      return null;
  }
}

export interface MessageItemProps {
  readonly message: WeatherUIMessage;
  /** True for the newest assistant message while the stream is still open. */
  readonly isStreaming: boolean;
}

export function MessageItem({ message, isStreaming }: MessageItemProps) {
  const sources: SourceUrlPart[] = [];
  for (const part of message.parts) {
    if (part.type === "source-url") {
      sources.push(part);
    }
  }

  if (message.role === "user") {
    return (
      <article className="flex justify-end" aria-label="Your message">
        <div className="max-w-[min(100%,36rem)] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-[0.9375rem] leading-relaxed text-primary-foreground [overflow-wrap:anywhere]">
          {message.parts.map((part, index) => (
            <Fragment key={`${message.id}-${String(index)}`}>
              {part.type === "text" ? (
                <span className="whitespace-pre-wrap">{part.text}</span>
              ) : (
                <MessagePart part={part} />
              )}
            </Fragment>
          ))}
        </div>
      </article>
    );
  }

  const metadata = message.metadata;
  const hasBody = message.parts.some((part) => part.type === "text" && part.text.length > 0);

  return (
    <article className="flex gap-3" aria-label="Weather agent response">
      <span
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
        aria-hidden="true"
      >
        <CloudSun className="size-4" />
      </span>

      {/* `items-start` keeps the reasoning disclosure and the search chip at
          their natural width; prose and citations opt back into full width. */}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5">
        {message.parts.map((part, index) => (
          <Fragment key={`${message.id}-${String(index)}`}>
            <MessagePart part={part} />
          </Fragment>
        ))}

        {isStreaming && !hasBody ? (
          <span className="sr-only">Composing a response</span>
        ) : null}

        <SourcesList parts={sources} />

        {!isStreaming && metadata !== undefined ? (
          <p
            className={cn(
              "flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.6875rem] text-muted-foreground",
              metadata.modelAlias === undefined &&
                metadata.searchCount === undefined &&
                metadata.durationMs === undefined &&
                "hidden"
            )}
          >
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
      </div>
    </article>
  );
}
