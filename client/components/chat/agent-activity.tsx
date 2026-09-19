"use client";

import { Globe, Search, SearchCheck, SearchX, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import type { SourceUrlPart, WebSearchToolPart } from "@/lib/contracts/chat";

/**
 * The agent's work on one answer, on ai-elements' `chain-of-thought`.
 *
 * Driven entirely by each `web_search` part's `state` and, when it is readable,
 * its `query`. The tool's `output` is never touched: the providers disagree on
 * its shape (OpenAI `{ action, sources[] }`, Anthropic `web_search_result[]`
 * carrying an opaque `encryptedContent` blob) and none of it is meant for a
 * reader. The sites the agent consulted come from the SDK's normalized
 * `source-url` parts instead.
 */

type StepStatus = "complete" | "active" | "pending";

interface StepView {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly status: StepStatus;
  readonly failed: boolean;
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

function describe(state: WebSearchToolPart["state"]): StepView {
  switch (state) {
    case "input-streaming":
    case "input-available":
    case "approval-requested":
    case "approval-responded":
      return { label: "Searching the web", icon: Search, status: "active", failed: false };
    case "output-available":
      return { label: "Searched the web", icon: SearchCheck, status: "complete", failed: false };
    case "output-error":
      return { label: "Web search failed", icon: SearchX, status: "complete", failed: true };
    case "output-denied":
      return { label: "Web search skipped", icon: SearchX, status: "complete", failed: true };
    default:
      return { label: "Using the web", icon: Globe, status: "pending", failed: false };
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** One badge per distinct site, in the order the agent first reached it. */
function toHostnames(parts: readonly SourceUrlPart[]): readonly string[] {
  const seen = new Set<string>();
  const hostnames: string[] = [];
  for (const part of parts) {
    if (typeof part.url !== "string" || part.url.length === 0) {
      continue;
    }
    const hostname = hostnameOf(part.url);
    if (seen.has(hostname)) {
      continue;
    }
    seen.add(hostname);
    hostnames.push(hostname);
  }
  return hostnames;
}

export interface AgentActivityProps {
  readonly searchParts: readonly WebSearchToolPart[];
  readonly sourceParts: readonly SourceUrlPart[];
  /** True while this message is still streaming; the trace opens itself then. */
  readonly isStreaming: boolean;
}

export function AgentActivity({ searchParts, sourceParts, isStreaming }: AgentActivityProps) {
  const hostnames = useMemo(() => toHostnames(sourceParts), [sourceParts]);

  if (searchParts.length === 0) {
    return null;
  }

  const activeCount = searchParts.filter(
    (part) => describe(part.state).status === "active"
  ).length;
  const summary =
    activeCount > 0
      ? "Searching the web…"
      : `Searched the web · ${searchParts.length.toString()} ${searchParts.length === 1 ? "search" : "searches"}`;

  return (
    // Open on arrival while the answer is still being written, so the searches
    // are watchable as they happen; collapsed for an answer that is already
    // finished, where the citations below carry the same information.
    <ChainOfThought className="w-full" defaultOpen={isStreaming}>
      <ChainOfThoughtHeader className="text-xs">
        <span aria-live="polite">{summary}</span>
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {searchParts.map((part, index) => {
          const view = describe(part.state);
          const query = readQuery(part.input);
          const isLast = index === searchParts.length - 1;

          return (
            <ChainOfThoughtStep
              key={`${part.type}-${String(index)}`}
              icon={view.icon}
              status={view.status}
              className={view.failed ? "text-destructive" : undefined}
              label={<span className="text-xs">{view.label}</span>}
              {...(query === undefined
                ? {}
                : {
                    description: (
                      <span className="font-mono [overflow-wrap:anywhere]">{query}</span>
                    ),
                  })}
            >
              {isLast && hostnames.length > 0 ? (
                <ChainOfThoughtSearchResults>
                  {hostnames.map((hostname) => (
                    <ChainOfThoughtSearchResult key={hostname}>
                      {hostname}
                    </ChainOfThoughtSearchResult>
                  ))}
                </ChainOfThoughtSearchResults>
              ) : null}
            </ChainOfThoughtStep>
          );
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
