import { tool } from "ai";
import { z } from "zod";
import { UnitSystem } from "../../config/config.types.js";
import { CurrentConditions } from "../../weather/domain/weather.types.js";
import { ToolContext } from "./tool-context.js";

export interface GetCurrentWeatherInput {
  readonly location: string;
  readonly units?: UnitSystem;
}

export interface GetCurrentWeatherOutput {
  readonly ok: boolean;
  readonly data?: CurrentConditions;
  readonly code?: string;
  readonly message?: string;
}

const inputSchema = z.object({
  location: z.string().min(1).describe("City or location name, e.g. 'Paris', 'New York', or 'Tokyo'"),
  units: z.enum(["metric", "imperial"]).optional().describe("Temperature and speed units: 'metric' (°C, km/h) or 'imperial' (°F, mph)"),
});

export const getCurrentWeatherTool = tool<GetCurrentWeatherInput, GetCurrentWeatherOutput, ToolContext>({
  description:
    "Get the current real-time weather conditions for a specified location, including temperature, humidity, wind, UV index, and weather description.",
  inputSchema,
  execute: async ({ location, units }, { context, abortSignal }) => {
    const ctx = context;
    if (!ctx) {
      return { ok: false, code: "INTERNAL_ERROR", message: "Tool context missing" };
    }

    try {
      const selectedUnits = units || ctx.units;
      const data = await ctx.weather.getCurrent(
        location,
        { units: selectedUnits, locale: ctx.locale },
        { signal: abortSignal || ctx.signal, requestId: ctx.requestId }
      );
      return { ok: true, data };
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      return { ok: false, code: "FETCH_FAILED", message: e.message };
    }
  },
});
