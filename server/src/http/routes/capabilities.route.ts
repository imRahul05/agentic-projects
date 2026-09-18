import { Request, Response, Router } from "express";
import { ModelResolver } from "../../ai/provider/model-resolver.js";
import { AppConfig } from "../../config/config.types.js";
import { WeatherService } from "../../weather/weather.service.types.js";

export interface CapabilitiesRouteDeps {
  readonly modelResolver: ModelResolver;
  readonly weatherService: WeatherService;
  readonly config: AppConfig;
}

export function createCapabilitiesRouter(deps: CapabilitiesRouteDeps): Router {
  const router = Router();

  router.get("/capabilities", (_req: Request, res: Response): void => {
    const models = deps.modelResolver.listSelectable();
    const weatherCaps = Array.from(deps.weatherService.capabilities());

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({
      models,
      units: ["metric", "imperial"],
      weather: {
        capabilities: weatherCaps,
        defaultProvider: deps.config.weather.defaultProviderId,
      },
      limits: {
        maxForecastDays: deps.config.weather.defaults.maxForecastDays,
        maxCompareLocations: 5,
      },
      features: deps.config.features,
    });
  });

  return router;
}
