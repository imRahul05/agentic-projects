export type ErrorCode =
  | "VALIDATION_ERROR"
  | "LOCATION_NOT_FOUND"
  | "LOCATION_AMBIGUOUS"
  | "MODEL_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_CONTRACT_ERROR"
  | "RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "AGENT_LIMIT_EXCEEDED"
  | "REQUEST_ABORTED"
  | "INTERNAL_ERROR";

export interface AppErrorDetails {
  readonly status?: number;
  readonly publicMessage: string;
  readonly cause?: Error | string;
  readonly retryable?: boolean;
  readonly meta?: Readonly<Record<string, string | number | boolean>>;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly publicMessage: string;
  public readonly retryable: boolean;
  public readonly meta?: Readonly<Record<string, string | number | boolean>>;

  constructor(code: ErrorCode, details: AppErrorDetails) {
    super(details.publicMessage);
    this.name = "AppError";
    this.code = code;
    this.status = details.status ?? defaultStatusForCode(code);
    this.publicMessage = details.publicMessage;
    this.retryable = details.retryable ?? defaultRetryableForCode(code);
    this.meta = details.meta;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

function defaultStatusForCode(code: ErrorCode): number {
  switch (code) {
    case "VALIDATION_ERROR":
      return 422;
    case "LOCATION_NOT_FOUND":
      return 404;
    case "LOCATION_AMBIGUOUS":
      return 400;
    case "MODEL_UNAVAILABLE":
      return 422;
    case "PROVIDER_UNAVAILABLE":
      return 503;
    case "PROVIDER_CONTRACT_ERROR":
      return 502;
    case "RATE_LIMITED":
      return 429;
    case "UPSTREAM_TIMEOUT":
      return 504;
    case "AGENT_LIMIT_EXCEEDED":
      return 500;
    case "REQUEST_ABORTED":
      return 499;
    case "INTERNAL_ERROR":
    default:
      return 500;
  }
}

function defaultRetryableForCode(code: ErrorCode): boolean {
  switch (code) {
    case "PROVIDER_UNAVAILABLE":
    case "UPSTREAM_TIMEOUT":
    case "RATE_LIMITED":
      return true;
    default:
      return false;
  }
}
