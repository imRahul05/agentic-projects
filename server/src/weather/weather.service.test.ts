import { describe, expect, it } from "vitest";
import { MemoryCache } from "../platform/cache/memory-cache.js";
import { SystemClock } from "../platform/clock.js";
import { MockWeatherProvider } from "./providers/mock/mock.provider.js";
import { ProviderCatalog } from "./providers/provider-catalog.js";
import { DefaultWeatherService } from "./weather.service.js";

function createTestService() {
  const mockProvider = new MockWeatherProvider();
  const catalog: ProviderCatalog = {
    get: (id: string) => (id === "mock" ? mockProvider : undefined),
    getDefault: () => mockProvider,
    getFallbacks: () => [],
    list: () => [mockProvider],
  };

  const cache = new MemoryCache(100, new SystemClock(), true);
  const config = {
    defaultProviderId: "mock",
    fallbackProviderIds: [],
    providers: {},
    defaults: {
      units: "metric" as const,
      forecastDays: 5,
      maxForecastDays: 14,
      geocodeLimit: 5,
      locale: "en-US",
    },
  };

  const service = new DefaultWeatherService(catalog, cache, config);
  return { service, mockProvider, cache };
}

describe("DefaultWeatherService", () => {
  it("searches locations successfully and caches the result", async () => {
    const { service } = createTestService();
    const results = await service.searchLocations(
      { query: "Tokyo", limit: 5 },
      { requestId: "test-req" }
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("Tokyo");

    // Second call should hit cache
    const cached = await service.searchLocations(
      { query: "Tokyo", limit: 5 },
      { requestId: "test-req" }
    );
    expect(cached).toEqual(results);
  });

  it("fetches current weather conditions", async () => {
    const { service } = createTestService();
    const current = await service.getCurrent(
      "London",
      { units: "metric" },
      { requestId: "test-req" }
    );

    expect(current.location.name).toBe("London");
    expect(current.temperature).toBeDefined();
    expect(current.condition).toBeDefined();
  });

  it("fetches multi-day forecast", async () => {
    const { service } = createTestService();
    const forecast = await service.getForecast(
      "Paris",
      { days: 3, units: "metric" },
      { requestId: "test-req" }
    );

    expect(forecast.location.name).toBe("Paris");
    expect(forecast.days.length).toBe(3);
  });

  it("compares multiple locations", async () => {
    const { service } = createTestService();
    const comparison = await service.compare(
      ["London", "Tokyo"],
      { days: 3, units: "metric" },
      { requestId: "test-req" }
    );

    expect(comparison.items.length).toBe(2);
    expect(comparison.summary).toContain("London");
    expect(comparison.summary).toContain("Tokyo");
  });
});
