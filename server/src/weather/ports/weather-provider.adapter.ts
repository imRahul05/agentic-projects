import { WeatherCapability } from "../../config/config.types.js";
import { CallContext } from "./call-context.js";
import { ConditionsPort } from "./conditions.port.js";
import { ForecastPort } from "./forecast.port.js";
import { GeocodingPort } from "./geocoding.port.js";

export interface HealthCheckResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly latencyMs?: number;
}

export interface WeatherProviderAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<WeatherCapability>;
  readonly geocoding?: GeocodingPort;
  readonly conditions?: ConditionsPort;
  readonly forecast?: ForecastPort;
  health(ctx: CallContext): Promise<HealthCheckResult>;
}
