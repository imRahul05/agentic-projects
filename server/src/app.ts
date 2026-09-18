import express, { Express } from "express";
import { AppContainer } from "./container.js";
import { createAccessLogMiddleware } from "./http/middleware/access-log.js";
import { createErrorHandler } from "./http/middleware/error-handler.js";
import { requestIdMiddleware } from "./http/middleware/request-id.js";
import { createSecurityMiddlewares } from "./http/middleware/security.js";
import { createAppRouter } from "./http/routes/index.js";

export function createApp(container: AppContainer): Express {
  const app = express();

  // Trust proxy configuration
  app.set("trust proxy", container.config.http.trustProxy);

  // Security middlewares (helmet, cors)
  const { helmetMiddleware, corsMiddleware } = createSecurityMiddlewares(
    container.config.http
  );
  app.use(helmetMiddleware);
  app.use(corsMiddleware);

  // Correlation ID and access logging
  app.use(requestIdMiddleware());
  app.use(createAccessLogMiddleware(container.logger));

  // Body parser with size limit
  app.use(express.json({ limit: container.config.http.bodyLimitBytes }));

  // Routes
  const router = createAppRouter({
    config: container.config,
    weatherService: container.weatherService,
    modelResolver: container.modelResolver,
    cache: container.cache,
    clock: container.clock,
    logger: container.logger,
    metrics: container.metrics,
  });
  app.use(router);

  // Centralized error handler
  app.use(createErrorHandler(container.logger));

  return app;
}
