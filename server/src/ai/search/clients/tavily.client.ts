import { z } from "zod";
import type { ExternalSearchConfig } from "../../../config/config.types.js";
import { AppError, isAbortError } from "../../../platform/errors/app-error.js";
import type { Logger } from "../../../platform/logging/logger.port.js";
import type { FetchFunction } from "../../provider/provider-registry.js";
import type { SearchClient, SearchHit, SearchQuery } from "../search-client.port.js";

export interface TavilySearchClientDeps {
  readonly logger: Logger;
  readonly fetch?: FetchFunction;
}

/**
 * Retries are bounded on purpose: a chat turn has a budget, and a search that
 * needs four attempts is better reported as unavailable than waited out.
 */
const MAX_RETRIES = 2;

/** Statuses worth retrying: throttling and transient upstream faults only. */
const RETRYABLE_STATUS = new Set<number>([408, 425, 429, 500, 502, 503, 504]);

const resultSchema = z.object({
  title: z.string().optional(),
  url: z.string().min(1),
  content: z.string().optional(),
  published_date: z.string().optional(),
});

const responseSchema = z.object({
  results: z.array(resultSchema),
});

const UNAVAILABLE_MESSAGE = "Web search is temporarily unavailable.";

function unavailable(meta: Record<string, string | number | boolean>, cause?: unknown): AppError {
  return new AppError("SEARCH_UNAVAILABLE", {
    publicMessage: UNAVAILABLE_MESSAGE,
    cause,
    meta,
  });
}

/** The endpoint is configuration, so a missing one is an outage, not a default. */
function requireEndpoint(config: ExternalSearchConfig): string {
  const endpoint = config.baseUrl?.trim();
  if (endpoint === undefined || endpoint === "") {
    throw unavailable({ clientId: config.clientId, reason: "missing_base_url" });
  }
  return endpoint;
}

function toHits(payload: z.infer<typeof responseSchema>, maxResults: number): readonly SearchHit[] {
  return payload.results.slice(0, maxResults).map((result): SearchHit => ({
    title: result.title ?? result.url,
    url: result.url,
    snippet: result.content ?? "",
    publishedAt: result.published_date,
  }));
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(
        new AppError("REQUEST_ABORTED", {
          publicMessage: "The request was cancelled before the search completed.",
        }),
      );
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Search over the configured HTTP endpoint using plain `fetch`.
 *
 * `config.baseUrl` is treated as the full search endpoint so that no path or
 * host is hardcoded here. The API key travels in a header only — never in a
 * URL, a query string or a log line.
 */
export function createTavilySearchClient(
  config: ExternalSearchConfig,
  deps: TavilySearchClientDeps,
): SearchClient {
  const endpoint = requireEndpoint(config);
  const httpFetch: FetchFunction = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const logger = deps.logger.child({ searchClient: config.clientId });
  // Derived from the per-call timeout so a retry pause can never dominate it.
  const backoffBaseMs = Math.max(1, Math.round(config.timeoutMs / 20));

  async function attempt(q: SearchQuery, callerSignal?: AbortSignal): Promise<Response> {
    const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
    const signal =
      callerSignal === undefined ? timeoutSignal : AbortSignal.any([callerSignal, timeoutSignal]);

    return httpFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ query: q.query, max_results: q.maxResults }),
      signal,
    });
  }

  async function search(
    q: SearchQuery,
    ctx: { abortSignal?: AbortSignal },
  ): Promise<readonly SearchHit[]> {
    let lastStatus: number | undefined;
    // A call, not an inline check: the signal can flip between attempts, so the
    // state must be re-read rather than narrowed once.
    const callerAborted = (): boolean => ctx.abortSignal?.aborted === true;

    for (let tries = 0; tries <= MAX_RETRIES; tries += 1) {
      if (callerAborted()) {
        throw new AppError("REQUEST_ABORTED", {
          publicMessage: "The request was cancelled before the search completed.",
        });
      }

      let response: Response;
      try {
        response = await attempt(q, ctx.abortSignal);
      } catch (error) {
        if (AppError.isAppError(error)) throw error;
        if (isAbortError(error)) {
          if (callerAborted()) {
            throw new AppError("REQUEST_ABORTED", {
              publicMessage: "The request was cancelled before the search completed.",
              cause: error,
            });
          }
          if (tries === MAX_RETRIES) {
            throw new AppError("UPSTREAM_TIMEOUT", {
              publicMessage: "Web search timed out.",
              cause: error,
              meta: { clientId: config.clientId },
            });
          }
        } else if (tries === MAX_RETRIES) {
          throw unavailable({ clientId: config.clientId, reason: "network_error" }, error);
        }

        logger.warn("search attempt failed, retrying", { attempt: tries + 1 });
        await delay(backoffBaseMs * 2 ** tries + Math.random() * backoffBaseMs, ctx.abortSignal);
        continue;
      }

      if (response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch (error) {
          throw unavailable({ clientId: config.clientId, reason: "invalid_json" }, error);
        }

        const parsed = responseSchema.safeParse(body);
        if (!parsed.success) {
          // A contract change must surface as an outage, not as invented hits.
          throw unavailable({ clientId: config.clientId, reason: "unexpected_response_shape" });
        }

        return toHits(parsed.data, q.maxResults);
      }

      lastStatus = response.status;
      const retryable = RETRYABLE_STATUS.has(response.status);
      if (!retryable || tries === MAX_RETRIES) {
        if (response.status === 429) {
          throw new AppError("RATE_LIMITED", {
            publicMessage: "Web search is rate limited right now.",
            meta: { clientId: config.clientId, status: response.status },
          });
        }
        throw unavailable({ clientId: config.clientId, status: response.status });
      }

      logger.warn("search attempt returned a retryable status", {
        attempt: tries + 1,
        status: response.status,
      });
      await delay(backoffBaseMs * 2 ** tries + Math.random() * backoffBaseMs, ctx.abortSignal);
    }

    throw unavailable({
      clientId: config.clientId,
      reason: "retries_exhausted",
      status: lastStatus ?? 0,
    });
  }

  return { id: config.clientId, search };
}
