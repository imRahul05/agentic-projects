import { UnitSystem } from "../../config/config.types.js";
import { LocationRef } from "../domain/location.types.js";
import { CurrentConditions } from "../domain/weather.types.js";
import { CallContext } from "./call-context.js";

export interface CurrentOptions {
  readonly units?: UnitSystem;
  readonly locale?: string;
}

export interface ConditionsPort {
  getCurrent(
    location: LocationRef,
    options: CurrentOptions,
    ctx: CallContext
  ): Promise<CurrentConditions>;
}
