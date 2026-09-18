import { AppError, ErrorCode } from "./app-error.js";

export interface HttpErrorResponse {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly retryable: boolean;
    readonly requestId?: string;
    readonly details?: Readonly<Record<string, string | number | boolean>>;
  };
}

export function toHttpError(error: Error, requestId?: string): {
  status: number;
  body: HttpErrorResponse;
} {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.publicMessage,
          retryable: error.retryable,
          requestId,
          details: error.meta,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal server error occurred.",
        retryable: false,
        requestId,
      },
    },
  };
}
