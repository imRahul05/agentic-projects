import { Request, Response, Router } from "express";
import { WeatherService } from "../../weather/weather.service.types.js";

export interface HealthRouteDeps {
  readonly weatherService?: WeatherService;
}

export function createHealthRouter(deps?: HealthRouteDeps): Router {
  const router = Router();

  router.get("/healthz", (_req: Request, res: Response): void => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  router.get("/readyz", (_req: Request, res: Response): void => {
    res.json({
      status: "ready",
      timestamp: new Date().toISOString(),
      capabilities: deps?.weatherService
        ? Array.from(deps.weatherService.capabilities())
        : [],
    });
  });

  return router;
}
