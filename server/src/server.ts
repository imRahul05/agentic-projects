import type { Server } from "node:http";
import { createApp } from "./app.js";
import { ConfigError, loadConfig } from "./config/config.js";
import type { AppConfig } from "./config/config.types.js";
import { buildContainer, type Container } from "./container.js";
import type { Logger } from "./platform/logging/logger.port.js";

const FATAL_EXIT_CODE = 1;

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      // Before a logger exists, and a misconfigured deployment must be told
      // everything that is wrong with it at once.
      process.stderr.write("Configuration is invalid; the server will not start.\n");
      for (const issue of error.issues) {
        process.stderr.write(`  - ${issue}\n`);
      }
      process.exit(FATAL_EXIT_CODE);
    }
    throw error;
  }
}

/**
 * Stop accepting connections, let in-flight requests drain, then exit. The drain
 * budget is the configured request timeout: by definition nothing legitimate
 * still needs the process after that.
 */
function installShutdownHandlers(server: Server, container: Container): void {
  const drainTimeoutMs = container.config.http.requestTimeoutMs;
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    container.logger.info("shutdown started", { signal, drainTimeoutMs });

    const forceExit = setTimeout(() => {
      container.logger.error("shutdown timed out, forcing exit", { signal, drainTimeoutMs });
      process.exit(FATAL_EXIT_CODE);
    }, drainTimeoutMs);
    // A pending force-exit timer must never be the reason the process lingers.
    forceExit.unref();

    server.close((error) => {
      clearTimeout(forceExit);
      if (error !== undefined) {
        container.logger.error("shutdown failed to close the server", { error: error.message });
        process.exit(FATAL_EXIT_CODE);
      }
      container.logger.info("shutdown complete", { signal });
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

function installProcessGuards(logger: Logger): void {
  // Neither of these leaves the process in a state worth trusting, so both log
  // and exit non-zero and let the supervisor restart us.
  process.on("unhandledRejection", (reason: unknown) => {
    logger.error("unhandled promise rejection", {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    process.exit(FATAL_EXIT_CODE);
  });

  process.on("uncaughtException", (error: Error) => {
    logger.error("uncaught exception", { error: error.message, stack: error.stack });
    process.exit(FATAL_EXIT_CODE);
  });
}

function main(): void {
  const config = loadConfigOrExit();
  const container = buildContainer(config);
  installProcessGuards(container.logger);

  // `createApp` also sets `trust proxy` from the same config value.
  const app = createApp(container);

  const server = app.listen(config.http.port, () => {
    container.logger.info("server listening", {
      port: config.http.port,
      basePath: config.http.basePath,
      searchMode: config.search.mode,
      defaultModelAlias: config.ai.defaultAlias,
    });
  });

  // Timeouts come from config, which already guarantees
  // requestTimeoutMs >= agent.totalTimeoutMs — so a long agent turn is never cut
  // off by the HTTP layer.
  server.requestTimeout = config.http.requestTimeoutMs;
  server.headersTimeout = config.http.requestTimeoutMs;
  // Socket inactivity must not kill a stream that is waiting on a slow search
  // step; 0 disables the inactivity timer entirely.
  server.timeout = 0;

  installShutdownHandlers(server, container);
}

main();
