import { z } from "zod";

export const openMeteoGeocodingItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional().default(""),
  admin1: z.string().optional().default(""),
  timezone: z.string().optional(),
});

export const openMeteoGeocodingResponseSchema = z.object({
  results: z.array(openMeteoGeocodingItemSchema).optional(),
});

export type OpenMeteoGeocodingResponse = z.infer<typeof openMeteoGeocodingResponseSchema>;
export type OpenMeteoGeocodingItem = z.infer<typeof openMeteoGeocodingItemSchema>;

export const openMeteoCurrentSchema = z.object({
  time: z.string(),
  temperature_2m: z.number(),
  relative_humidity_2m: z.number(),
  apparent_temperature: z.number(),
  is_day: z.number(),
  precipitation: z.number().default(0),
  weather_code: z.number(),
  wind_speed_10m: z.number(),
});

export const openMeteoDailySchema = z.object({
  time: z.array(z.string()),
  weather_code: z.array(z.number()),
  temperature_2m_max: z.array(z.number()),
  temperature_2m_min: z.array(z.number()),
  precipitation_sum: z.array(z.number()).default([]),
  precipitation_probability_max: z.array(z.number()).default([]),
});

export const openMeteoForecastResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().default("UTC"),
  current: openMeteoCurrentSchema,
  daily: openMeteoDailySchema.optional(),
});

export type OpenMeteoForecastResponse = z.infer<typeof openMeteoForecastResponseSchema>;
