import type { RequestHandler } from "express";
import type { Clock } from "../../platform/clock.js";
import type { Logger } from "../../platform/logging/logger.port.js";

export interface AccessLogDeps {
  readonly logger: Logger;
  readonly clock: Clock;
}

/**
 * One structured line per request. `close` is watched as well as `finish`
 * because a cancelled stream never finishes, and an access log that silently
 * omits abandoned requests hides exactly the traffic worth looking at.
 */
export function createAccessLog(deps: AccessLogDeps): RequestHandler {
  return (req, res, next): void => {
    const startedAtMs = deps.clock.timestampMs();
    let logged = false;

    const write = (completed: boolean): void => {
      if (logged) return;
      logged = true;
      deps.logger.info("http_request", {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: deps.clock.timestampMs() - startedAtMs,
        completed,
      });
    };

    res.on("finish", () => write(true));
    res.on("close", () => write(res.writableEnded));

    next();
  };
}
