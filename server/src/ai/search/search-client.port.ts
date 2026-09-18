export interface SearchHit {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  /** ISO timestamp when the source reports one; weather answers need recency. */
  readonly publishedAt?: string;
}

export interface SearchQuery {
  readonly query: string;
  readonly maxResults: number;
}

export interface SearchClient {
  readonly id: string;
  /**
   * Resolves with zero or more hits. An empty array is a valid outcome and must
   * never be reported as a failure — only transport or contract problems throw.
   */
  search(q: SearchQuery, ctx: { abortSignal?: AbortSignal }): Promise<readonly SearchHit[]>;
}
