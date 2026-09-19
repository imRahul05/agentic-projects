"use client";

import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import type { SourceUrlPart } from "@/lib/contracts/chat";

interface Citation {
  readonly url: string;
  readonly hostname: string;
  readonly title: string;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** One entry per URL, in the order the agent first cited it. */
function toCitations(parts: readonly SourceUrlPart[]): readonly Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];

  for (const part of parts) {
    if (typeof part.url !== "string" || part.url.length === 0 || seen.has(part.url)) {
      continue;
    }
    seen.add(part.url);
    const hostname = hostnameOf(part.url);
    const title = part.title !== undefined && part.title.trim().length > 0 ? part.title : hostname;
    citations.push({ url: part.url, hostname, title });
  }

  return citations;
}

export interface SourcesListProps {
  readonly parts: readonly SourceUrlPart[];
}

/**
 * Citations, on ai-elements' `sources` disclosure.
 *
 * The parts come from the SDK's normalized `source-url` stream — never from the
 * `web_search` tool's output — and are deduplicated by URL, because a provider
 * will cite the same page for several claims in one answer.
 */
export function SourcesList({ parts }: SourcesListProps) {
  const citations = useMemo(() => toCitations(parts), [parts]);

  if (citations.length === 0) {
    return null;
  }

  return (
    // `defaultOpen`: "shows you the sources it used" is the point of this agent,
    // so they are visible on arrival and only *collapsible*, not hidden.
    <Sources className="mb-0 w-full text-foreground" defaultOpen>
      <SourcesTrigger
        className="group rounded-sm text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        count={citations.length}
      >
        <span>
          {citations.length} {citations.length === 1 ? "source" : "sources"}
        </span>
        <ChevronDown
          className="size-3.5 transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </SourcesTrigger>
      <SourcesContent className="w-full max-w-full">
        <ol className="flex flex-col gap-1">
          {citations.map((citation, index) => (
            <li key={citation.url} className="flex min-w-0 items-baseline gap-2 text-xs">
              <span
                className="mt-px shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <Source
                href={citation.url}
                className="group inline-flex min-w-0 items-baseline gap-1.5 rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="min-w-0 truncate">{citation.title}</span>
                <span className="shrink-0 text-muted-foreground">{citation.hostname}</span>
                <span className="sr-only">(opens in a new tab)</span>
              </Source>
            </li>
          ))}
        </ol>
      </SourcesContent>
    </Sources>
  );
}
