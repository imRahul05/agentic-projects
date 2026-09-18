import express, { type Express } from "express";
import type { Container } from "./container.js";
import { createAccessLog } from "./http/middleware/access-log.js";
import { createErrorHandler } from "./http/middleware/error-handler.js";
import { requestId } from "./http/middleware/request-id.js";
import { createSecurityMiddleware } from "./http/middleware/security.js";
import { createRouter } from "./http/routes/index.js";
import { AppError } from "./platform/errors/app-error.js";

/**
 * Builds the Express application. Deliberately does not listen: the app is then
 * constructible in a test without a socket, and `server.ts` owns the lifecycle.
 *
 * Middleware order matters and is the point of this function:
 *   1. request id  — so every later log line and error body can be correlated
 *   2. security    — helmet, then CORS (preflights must not reach the body parser)
 *   3. access log  — after the id exists, before anything can fail
 *   4. body parser — bounded by config
 *   5. routes, then 404, then the error handler last
 *
 * There is intentionally no response compression anywhere: a compressor in front
 * of `POST /chat` buffers the token stream and destroys the streaming UX.
 */
export function createApp(container: Container): Express {
  const app = express();
  const { config } = container;

  app.disable("x-powered-by");
  // Rate-limit keys and access logs are only honest if the proxy chain is known.
  app.set("trust proxy", config.http.trustProxy);

  app.use(requestId());
  app.use(...createSecurityMiddleware(config.http));
  app.use(createAccessLog({ logger: container.logger, clock: container.clock }));
  app.use(express.json({ limit: config.http.bodyLimitBytes }));

  app.use(createRouter({ container }));

  // The error taxonomy has no NOT_FOUND code — an unknown path is a bad request
  // from our point of view — so the status is set explicitly.
  app.use((_req, _res, next): void => {
    next(
      new AppError("VALIDATION_ERROR", {
        status: 404,
        publicMessage: "Not found.",
      }),
    );
  });

  app.use(
    createErrorHandler({
      config,
      logger: container.logger,
      metrics: container.metrics,
    }),
  );

  return app;
}
