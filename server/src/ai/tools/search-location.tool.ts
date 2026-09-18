import { tool } from "ai";
import { z } from "zod";
import { LocationRef } from "../../weather/domain/location.types.js";
import { ToolContext } from "./tool-context.js";

export interface SearchLocationOutput {
  readonly ok: boolean;
  readonly query: string;
  readonly results: readonly LocationRef[];
  readonly message?: string;
}

const inputSchema = z.object({
  query: z.string().min(1).describe("City or location name to search for (e.g. 'Tokyo', 'London', 'San Francisco')"),
});

export interface SearchLocationInput {
  readonly query: string;
}

export const searchLocationTool = tool<SearchLocationInput, SearchLocationOutput, ToolContext>({
  description:
    "Search for a geographical location by city, region or address. Returns matched locations with latitude/longitude.",
  inputSchema,
  execute: async ({ query }, { context, abortSignal }) => {
    const ctx = context;
    if (!ctx) {
      return { ok: false, query, results: [], message: "Tool context missing" };
    }

    try {
      const results = await ctx.weather.searchLocations(
        { query, limit: 5, locale: ctx.locale },
        { signal: abortSignal || ctx.signal, requestId: ctx.requestId }
      );
      if (results.length === 0) {
        return {
          ok: false,
          query,
          results: [],
          message: `Could not find any location matching "${query}".`,
        };
      }
      return { ok: true, query, results };
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      return { ok: false, query, results: [], message: e.message };
    }
  },
});
