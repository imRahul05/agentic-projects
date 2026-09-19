"use client";

import { ArrowDown, CloudSun, Globe } from "lucide-react";
import { useEffect } from "react";
import { ChatStatus } from "@/components/chat/chat-status";
import { MessageList } from "@/components/chat/message-list";
import { ModelPicker } from "@/components/chat/model-picker";
import { PromptInput } from "@/components/chat/prompt-input";
import { Suggestions } from "@/components/chat/suggestions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
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
    <div className="my-auto flex flex-col gap-6 py-6">
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

  const { viewportRef, contentRef, isPinned, scrollToBottom } = useStickToBottom();

  const isEmpty = chat.messages.length === 0;
  const searchMode = capabilities?.search.mode;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <CloudSun className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate text-sm font-semibold tracking-tight">Weather Agent</span>
            {searchMode === undefined ? null : (
              <span className="hidden shrink-0 items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[0.625rem] font-medium text-muted-foreground sm:inline-flex">
                <Globe className="size-2.5" aria-hidden="true" />
                {searchMode}
              </span>
            )}
          </div>

          <ModelPicker
            models={capabilities?.models ?? []}
            value={chat.modelAlias}
            disabled={chat.isBusy}
            onChange={chat.setModelAlias}
          />
        </div>
      </header>

      {isConfigured ? null : <ConfigurationBanner />}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={viewportRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          tabIndex={-1}
        >
          <div
            ref={contentRef}
            className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 px-4 py-4"
          >
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
          </div>
        </div>

        {isPinned || isEmpty ? null : (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => {
              scrollToBottom();
            }}
            aria-label="Jump to the latest message"
            className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full shadow-md"
          >
            <ArrowDown aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-3xl px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <PromptInput
            isBusy={chat.isBusy}
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
