"use client";

import { CloudSun, Globe } from "lucide-react";
import { useEffect } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatStatus } from "@/components/chat/chat-status";
import { MessageList } from "@/components/chat/message-list";
import { Suggestions } from "@/components/chat/suggestions";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiBaseUrl, missingApiBaseUrlMessage } from "@/lib/api/http";
import { useWeatherChat } from "@/lib/chat/use-weather-chat";
import { useCapabilitiesQuery } from "@/lib/queries/capabilities.query";

function ConfigurationBanner() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error(`[weather-agent] ${missingApiBaseUrlMessage()}`);
    }
  }, []);

  return (
    <div
      role="alert"
      className="mx-auto w-full max-w-3xl px-4 pt-4 text-sm"
      data-testid="missing-api-base-url"
    >
      <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive [overflow-wrap:anywhere]">
        {missingApiBaseUrlMessage()}
      </p>
    </div>
  );
}

function EmptyState({
  suggestions,
  isLoadingCapabilities,
  disabled,
  onSelect,
}: {
  readonly suggestions: readonly string[];
  readonly isLoadingCapabilities: boolean;
  readonly disabled: boolean;
  readonly onSelect: (suggestion: string) => void;
}) {
  return (
    // `my-auto` centres the empty state in the viewport; once a message exists
    // the transcript is taller than the container and this never applies.
    <div className="my-auto flex min-w-0 flex-col gap-6 py-6">
      <div className="flex flex-col gap-2.5">
        <span
          className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-foreground"
          aria-hidden="true"
        >
          <CloudSun className="size-5" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-balance">
          Ask about the weather, anywhere
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          This agent searches the live web for every answer and shows you the sources it used. It
          only covers weather, forecasts, and decisions that hang on them — anything else it will
          politely decline.
        </p>
      </div>

      {isLoadingCapabilities ? (
        <div className="flex flex-col gap-1.5" aria-hidden="true">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full rounded-full sm:w-72" />
          <Skeleton className="h-9 w-full rounded-full sm:w-60" />
        </div>
      ) : (
        <Suggestions suggestions={suggestions} disabled={disabled} onSelect={onSelect} />
      )}
    </div>
  );
}

export function ChatPanel() {
  const isConfigured = getApiBaseUrl() !== undefined;
  const capabilitiesQuery = useCapabilitiesQuery();
  const capabilities = capabilitiesQuery.data;

  const chat = useWeatherChat({
    models: capabilities?.models ?? [],
    ...(capabilities?.defaultLocale === undefined
      ? {}
      : { defaultLocale: capabilities.defaultLocale }),
  });

  const isEmpty = chat.messages.length === 0;
  const searchMode = capabilities?.search.mode;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-2.5">
          <CloudSun className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-sm font-semibold tracking-tight">Weather Agent</span>
          {searchMode === undefined ? null : (
            <span className="hidden shrink-0 items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[0.625rem] font-medium text-muted-foreground sm:inline-flex">
              <Globe className="size-2.5" aria-hidden="true" />
              {searchMode}
            </span>
          )}
        </div>
      </header>

      {isConfigured ? null : <ConfigurationBanner />}

      {/*
        ai-elements' `Conversation` wraps `use-stick-to-bottom`: it follows the
        stream while the reader is at the bottom, gets out of the way the moment
        they scroll up, and `ConversationScrollButton` only appears in that case.
      */}
      <Conversation className="min-h-0 flex-1 overflow-y-hidden" role="presentation">
        <ConversationContent className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 p-4">
          {isEmpty ? (
            <EmptyState
              suggestions={capabilities?.suggestions ?? []}
              isLoadingCapabilities={capabilitiesQuery.isPending && isConfigured}
              disabled={chat.isBusy}
              onSelect={chat.send}
            />
          ) : (
            <MessageList messages={chat.messages} isStreaming={chat.isStreaming} />
          )}

          <ChatStatus
            status={chat.status}
            error={chat.error ?? (isEmpty ? (capabilitiesQuery.error ?? undefined) : undefined)}
            aborted={chat.aborted}
            onRetry={isEmpty ? () => void capabilitiesQuery.refetch() : chat.regenerate}
            onDismissError={chat.clearError}
          />
        </ConversationContent>

        <ConversationScrollButton aria-label="Jump to the latest message" />
      </Conversation>

      <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-3xl px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <ChatComposer
            status={chat.status}
            isBusy={chat.isBusy}
            models={capabilities?.models ?? []}
            modelAlias={chat.modelAlias}
            onModelChange={chat.setModelAlias}
            {...(capabilities?.limits.maxInputChars === undefined
              ? {}
              : { maxChars: capabilities.limits.maxInputChars })}
            onSend={chat.send}
            onStop={chat.stop}
          />
        </div>
      </div>
    </div>
  );
}
