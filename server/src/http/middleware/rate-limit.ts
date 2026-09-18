import { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { RateLimitConfig } from "../../config/config.types.js";
import { AppError } from "../../platform/errors/app-error.js";

export function createRateLimiters(config: RateLimitConfig): {
  chatRateLimiter: RequestHandler;
  readRateLimiter: RequestHandler;
} {
  const rateLimitHandler = (
    _req: Request,
    _res: Response,
    next: NextFunction
  ): void => {
    next(
      new AppError("RATE_LIMITED", {
        status: 429,
        publicMessage: "Too many requests. Please wait a moment and try again.",
        retryable: true,
      })
    );
  };

  const chatRateLimiter = rateLimit({
    windowMs: config.chat.windowMs,
    limit: config.chat.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: rateLimitHandler,
  });

  const readRateLimiter = rateLimit({
    windowMs: config.read.windowMs,
    limit: config.read.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: rateLimitHandler,
  });

  return { chatRateLimiter, readRateLimiter };
}
