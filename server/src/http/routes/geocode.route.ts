import { NextFunction, Request, RequestHandler, Response, Router } from "express";
import { WeatherService } from "../../weather/weather.service.types.js";
import { geocodeQuerySchema } from "../contracts/weather.contract.js";
import { validateQuery } from "../middleware/validate.js";

export interface GeocodeRouteDeps {
  readonly weatherService: WeatherService;
  readonly rateLimiter: RequestHandler;
}

export function createGeocodeRouter(deps: GeocodeRouteDeps): Router {
  const router = Router();

  router.get(
    "/geocode",
    deps.rateLimiter,
    validateQuery(geocodeQuerySchema),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const query = geocodeQuerySchema.parse(req.query);
        const locations = await deps.weatherService.searchLocations(
          {
            query: query.q,
            limit: query.limit,
            locale: query.locale,
          },
          {
            requestId: req.id,
          }
        );

        res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
        res.json({
          locations,
          meta: {
            count: locations.length,
          },
        });
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        next(e);
      }
    }
  );

  return router;
}
