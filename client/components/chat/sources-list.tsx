"use client";

import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
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

export function SourcesList({ parts }: SourcesListProps) {
  const citations = useMemo(() => toCitations(parts), [parts]);

  if (citations.length === 0) {
    return null;
  }

  return (
    <section className="mt-3 w-full border-t border-border pt-3" aria-label="Sources">
      <h3 className="mb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
        Sources ({citations.length})
      </h3>
      <ol className="flex flex-col gap-1">
        {citations.map((citation, index) => (
          <li key={citation.url} className="flex min-w-0 items-baseline gap-2 text-xs">
            <span
              className="mt-px shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex min-w-0 items-baseline gap-1.5 rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="min-w-0 truncate">{citation.title}</span>
              <span className="shrink-0 text-muted-foreground">{citation.hostname}</span>
              <ExternalLink
                className="size-3 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                aria-hidden="true"
              />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
