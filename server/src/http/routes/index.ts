import { Router } from "express";
import type { Container } from "../../container.js";
import { createRateLimiters } from "../middleware/rate-limit.js";
import { createCapabilitiesRouter } from "./capabilities.route.js";
import { createChatRouter } from "./chat.route.js";
import { createHealthRouter } from "./health.route.js";

export interface RouterDeps {
  readonly container: Container;
}

/**
 * The whole route tree.
 *
 * The API lives under `config.http.basePath`; the health probes stay at the root
 * because an orchestrator's probe path must not move when the API's does.
 */
export function createRouter(deps: RouterDeps): Router {
  const router = Router();
  const limiters = createRateLimiters(deps.container.config.rateLimit);

  router.use(createHealthRouter({ container: deps.container }));

  const api = Router();
  api.use(createChatRouter({ container: deps.container, rateLimiters: limiters.chat }));
  api.use(createCapabilitiesRouter({ container: deps.container, rateLimiters: limiters.read }));

  router.use(deps.container.config.http.basePath, api);

  return router;
}
