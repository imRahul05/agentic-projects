import { AppError } from "../../../platform/errors/app-error.js";
import type { SearchClient, SearchHit, SearchQuery } from "../search-client.port.js";

export interface FakeSearchClientOptions {
  /** Client id, supplied by the caller so no identifier is baked into code. */
  readonly id: string;
  /** Query substring (matched case-insensitively) to the hits it should return. */
  readonly fixtures?: Readonly<Record<string, readonly SearchHit[]>>;
  /** When set, every call rejects with this error — used to exercise failure paths. */
  readonly failWith?: Error;
}

/**
 * Deterministic search client for tests and keyless local runs. Unmatched
 * queries return `[]`, because "the web had nothing useful" is an outcome the
 * agent has to be able to report rather than an error it can retry away.
 */
export class FakeSearchClient implements SearchClient {
  public readonly id: string;
  private readonly fixtures: Readonly<Record<string, readonly SearchHit[]>>;
  private readonly failWith?: Error;
  private callCount = 0;

  constructor(options: FakeSearchClientOptions) {
    this.id = options.id;
    this.fixtures = options.fixtures ?? {};
    this.failWith = options.failWith;
  }

  /** Number of times `search` was entered; lets tests assert cache behaviour. */
  get calls(): number {
    return this.callCount;
  }

  async search(q: SearchQuery, ctx: { abortSignal?: AbortSignal }): Promise<readonly SearchHit[]> {
    this.callCount += 1;

    if (ctx.abortSignal?.aborted === true) {
      throw new AppError("REQUEST_ABORTED", {
        publicMessage: "The request was cancelled before the search completed.",
      });
    }

    if (this.failWith !== undefined) {
      throw this.failWith;
    }

    const needle = q.query.toLowerCase();
    for (const [fragment, hits] of Object.entries(this.fixtures)) {
      if (needle.includes(fragment.toLowerCase())) {
        return hits.slice(0, q.maxResults);
      }
    }

    return [];
  }
}
