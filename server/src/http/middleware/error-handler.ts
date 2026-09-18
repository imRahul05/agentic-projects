import { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { toHttpError } from "../../platform/errors/to-http.js";
import { Logger } from "../../platform/logging/logger.port.js";

export function createErrorHandler(logger?: Logger): ErrorRequestHandler {
  return (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    const { status, body } = toHttpError(err, req.id);

    if (status >= 500) {
      logger?.error("Internal server error", {
        requestId: req.id,
        path: req.path,
        method: req.method,
        error: err.message,
        stack: err.stack,
      });
    } else {
      logger?.warn("Request handled with error response", {
        requestId: req.id,
        path: req.path,
        status,
        code: body.error.code,
        message: body.error.message,
      });
    }

    if (res.headersSent) {
      return;
    }

    res.status(status).json(body);
  };
}
