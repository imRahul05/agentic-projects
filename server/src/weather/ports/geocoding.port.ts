import { LocationRef } from "../domain/location.types.js";
import { CallContext } from "./call-context.js";

export interface GeocodeQuery {
  readonly query: string;
  readonly limit?: number;
  readonly locale?: string;
}

export interface GeocodingPort {
  geocode(query: GeocodeQuery, ctx: CallContext): Promise<readonly LocationRef[]>;
}
