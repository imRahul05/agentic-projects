import { tool } from "ai";
import { z } from "zod";
import { UnitSystem } from "../../config/config.types.js";
import { Forecast } from "../../weather/domain/weather.types.js";
import { ToolContext } from "./tool-context.js";

export interface GetForecastInput {
  readonly location: string;
  readonly days?: number;
  readonly units?: UnitSystem;
}

export interface GetForecastOutput {
  readonly ok: boolean;
  readonly data?: Forecast;
  readonly code?: string;
  readonly message?: string;
}

const inputSchema = z.object({
  location: z.string().min(1).describe("City or location name, e.g. 'London' or 'Sydney'"),
  days: z.number().int().min(1).max(14).optional().describe("Number of forecast days (1 to 14, default 5)"),
  units: z.enum(["metric", "imperial"]).optional().describe("Temperature and speed units: 'metric' (°C, km/h) or 'imperial' (°F, mph)"),
});

export const getForecastTool = tool<GetForecastInput, GetForecastOutput, ToolContext>({
  description:
    "Get multi-day daily weather forecast for a specified location, including high/low temperatures, precipitation chance, rain amount, and conditions.",
  inputSchema,
  execute: async ({ location, days, units }, { context, abortSignal }) => {
    const ctx = context;
    if (!ctx) {
      return { ok: false, code: "INTERNAL_ERROR", message: "Tool context missing" };
    }

    try {
      const selectedUnits = units || ctx.units;
      const forecastDays = days || 5;
      const data = await ctx.weather.getForecast(
        location,
        { days: forecastDays, units: selectedUnits, locale: ctx.locale },
        { signal: abortSignal || ctx.signal, requestId: ctx.requestId }
      );
      return { ok: true, data };
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      return { ok: false, code: "FETCH_FAILED", message: e.message };
    }
  },
});
