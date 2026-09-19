"use client";

import { ArrowUp, Square } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Roughly seven lines before the textarea starts scrolling instead of growing. */
const MAX_TEXTAREA_HEIGHT_PX = 168;

export interface PromptInputProps {
  readonly isBusy: boolean;
  /** `capabilities.limits.maxInputChars`; the counter is hidden without it. */
  readonly maxChars?: number;
  readonly onSend: (text: string) => void;
  readonly onStop: () => void;
}

export function PromptInput({ isBusy, maxChars, onSend, onStop }: PromptInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const counterId = useId();

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX).toString()}px`;
  }, [value]);

  const overLimit = maxChars !== undefined && value.length > maxChars;
  const canSend = !isBusy && value.trim().length > 0 && !overLimit;

  const submit = useCallback(() => {
    if (!canSend) {
      return;
    }
    onSend(value);
    setValue("");
    textareaRef.current?.focus();
  }, [canSend, onSend, value]);

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border border-input bg-card p-2 shadow-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          overLimit && "border-destructive/50 focus-within:border-destructive/60"
        )}
      >
        <label htmlFor="prompt-input" className="sr-only">
          Ask about the weather
        </label>
        <Textarea
          id="prompt-input"
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={isBusy}
          autoComplete="off"
          aria-describedby={maxChars === undefined ? undefined : counterId}
          aria-invalid={overLimit}
          placeholder={isBusy ? "Waiting for the agent…" : "Ask about the weather anywhere…"}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline. IME composition must never
            // be interrupted by a send.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          className="max-h-[10.5rem] min-h-9 border-0 bg-transparent px-1.5 py-1.5 shadow-none focus-visible:border-0 focus-visible:ring-0"
        />

        {isBusy ? (
          <Button type="button" variant="outline" size="icon-lg" onClick={onStop} aria-label="Stop generating">
            <Square className="size-3.5 fill-current" aria-hidden="true" />
          </Button>
        ) : (
          <Button type="submit" size="icon-lg" disabled={!canSend} aria-label="Send message">
            <ArrowUp className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="flex min-h-4 items-center justify-between gap-3 px-1.5">
        <p className="text-[0.6875rem] text-muted-foreground">
          <kbd className="font-sans font-medium">Enter</kbd> to send ·{" "}
          <kbd className="font-sans font-medium">Shift</kbd>+
          <kbd className="font-sans font-medium">Enter</kbd> for a new line
        </p>
        {maxChars === undefined ? null : (
          <p
            id={counterId}
            aria-live="polite"
            className={cn(
              "shrink-0 font-mono text-[0.6875rem] tabular-nums",
              overLimit ? "text-destructive" : "text-muted-foreground",
              value.length < maxChars * 0.8 && "invisible"
            )}
          >
            {value.length} / {maxChars}
          </p>
        )}
      </div>
    </form>
  );
}
