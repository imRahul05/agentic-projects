"use client";

import { AlertTriangle, CircleStop, Loader2, RotateCcw, X } from "lucide-react";
import type { ChatStatus } from "ai";
import { Button } from "@/components/ui/button";
import { ApiConfigurationError, ApiError } from "@/lib/api/http";

function describeError(error: Error): { readonly message: string; readonly detail?: string } {
  if (error instanceof ApiConfigurationError) {
    return { message: "The app is not configured yet.", detail: error.message };
  }
  if (error instanceof ApiError) {
    return {
      message: error.message,
      detail: error.requestId === undefined ? undefined : `Request ${error.requestId}`,
    };
  }
  if (error.message.trim().length > 0) {
    return { message: error.message };
  }
  return { message: "Something went wrong while answering." };
}

export interface ChatStatusProps {
  readonly status: ChatStatus;
  readonly error: Error | undefined;
  readonly aborted: boolean;
  readonly onRetry: () => void;
  readonly onDismissError: () => void;
}

export function ChatStatus({ status, error, aborted, onRetry, onDismissError }: ChatStatusProps) {
  if (error !== undefined) {
    const described = describeError(error);
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex min-w-0 items-start gap-2 text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium [overflow-wrap:anywhere]">{described.message}</p>
            {described.detail === undefined ? null : (
              <p className="mt-0.5 text-xs opacity-80 [overflow-wrap:anywhere]">{described.detail}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5 self-end sm:self-start">
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            Retry
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDismissError}
            aria-label="Dismiss error"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  if (aborted) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-2.5 pl-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <CircleStop className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">You stopped the response.</span>
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  if (status === "submitted") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
        Checking the forecast…
      </p>
    );
  }

  return null;
}
