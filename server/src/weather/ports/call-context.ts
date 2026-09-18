export interface CallContext {
  readonly signal?: AbortSignal;
  readonly requestId?: string;
  readonly bypassCache?: boolean;
}
