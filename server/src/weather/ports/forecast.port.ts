import { UnitSystem } from "../../config/config.types.js";
import { LocationRef } from "../domain/location.types.js";
import { Forecast } from "../domain/weather.types.js";
import { CallContext } from "./call-context.js";

export interface ForecastOptions {
  readonly days: number;
  readonly units?: UnitSystem;
  readonly locale?: string;
}

export interface ForecastPort {
  getForecast(
    location: LocationRef,
    options: ForecastOptions,
    ctx: CallContext
  ): Promise<Forecast>;
}
