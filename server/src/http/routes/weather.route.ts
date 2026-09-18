import { NextFunction, Request, RequestHandler, Response, Router } from "express";
import { LocationInput } from "../../weather/domain/location.types.js";
import { WeatherService } from "../../weather/weather.service.types.js";
import { weatherQuerySchema, WeatherResponse } from "../contracts/weather.contract.js";
import { validateQuery } from "../middleware/validate.js";

export interface WeatherRouteDeps {
  readonly weatherService: WeatherService;
  readonly rateLimiter: RequestHandler;
}

export function createWeatherRouter(deps: WeatherRouteDeps): Router {
  const router = Router();

  router.get(
    "/weather",
    deps.rateLimiter,
    validateQuery(weatherQuerySchema),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const query = weatherQuerySchema.parse(req.query);
        const callCtx = { requestId: req.id };

        const locationInput: LocationInput =
          query.lat !== undefined && query.lon !== undefined
            ? { latitude: query.lat, longitude: query.lon, name: query.location }
            : (query.location as string);

        const location = await deps.weatherService.resolveLocation(locationInput, callCtx);
        const include = query.include ? query.include.split(",") : ["current", "forecast"];

        let currentResult;
        let forecastResult;

        if (include.includes("current")) {
          currentResult = await deps.weatherService.getCurrent(
            location,
            { units: query.units, locale: query.locale },
            callCtx
          );
        }

        if (include.includes("forecast")) {
          forecastResult = await deps.weatherService.getForecast(
            location,
            { days: query.days, units: query.units, locale: query.locale },
            callCtx
          );
        }

        const meta =
          currentResult?.meta ||
          forecastResult?.meta || {
            providerId: "weather-service",
            fetchedAt: new Date().toISOString(),
            cacheHit: false,
          };

        const responseData: WeatherResponse = {
          location,
          current: currentResult,
          forecast: forecastResult,
          meta,
        };

        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
        res.json(responseData);
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        next(e);
      }
    }
  );

  return router;
}
