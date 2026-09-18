import { createApp } from "./app.js";
import { loadConfig } from "./config/config.js";
import { buildContainer } from "./container.js";

function bootstrap() {
  const config = loadConfig();
  const container = buildContainer(config);
  const app = createApp(container);

  const server = app.listen(config.http.port, () => {
    container.logger.info("Weather AI Agent server started", {
      port: config.http.port,
      env: config.env,
      basePath: config.http.basePath,
      defaultProvider: config.weather.defaultProviderId,
      defaultModelAlias: config.ai.defaultAlias,
    });
  });

  const shutdown = (signal: string) => {
    container.logger.info(`Received ${signal}, closing server gracefully...`);
    server.close(() => {
      container.logger.info("HTTP server closed. Exiting process.");
      process.exit(0);
    });

    // Force close after 10s if connections linger
    setTimeout(() => {
      container.logger.error("Forced termination after shutdown timeout");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap();
