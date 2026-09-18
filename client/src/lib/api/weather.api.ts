import {
  CapabilitiesResponse,
  GeocodeResponse,
  UnitSystem,
  WeatherResponse,
} from "../types/weather.types";
import { httpClient } from "./http";

export interface GetWeatherParams {
  readonly location?: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly days?: number;
  readonly units?: UnitSystem;
  readonly include?: string;
  readonly locale?: string;
}

export async function getCapabilitiesApi(): Promise<CapabilitiesResponse> {
  return httpClient.get<CapabilitiesResponse>("/api/capabilities");
}

export async function searchLocationsApi(
  query: string,
  limit: number = 5,
  locale?: string
): Promise<GeocodeResponse> {
  return httpClient.get<GeocodeResponse>("/api/geocode", {
    params: {
      q: query,
      limit,
      locale,
    },
  });
}

export async function getWeatherApi(params: GetWeatherParams): Promise<WeatherResponse> {
  return httpClient.get<WeatherResponse>("/api/weather", {
    params: {
      location: params.location,
      lat: params.lat,
      lon: params.lon,
      days: params.days,
      units: params.units,
      include: params.include,
      locale: params.locale,
    },
  });
}
