import { tool } from "ai";
import { z } from "zod";
import { UnitSystem } from "../../config/config.types.js";
import { WeatherComparison } from "../../weather/domain/weather.types.js";
import { ToolContext } from "./tool-context.js";

export interface CompareWeatherInput {
  readonly locations: readonly string[];
  readonly days?: number;
  readonly units?: UnitSystem;
}

export interface CompareWeatherOutput {
  readonly ok: boolean;
  readonly data?: WeatherComparison;
  readonly code?: string;
  readonly message?: string;
}

const inputSchema = z.object({
  locations: z
    .array(z.string().min(1))
    .min(2)
    .max(5)
    .describe("List of 2 to 5 location names to compare, e.g. ['London', 'Paris']"),
  days: z
    .number()
    .int()
    .min(1)
    .max(7)
    .optional()
    .describe("Number of forecast days to compare (default 3)"),
  units: z
    .enum(["metric", "imperial"])
    .optional()
    .describe("Temperature and speed units: 'metric' (°C, km/h) or 'imperial' (°F, mph)"),
});

export const compareWeatherTool = tool<CompareWeatherInput, CompareWeatherOutput, ToolContext>({
  description:
    "Compare current weather conditions and forecasts between 2 to 5 different locations side-by-side.",
  inputSchema,
  execute: async ({ locations, days, units }, { context, abortSignal }) => {
    const ctx = context;
    if (!ctx) {
      return { ok: false, code: "INTERNAL_ERROR", message: "Tool context missing" };
    }

    try {
      const selectedUnits = units || ctx.units;
      const data = await ctx.weather.compare(
        locations,
        { days, units: selectedUnits, locale: ctx.locale },
        { signal: abortSignal || ctx.signal, requestId: ctx.requestId }
      );
      return { ok: true, data };
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      return { ok: false, code: "FETCH_FAILED", message: e.message };
    }
  },
});
