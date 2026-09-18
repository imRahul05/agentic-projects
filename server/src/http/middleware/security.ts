import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import cors from "cors";
import type { RequestHandler } from "express";
import helmet from "helmet";
import type { HttpConfig } from "../../config/config.types.js";

/**
 * Headers the browser must be allowed to read on a cross-origin response. The
 * stream headers are taken from the AI SDK itself (rather than restated here)
 * so a future protocol header cannot silently become invisible to the client.
 */
const EXPOSED_HEADERS: readonly string[] = [
  ...Object.keys(UI_MESSAGE_STREAM_HEADERS),
  "x-request-id",
  "retry-after",
  "ratelimit",
  "ratelimit-policy",
];

const ALLOWED_REQUEST_HEADERS: readonly string[] = [
  "content-type",
  "accept",
  "x-request-id",
  "x-session-id",
];

const ALLOWED_METHODS: readonly string[] = ["GET", "POST", "OPTIONS"];

/**
 * `helmet` + `cors`, in that order. Returned as a list so `createApp` keeps one
 * unambiguous middleware order.
 */
export function createSecurityMiddleware(http: HttpConfig): readonly RequestHandler[] {
  const allowAnyOrigin = http.corsOrigins.includes("*");

  const securityHeaders = helmet({
    // The server returns JSON and an SSE stream, never HTML, so a content
    // security policy has nothing to protect and would only break clients.
    contentSecurityPolicy: false,
    // The browser client is served from a different origin in every
    // environment, so the API must stay readable cross-origin.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  });

  const crossOrigin = cors({
    origin: (origin, callback): void => {
      // A missing Origin header means a same-origin or non-browser caller.
      const allowed = origin === undefined || allowAnyOrigin || http.corsOrigins.includes(origin);
      callback(null, allowed);
    },
    // No cookies or credentials exist anywhere in this service.
    credentials: false,
    methods: [...ALLOWED_METHODS],
    allowedHeaders: [...ALLOWED_REQUEST_HEADERS],
    exposedHeaders: [...EXPOSED_HEADERS],
  });

  return [securityHeaders, crossOrigin];
}
