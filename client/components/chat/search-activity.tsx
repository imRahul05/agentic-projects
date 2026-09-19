"use client";

import { Globe, Loader2, SearchCheck, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import type { WebSearchToolPart } from "@/lib/contracts/chat";
import { cn } from "@/lib/utils";

/**
 * Compact status chip for the agent's one tool.
 *
 * It renders the part's *state* only. The tool's `output` is never read: the
 * providers disagree on its shape (OpenAI `{ action, sources[] }`, Anthropic
 * `web_search_result[]` including an `encryptedContent` blob), and none of it is
 * meant for a reader. Citations come from `source-url` parts instead.
 */

interface SearchActivityView {
  readonly label: string;
  readonly icon: ReactNode;
  readonly tone: "pending" | "done" | "failed";
}

function readQuery(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null || !("query" in input)) {
    return undefined;
  }
  const query: unknown = input.query;
  if (typeof query !== "string") {
    return undefined;
  }
  const trimmed = query.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function describe(state: WebSearchToolPart["state"]): SearchActivityView {
  switch (state) {
    case "input-streaming":
    case "input-available":
    case "approval-requested":
    case "approval-responded":
      return {
        label: "Searching the web…",
        icon: <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />,
        tone: "pending",
      };
    case "output-available":
      return {
        label: "Searched the web",
        icon: <SearchCheck className="size-3.5" aria-hidden="true" />,
        tone: "done",
      };
    case "output-error":
      return {
        label: "Web search failed",
        icon: <SearchX className="size-3.5" aria-hidden="true" />,
        tone: "failed",
      };
    case "output-denied":
      return {
        label: "Web search skipped",
        icon: <SearchX className="size-3.5" aria-hidden="true" />,
        tone: "failed",
      };
    default:
      return {
        label: "Using the web",
        icon: <Globe className="size-3.5" aria-hidden="true" />,
        tone: "pending",
      };
  }
}

export interface SearchActivityProps {
  readonly part: WebSearchToolPart;
}

export function SearchActivity({ part }: SearchActivityProps) {
  const view = describe(part.state);
  const query = readQuery(part.input);

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-xs",
        view.tone === "failed"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted/60 text-muted-foreground"
      )}
    >
      {view.icon}
      <span className="font-medium">{view.label}</span>
      {query === undefined ? null : (
        <span className="min-w-0 truncate font-mono text-[0.6875rem] opacity-80" title={query}>
          {query}
        </span>
      )}
    </div>
  );
}
