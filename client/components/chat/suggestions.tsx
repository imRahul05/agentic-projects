"use client";

import { ArrowUpRight } from "lucide-react";
import {
  Suggestion,
  Suggestions as SuggestionRow,
} from "@/components/ai-elements/suggestion";

export interface SuggestionsProps {
  /** From `capabilities.suggestions` — never hardcoded in the client. */
  readonly suggestions: readonly string[];
  readonly disabled?: boolean;
  readonly onSelect: (suggestion: string) => void;
}

/**
 * The empty state's starter prompts, on ai-elements' `suggestion`.
 *
 * `Suggestions` is a horizontally scrolling row, which is what keeps this from
 * overflowing at 360px: the chips scroll inside their own scroll area instead of
 * widening the page.
 */
export function Suggestions({ suggestions, disabled = false, onSelect }: SuggestionsProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2
        className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase"
        id="suggestions-heading"
      >
        Try asking
      </h2>
      <SuggestionRow aria-labelledby="suggestions-heading">
        {suggestions.map((suggestion) => (
          <Suggestion
            key={suggestion}
            suggestion={suggestion}
            disabled={disabled}
            onClick={onSelect}
            className="group gap-2"
          >
            <span>{suggestion}</span>
            <ArrowUpRight
              className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-px motion-reduce:transition-none"
              aria-hidden="true"
            />
          </Suggestion>
        ))}
      </SuggestionRow>
    </div>
  );
}
