"use client";

import { ArrowUpRight } from "lucide-react";

export interface SuggestionsProps {
  /** From `capabilities.suggestions` — never hardcoded in the client. */
  readonly suggestions: readonly string[];
  readonly disabled?: boolean;
  readonly onSelect: (suggestion: string) => void;
}

export function Suggestions({ suggestions, disabled = false, onSelect }: SuggestionsProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
        Try asking
      </h2>
      <ul className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
        {suggestions.map((suggestion) => (
          <li key={suggestion} className="min-w-0">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onSelect(suggestion);
              }}
              className="group flex w-full items-center justify-between gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
            >
              <span className="min-w-0 truncate">{suggestion}</span>
              <ArrowUpRight
                className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-px motion-reduce:transition-none"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
