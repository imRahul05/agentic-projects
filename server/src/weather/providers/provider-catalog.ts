import { WeatherConfig } from "../../config/config.types.js";
import { HttpClient } from "./http-client.js";
import { MockWeatherProvider } from "./mock/mock.provider.js";
import { OpenMeteoProvider } from "./open-meteo/open-meteo.provider.js";
import { WeatherApiProvider } from "./weatherapi/weatherapi.provider.js";
import { WeatherProviderAdapter } from "../ports/weather-provider.adapter.js";

export interface ProviderCatalog {
  get(id: string): WeatherProviderAdapter | undefined;
  getDefault(): WeatherProviderAdapter;
  getFallbacks(): readonly WeatherProviderAdapter[];
  list(): readonly WeatherProviderAdapter[];
}

export function buildProviderCatalog(config: WeatherConfig): ProviderCatalog {
  const providers = new Map<string, WeatherProviderAdapter>();

  // Open-Meteo
  const openMeteoCfg = config.providers["open-meteo"];
  if (openMeteoCfg) {
    const httpClient = new HttpClient(openMeteoCfg.timeoutMs, openMeteoCfg.retries);
    providers.set(
      "open-meteo",
      new OpenMeteoProvider(
        openMeteoCfg.baseUrl,
        openMeteoCfg.geocodingBaseUrl || "https://geocoding-api.open-meteo.com/v1",
        httpClient
      )
    );
  }

  // WeatherAPI
  const weatherApiCfg = config.providers["weatherapi"];
  if (weatherApiCfg && weatherApiCfg.apiKey) {
    const httpClient = new HttpClient(weatherApiCfg.timeoutMs, weatherApiCfg.retries);
    providers.set(
      "weatherapi",
      new WeatherApiProvider(
        weatherApiCfg.apiKey,
        weatherApiCfg.baseUrl,
        httpClient
      )
    );
  }

  // Mock (always registered)
  providers.set("mock", new MockWeatherProvider());

  return {
    get(id: string): WeatherProviderAdapter | undefined {
      return providers.get(id);
    },
    getDefault(): WeatherProviderAdapter {
      const p = providers.get(config.defaultProviderId);
      if (p) return p;
      const fallback = providers.get("open-meteo") || providers.get("mock");
      if (fallback) return fallback;
      throw new Error(`Configured default provider ${config.defaultProviderId} not found`);
    },
    getFallbacks(): readonly WeatherProviderAdapter[] {
      const result: WeatherProviderAdapter[] = [];
      for (const id of config.fallbackProviderIds) {
        const p = providers.get(id);
        if (p) result.push(p);
      }
      return result;
    },
    list(): readonly WeatherProviderAdapter[] {
      return Array.from(providers.values());
    },
  };
}
