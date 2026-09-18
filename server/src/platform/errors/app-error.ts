/**
 * The complete error taxonomy for the web-search weather agent.
 *
 * Note there is deliberately no code for "search found nothing": an empty
 * result set is a normal outcome the agent must report to the user, not a
 * failure. Treating it as an error is what tempts a model to answer from its
 * training data instead.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "MODEL_UNAVAILABLE"
  | "SEARCH_UNAVAILABLE"
  | "RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "AGENT_LIMIT_EXCEEDED"
  | "REQUEST_ABORTED"
  | "INTERNAL_ERROR";

export type ErrorMeta = Readonly<Record<string, string | number | boolean>>;

export interface AppErrorDetails {
  /** Overrides the default status for the code. */
  readonly status?: number;
  /** Safe to return to the client: never contains provider names, URLs or keys. */
  readonly publicMessage: string;
  readonly cause?: unknown;
  readonly retryable?: boolean;
  readonly meta?: ErrorMeta;
}

const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 422,
  MODEL_UNAVAILABLE: 422,
  SEARCH_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  UPSTREAM_TIMEOUT: 504,
  AGENT_LIMIT_EXCEEDED: 500,
  REQUEST_ABORTED: 499,
  INTERNAL_ERROR: 500,
};

const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "SEARCH_UNAVAILABLE",
  "RATE_LIMITED",
  "UPSTREAM_TIMEOUT",
]);

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly publicMessage: string;
  public readonly retryable: boolean;
  public readonly meta?: ErrorMeta;

  constructor(code: ErrorCode, details: AppErrorDetails) {
    super(details.publicMessage, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "AppError";
    this.code = code;
    this.status = details.status ?? STATUS_BY_CODE[code];
    this.publicMessage = details.publicMessage;
    this.retryable = details.retryable ?? RETRYABLE_CODES.has(code);
    this.meta = details.meta;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }

  /** Wraps an unknown thrown value, preserving an existing AppError unchanged. */
  static from(error: unknown, fallback: { code: ErrorCode; publicMessage: string; meta?: ErrorMeta }): AppError {
    if (AppError.isAppError(error)) return error;
    return new AppError(fallback.code, {
      publicMessage: fallback.publicMessage,
      cause: error,
      meta: fallback.meta,
    });
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError" || error.name === "APICallAbortError")
  );
}
