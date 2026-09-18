import { NextFunction, Request, Response } from "express";
import { Logger } from "../../platform/logging/logger.port.js";

export function createAccessLogMiddleware(logger?: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - start;
      logger?.info("HTTP Request", {
        requestId: req.id,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs,
      });
    });
    next();
  };
}
