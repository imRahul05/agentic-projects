import { UnitSystem, WeatherCapability } from "../config/config.types.js";
import { LocationInput, LocationRef } from "./domain/location.types.js";
import { CurrentConditions, Forecast, WeatherComparison } from "./domain/weather.types.js";
import { CallContext } from "./ports/call-context.js";
import { CurrentOptions } from "./ports/conditions.port.js";
import { ForecastOptions } from "./ports/forecast.port.js";
import { GeocodeQuery } from "./ports/geocoding.port.js";

export interface CompareOptions {
  readonly days?: number;
  readonly units?: UnitSystem;
  readonly locale?: string;
}

export interface WeatherService {
  searchLocations(query: GeocodeQuery, ctx: CallContext): Promise<readonly LocationRef[]>;
  resolveLocation(input: LocationInput, ctx: CallContext): Promise<LocationRef>;
  getCurrent(input: LocationInput, options: CurrentOptions, ctx: CallContext): Promise<CurrentConditions>;
  getForecast(input: LocationInput, options: ForecastOptions, ctx: CallContext): Promise<Forecast>;
  compare(inputs: readonly LocationInput[], options: CompareOptions, ctx: CallContext): Promise<WeatherComparison>;
  capabilities(): ReadonlySet<WeatherCapability>;
}
