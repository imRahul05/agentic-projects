import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit, { type Options } from "express-rate-limit";
import type { RateLimitBucketConfig, RateLimitConfig } from "../../config/config.types.js";
import { AppError } from "../../platform/errors/app-error.js";

export interface RateLimiters {
  /** Tight bucket for the one expensive endpoint. */
  readonly chat: readonly RequestHandler[];
  /** Loose bucket for the cheap read endpoints. */
  readonly read: readonly RequestHandler[];
}

/** The part of a request that keying looks at — so keys are testable on their own. */
export interface KeyableRequest {
  readonly ip?: string;
  readonly socket: { readonly remoteAddress?: string };
  header(name: string): string | undefined;
}

const SESSION_HEADER = "x-session-id";
const SANE_SESSION_ID = /^[A-Za-z0-9._:-]{8,64}$/;

/**
 * `req.ip` is only trustworthy because `createApp` sets `trust proxy` from
 * config; behind a proxy with `trustProxy` left off every caller collapses into
 * the proxy's own address, which is the safe direction to fail.
 */
export function addressKey(req: KeyableRequest): string {
  return `addr:${req.ip ?? req.socket.remoteAddress ?? "unknown"}`;
}

export function sessionId(req: KeyableRequest): string | undefined {
  const value = req.header(SESSION_HEADER);
  return value !== undefined && SANE_SESSION_ID.test(value) ? value : undefined;
}

/**
 * The session key always contains the address key, so a client rotating
 * `x-session-id` can only carve narrower buckets out of its own address quota —
 * it can never buy more of it. The header can tighten the limit, never loosen it.
 */
export function sessionScopedKey(req: KeyableRequest): string {
  return `${addressKey(req)}|session:${sessionId(req) ?? "none"}`;
}

/** Rate limiting is an application error like any other, so it goes to the error handler. */
function rejectRateLimited(_req: Request, _res: Response, next: NextFunction): void {
  next(
    new AppError("RATE_LIMITED", {
      publicMessage: "Too many requests. Please wait a moment and try again.",
      retryable: true,
    }),
  );
}

/** The authoritative limiter: keyed on the client address and nothing else. */
export function addressLimiterOptions(bucket: RateLimitBucketConfig): Partial<Options> {
  return {
    windowMs: bucket.windowMs,
    limit: bucket.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req): string => addressKey(req),
    handler: rejectRateLimited,
  };
}

/** The optional narrower limiter, applied only when a sane session id is present. */
export function sessionLimiterOptions(bucket: RateLimitBucketConfig): Partial<Options> {
  return {
    windowMs: bucket.windowMs,
    limit: bucket.max,
    // The authoritative limiter already publishes the standard headers; a second
    // set would overwrite them with a narrower, confusing count.
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req): string => sessionScopedKey(req),
    skip: (req): boolean => sessionId(req) === undefined,
    handler: rejectRateLimited,
  };
}

function createBucketLimiters(bucket: RateLimitBucketConfig): readonly RequestHandler[] {
  return [rateLimit(addressLimiterOptions(bucket)), rateLimit(sessionLimiterOptions(bucket))];
}

export function createRateLimiters(config: RateLimitConfig): RateLimiters {
  return {
    chat: createBucketLimiters(config.chat),
    read: createBucketLimiters(config.read),
  };
}
