import { z } from "zod";

export const weatherApiLocationSchema = z.object({
  name: z.string(),
  region: z.string().default(""),
  country: z.string().default(""),
  lat: z.number(),
  lon: z.number(),
  tz_id: z.string().optional(),
  localtime: z.string().default(""),
});

export const weatherApiConditionSchema = z.object({
  text: z.string().default("Clear"),
});

export const weatherApiCurrentSchema = z.object({
  temp_c: z.number(),
  feelslike_c: z.number(),
  condition: weatherApiConditionSchema,
  humidity: z.number(),
  wind_kph: z.number(),
  precip_mm: z.number().default(0),
  uv: z.number().default(0),
  is_day: z.number().default(1),
  last_updated: z.string().default(""),
});

export const weatherApiDaySchema = z.object({
  maxtemp_c: z.number(),
  mintemp_c: z.number(),
  condition: weatherApiConditionSchema,
  daily_chance_of_rain: z.number().default(0),
  totalprecip_mm: z.number().default(0),
  maxwind_kph: z.number().optional(),
});

export const weatherApiForecastDayItemSchema = z.object({
  date: z.string(),
  day: weatherApiDaySchema,
});

export const weatherApiSearchItemSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  region: z.string().default(""),
  country: z.string().default(""),
  lat: z.number(),
  lon: z.number(),
  url: z.string().optional(),
});

export const weatherApiResponseSchema = z.object({
  location: weatherApiLocationSchema,
  current: weatherApiCurrentSchema,
  forecast: z
    .object({
      forecastday: z.array(weatherApiForecastDayItemSchema),
    })
    .optional(),
});

export type WeatherApiResponse = z.infer<typeof weatherApiResponseSchema>;
export type WeatherApiSearchItem = z.infer<typeof weatherApiSearchItemSchema>;
