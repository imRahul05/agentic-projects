import { z } from "zod";
import { UnitSystem } from "../../config/config.types.js";
import { LocationRef } from "../../weather/domain/location.types.js";
import {
  CurrentConditions,
  Forecast,
  ProvenanceMeta,
} from "../../weather/domain/weather.types.js";

export const geocodeQuerySchema = z.object({
  q: z.string().min(1, "Search query 'q' is required"),
  limit: z.coerce.number().int().min(1).max(20).optional().default(5),
  locale: z.string().optional().default("en-US"),
});

export type GeocodeQueryParams = z.infer<typeof geocodeQuerySchema>;

export interface GeocodeResponse {
  readonly locations: readonly LocationRef[];
  readonly meta: {
    readonly count: number;
  };
}

export const weatherQuerySchema = z.object({
  location: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  days: z.coerce.number().int().min(1).max(14).optional().default(5),
  units: z.enum(["metric", "imperial"]).optional().default("metric"),
  include: z.string().optional().default("current,forecast"),
  locale: z.string().optional().default("en-US"),
}).refine(
  (data) => Boolean(data.location || (data.lat !== undefined && data.lon !== undefined)),
  {
    message: "Either 'location' or both 'lat' and 'lon' coordinates must be provided",
    path: ["location"],
  }
);

export type WeatherQueryParams = z.infer<typeof weatherQuerySchema>;

export interface WeatherResponse {
  readonly location: LocationRef;
  readonly current?: CurrentConditions;
  readonly forecast?: Forecast;
  readonly meta: ProvenanceMeta;
}
