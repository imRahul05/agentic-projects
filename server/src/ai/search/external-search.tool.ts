import { tool } from "ai";
import { z } from "zod";
import type { ExternalSearchConfig } from "../../config/config.types.js";
import { AppError, isAbortError } from "../../platform/errors/app-error.js";
import type { CachePort } from "../../platform/cache/cache.port.js";
import type { Logger } from "../../platform/logging/logger.port.js";
import type { SearchClient, SearchHit } from "./search-client.port.js";

/** Everything the tool needs at execution time; injected, never imported. */
export interface ExternalSearchToolContext {
  readonly client: SearchClient;
  readonly cache: CachePort;
  readonly logger: Logger;
}

export const externalSearchInputSchema = z.object({
  query: z.string().min(1).max(300),
});

export type ExternalSearchInput = z.infer<typeof externalSearchInputSchema>;

export interface ExternalSearchSuccess {
  readonly ok: true;
  readonly hits: readonly SearchHit[];
  readonly meta: {
    readonly count: number;
    readonly cached: boolean;
    readonly clientId: string;
  };
}

export interface ExternalSearchFailure {
  readonly ok: false;
  readonly code: "SEARCH_UNAVAILABLE";
  readonly message: string;
}

/**
 * A discriminated envelope rather than a thrown error: the model has to be able
 * to read "the search failed" and say so, instead of the loop dying or the
 * model filling the gap from memory.
 */
export type ExternalSearchResult = ExternalSearchSuccess | ExternalSearchFailure;

const TOOL_DESCRIPTION = [
  "Search the web for current weather information.",
  "Pass a self-contained query that always names the location and an explicit date.",
  "Returns ranked page snippets; an empty result list means nothing usable was found.",
].join(" ");

const FAILURE_MESSAGE = "The web search could not be completed, so no fresh data is available.";

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function cacheKey(clientId: string, query: string, maxResults: number): string {
  return `search:${clientId}:${maxResults}:${normalizeQuery(query)}`;
}

/**
 * Runs one search through cache and client. Exported so the behaviour can be
 * exercised directly, without fabricating a tool-execution envelope.
 */
export async function runExternalSearch(
  input: ExternalSearchInput,
  context: ExternalSearchToolContext,
  config: ExternalSearchConfig,
  options: { abortSignal?: AbortSignal } = {},
): Promise<ExternalSearchResult> {
  const query = input.query.trim();
  let loaded = false;

  const load = async (): Promise<readonly SearchHit[]> => {
    loaded = true;
    return context.client.search(
      { query, maxResults: config.maxResults },
      { abortSignal: options.abortSignal },
    );
  };

  try {
    const hits =
      config.cacheTtlMs > 0
        ? await context.cache.getOrLoad<readonly SearchHit[]>(
            cacheKey(context.client.id, query, config.maxResults),
            config.cacheTtlMs,
            load,
          )
        : await load();

    return {
      ok: true,
      hits,
      meta: { count: hits.length, cached: !loaded, clientId: context.client.id },
    };
  } catch (error) {
    // An aborted turn is not a search outage; let it propagate.
    if (isAbortError(error) || (AppError.isAppError(error) && error.code === "REQUEST_ABORTED")) {
      throw error;
    }

    context.logger.warn("web search failed", {
      clientId: context.client.id,
      code: AppError.isAppError(error) ? error.code : "unknown",
    });

    return { ok: false, code: "SEARCH_UNAVAILABLE", message: FAILURE_MESSAGE };
  }
}

export interface ExternalSearchToolDeps {
  readonly config: ExternalSearchConfig;
  readonly context: ExternalSearchToolContext;
}

const buildTool = (deps: ExternalSearchToolDeps) =>
  tool({
    description: TOOL_DESCRIPTION,
    inputSchema: externalSearchInputSchema,
    execute: (
      input: ExternalSearchInput,
      options: { abortSignal?: AbortSignal },
    ): Promise<ExternalSearchResult> =>
      runExternalSearch(input, deps.context, deps.config, { abortSignal: options.abortSignal }),
  });

export type ExternalSearchTool = ReturnType<typeof buildTool>;

/**
 * The tool as the agent sees it. Its context is bound here because the context
 * lives in the search layer's dependencies, while `toolsContext` is an
 * agent-level setting the agent factory has no access to.
 */
export function createExternalSearchTool(deps: ExternalSearchToolDeps): ExternalSearchTool {
  return buildTool(deps);
}
