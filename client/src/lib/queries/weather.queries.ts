import { useQuery, UseQueryResult } from "@tanstack/react-query";
import {
  getCapabilitiesApi,
  getWeatherApi,
  GetWeatherParams,
  searchLocationsApi,
} from "../api/weather.api";
import {
  CapabilitiesResponse,
  GeocodeResponse,
  WeatherResponse,
} from "../types/weather.types";

export function useCapabilitiesQuery(): UseQueryResult<CapabilitiesResponse, Error> {
  return useQuery<CapabilitiesResponse, Error>({
    queryKey: ["capabilities"],
    queryFn: getCapabilitiesApi,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

export function useWeatherQuery(
  params: GetWeatherParams,
  enabled: boolean = true
): UseQueryResult<WeatherResponse, Error> {
  return useQuery<WeatherResponse, Error>({
    queryKey: ["weather", params.location, params.lat, params.lon, params.units, params.days],
    queryFn: (): Promise<WeatherResponse> => getWeatherApi(params),
    enabled: enabled && (Boolean(params.location) || (params.lat !== undefined && params.lon !== undefined)),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useSearchLocationQuery(
  query: string,
  enabled: boolean = true
): UseQueryResult<GeocodeResponse, Error> {
  return useQuery<GeocodeResponse, Error>({
    queryKey: ["geocode", query],
    queryFn: (): Promise<GeocodeResponse> => searchLocationsApi(query, 5),
    enabled: enabled && query.trim().length >= 2,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}
