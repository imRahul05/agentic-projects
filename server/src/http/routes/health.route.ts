import { Router } from "express";
import type { Container } from "../../container.js";
import type { SearchMode } from "../../config/config.types.js";

export interface HealthRouteDeps {
  readonly container: Container;
}

export interface LivenessResponse {
  readonly status: "ok";
  readonly service: string;
  readonly time: string;
}

export interface ReadinessResponse {
  readonly status: "ready" | "not-ready";
  /** Configured provider ids only — never keys, base URLs or model ids. */
  readonly providers: readonly string[];
  readonly search: {
    readonly mode: SearchMode;
    readonly ok: boolean;
  };
}

export function createHealthRouter(deps: HealthRouteDeps): Router {
  const router = Router();
  const { config, clock } = deps.container;
  const providers = Object.keys(config.ai.providers);

  /**
   * Liveness answers one question — is this process running — so it makes no
   * upstream call and is never rate limited.
   */
  router.get("/healthz", (_req, res): void => {
    const payload: LivenessResponse = {
      status: "ok",
      service: config.observability.serviceName,
      time: clock.nowIso(),
    };
    res.json(payload);
  });

  /**
   * Readiness is still local: it reports whether this deployment is *configured*
   * to serve traffic. Probing a provider would turn a health check into a bill
   * and make readiness flap on someone else's outage.
   */
  router.get("/readyz", (_req, res): void => {
    const searchOk =
      config.search.mode === "native"
        ? providers.every(
            (providerId) => config.search.native.toolIdByProvider[providerId] !== undefined,
          )
        : config.search.external !== undefined && config.search.external.apiKey.length > 0;

    const ready = providers.length > 0 && searchOk;
    const payload: ReadinessResponse = {
      status: ready ? "ready" : "not-ready",
      providers,
      search: { mode: config.search.mode, ok: searchOk },
    };

    res.status(ready ? 200 : 503).json(payload);
  });

  return router;
}
