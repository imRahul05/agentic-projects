import type { ErrorRequestHandler } from "express";
import type { AppConfig } from "../../config/config.types.js";
import { AppError, isAbortError } from "../../platform/errors/app-error.js";
import { createTextMasker } from "../../platform/errors/mask.js";
import { collectSensitiveValues } from "../../platform/errors/sensitive-values.js";
import { toHttpError, type HttpErrorResponse } from "../../platform/errors/to-http.js";
import type { Logger } from "../../platform/logging/logger.port.js";
import type { Metrics } from "../../platform/metrics/metrics.port.js";

export interface ErrorHandlerDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly metrics: Metrics;
}

function describeCause(cause: unknown): string | undefined {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  if (cause === undefined || cause === null) return undefined;
  return String(cause);
}

/**
 * The single place an error becomes a response.
 *
 * Express 4 identifies error middleware by arity, so all four parameters must
 * stay declared even though `next` is never called.
 */
export function createErrorHandler(deps: ErrorHandlerDeps): ErrorRequestHandler {
  const mask = createTextMasker(collectSensitiveValues(deps.config));

  return (err: unknown, req, res, _next): void => {
    // A client hanging up is the normal end of a cancelled stream, not a fault.
    const normalized = isAbortError(err)
      ? new AppError("REQUEST_ABORTED", {
          publicMessage: "The request was cancelled.",
          cause: err,
        })
      : AppError.from(err, {
          code: "INTERNAL_ERROR",
          publicMessage: "An internal server error occurred.",
        });

    const { status, body } = toHttpError(normalized, req.requestId);

    const logMeta = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status,
      code: normalized.code,
    };

    if (normalized.code === "REQUEST_ABORTED") {
      deps.metrics.increment("http.request.aborted", { route: req.path });
      deps.logger.info("request aborted", logMeta);
    } else if (status >= 500) {
      // Full detail stays server-side: message, stack and cause.
      deps.metrics.increment("http.request.failed", { code: normalized.code });
      deps.logger.error("request failed", {
        ...logMeta,
        error: normalized.message,
        cause: describeCause(normalized.cause),
        stack: normalized.stack,
      });
    } else {
      deps.metrics.increment("http.request.rejected", { code: normalized.code });
      deps.logger.warn("request rejected", {
        ...logMeta,
        error: normalized.message,
        cause: describeCause(normalized.cause),
      });
    }

    // Once the UI message stream has started the response is no longer JSON —
    // the stream carries its own error part (see chat-stream's `onError`).
    if (res.headersSent) {
      if (!res.writableEnded) res.end();
      return;
    }

    const safeBody: HttpErrorResponse = {
      error: {
        code: body.error.code,
        message: mask(body.error.message),
        retryable: body.error.retryable,
        requestId: body.error.requestId,
        // `meta` is only ever a field-error map for validation failures; for
        // every other code it may carry internals, so it is dropped.
        details: normalized.code === "VALIDATION_ERROR" ? body.error.details : undefined,
      },
    };

    res.status(status).json(safeBody);
  };
}
