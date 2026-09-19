"use client";

import type { ChatStatus } from "ai";
import { useCallback, useId } from "react";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { ModelSelect } from "@/components/chat/model-select";
import type { ModelOption } from "@/lib/contracts/capabilities";
import { cn } from "@/lib/utils";

export interface ChatComposerProps {
  readonly status: ChatStatus;
  readonly isBusy: boolean;
  /** From `capabilities.models`; drives the in-composer model select. */
  readonly models: readonly ModelOption[];
  readonly modelAlias: string | undefined;
  readonly onModelChange: (alias: string) => void;
  /** `capabilities.limits.maxInputChars`; the counter is hidden without it. */
  readonly maxChars?: number;
  readonly onSend: (text: string) => void;
  readonly onStop: () => void;
}

/**
 * The composer, on ai-elements' `prompt-input`.
 *
 * `PromptInputProvider` lifts the textarea's value out of `PromptInput` so the
 * character counter and the send guard can both read it — `prompt-input` is
 * otherwise uncontrolled and reads the text from the form on submit.
 */
export function ChatComposer(props: ChatComposerProps) {
  return (
    <PromptInputProvider>
      <ComposerForm {...props} />
    </PromptInputProvider>
  );
}

function ComposerForm({
  status,
  isBusy,
  models,
  modelAlias,
  onModelChange,
  maxChars,
  onSend,
  onStop,
}: ChatComposerProps) {
  const { textInput } = usePromptInputController();
  const counterId = useId();

  const length = textInput.value.length;
  const overLimit = maxChars !== undefined && length > maxChars;
  const canSend = !isBusy && textInput.value.trim().length > 0 && !overLimit;

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const text = message.text.trim();
      if (text.length === 0) {
        return;
      }
      onSend(text);
    },
    [onSend]
  );

  // The textarea and footer are direct children on purpose: InputGroup switches
  // to a column via a direct-child selector, so any wrapper here — even one
  // using `display: contents` — leaves it a row and collapses the textarea.
  return (
    <PromptInput onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="prompt-input">
        Ask about the weather
      </label>
      <PromptInputTextarea
        id="prompt-input"
        aria-describedby={maxChars === undefined ? undefined : counterId}
        aria-invalid={overLimit}
        autoComplete="off"
        disabled={isBusy}
        placeholder={isBusy ? "Waiting for the agent…" : "Ask about the weather anywhere…"}
      />

      <PromptInputFooter>
          <PromptInputTools>
            <ModelSelect
              models={models}
              value={modelAlias}
              disabled={isBusy}
              onChange={onModelChange}
            />
            {/* No physical keyboard to hint at on a phone, and the row is tight
                at 360px, so the shortcut only appears once there is room. */}
            <p className="hidden text-[0.6875rem] text-muted-foreground sm:block">
              <kbd className="font-sans font-medium">Enter</kbd> to send ·{" "}
              <kbd className="font-sans font-medium">Shift</kbd>+
              <kbd className="font-sans font-medium">Enter</kbd> for a new line
            </p>
          </PromptInputTools>

          <div className="flex min-w-0 items-center gap-2">
            {maxChars === undefined ? null : (
              <p
                id={counterId}
                aria-live="polite"
                className={cn(
                  "shrink-0 font-mono text-[0.6875rem] tabular-nums",
                  overLimit ? "text-destructive" : "text-muted-foreground",
                  length < maxChars * 0.8 && "invisible"
                )}
              >
                {length} / {maxChars}
              </p>
            )}
          <PromptInputSubmit
            disabled={!(canSend || isBusy)}
            size="icon-sm"
            status={status}
            onStop={onStop}
          />
        </div>
      </PromptInputFooter>
    </PromptInput>
  );
}
