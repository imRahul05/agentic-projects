import { NextFunction, Request, RequestHandler, Response, Router } from "express";
import { createWeatherAgent } from "../../ai/agent/agent.factory.js";
import { ModelResolver } from "../../ai/provider/model-resolver.js";
import { ToolContext } from "../../ai/tools/tool-context.js";
import { AiConfig } from "../../config/config.types.js";
import { CachePort } from "../../platform/cache/cache.port.js";
import { Clock } from "../../platform/clock.js";
import { Logger } from "../../platform/logging/logger.port.js";
import { Metrics } from "../../platform/metrics/metrics.port.js";
import { WeatherService } from "../../weather/weather.service.types.js";
import { chatRequestSchema, ChatRequest } from "../contracts/chat.contract.js";
import { validateBody } from "../middleware/validate.js";
import { streamChatToResponse } from "../stream/chat-stream.js";

export interface ChatRouteDeps {
  readonly weatherService: WeatherService;
  readonly modelResolver: ModelResolver;
  readonly aiConfig: AiConfig;
  readonly cache: CachePort;
  readonly clock: Clock;
  readonly logger?: Logger;
  readonly metrics?: Metrics;
  readonly rateLimiter: RequestHandler;
}

export function createChatRouter(deps: ChatRouteDeps): Router {
  const router = Router();

  router.post(
    "/chat",
    deps.rateLimiter,
    validateBody(chatRequestSchema),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const body = req.body as ChatRequest;
      const abortController = new AbortController();

      req.on("close", () => {
        if (!res.writableEnded) {
          abortController.abort();
          deps.logger?.info("Chat request client disconnected/aborted", {
            requestId: req.id,
          });
        }
      });

      const toolContext: ToolContext = {
        weather: deps.weatherService,
        cache: deps.cache,
        logger: deps.logger,
        metrics: deps.metrics,
        clock: deps.clock,
        requestId: req.id || "chat-request",
        units: body.units,
        locale: body.locale,
        timezone: body.timezone,
        signal: abortController.signal,
      };

      try {
        const agent = createWeatherAgent(
          {
            modelResolver: deps.modelResolver,
            config: deps.aiConfig,
            clock: deps.clock,
          },
          {
            modelAlias: body.modelAlias,
            units: body.units,
            locale: body.locale,
            timezone: body.timezone,
            toolContext,
          }
        );

        await streamChatToResponse({
          res,
          agent,
          messages: body.messages,
          abortSignal: abortController.signal,
          modelAlias: body.modelAlias,
        });
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        next(e);
      }
    }
  );

  return router;
}
