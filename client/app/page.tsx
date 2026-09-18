"use client";

import * as React from "react";
import { CloudSun, Sparkles, MessageSquare, AlertCircle, RefreshCw } from "lucide-react";
import { LocationRef, UnitSystem } from "@/lib/types/weather.types";
import { useCapabilitiesQuery, useWeatherQuery } from "@/lib/queries/weather.queries";
import { LocationSearch } from "@/components/weather/location-search";
import { UnitToggle } from "@/components/weather/unit-toggle";
import { ModelSelector } from "@/components/weather/model-selector";
import { CurrentWeatherCard } from "@/components/weather/current-weather-card";
import { ForecastStrip } from "@/components/weather/forecast-strip";
import { WeatherChatPanel } from "@/components/chat/weather-chat-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const POPULAR_LOCATIONS: readonly string[] = [
  "Tokyo",
  "London",
  "New York",
  "Paris",
  "Sydney",
  "Zurich",
];

export default function Home() {
  const [selectedLocation, setSelectedLocation] = React.useState<string>("Tokyo");
  const [units, setUnits] = React.useState<UnitSystem>("metric");
  const [customModel, setCustomModel] = React.useState<string | null>(null);
  const [isChatOpenOnMobile, setIsChatOpenOnMobile] = React.useState<boolean>(false);

  const { data: capabilities } = useCapabilitiesQuery();

  const selectedModel =
    customModel ||
    capabilities?.models[0]?.alias ||
    "default";

  const {
    data: weatherData,
    isLoading: isWeatherLoading,
    isError: isWeatherError,
    error: weatherError,
    refetch: refetchWeather,
  } = useWeatherQuery({
    location: selectedLocation,
    units,
    days: 7,
  });

  function handleLocationSelect(loc: LocationRef) {
    setSelectedLocation(loc.region ? `${loc.name}, ${loc.region}` : loc.name);
  }

  function handleQuickSelect(cityName: string) {
    setSelectedLocation(cityName);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-primary/10 p-2 text-primary ring-1 ring-primary/20">
              <CloudSun className="size-5" />
            </div>
            <div>
              <div className="font-bold text-base tracking-tight leading-none flex items-center gap-1.5">
                <span>WeatherAI</span>
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                Intelligent Grounded Weather Intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ModelSelector
              selectedAlias={selectedModel}
              onChange={setCustomModel}
            />

            <UnitToggle
              units={units}
              onChange={setUnits}
            />

            {/* Mobile Chat Toggle Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsChatOpenOnMobile(!isChatOpenOnMobile)}
              className="lg:hidden gap-1.5"
            >
              <MessageSquare className="size-4 text-primary" />
              <span className="text-xs">AI Chat</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="container mx-auto px-4 py-8 flex-1 flex flex-col gap-8 max-w-7xl">
        {/* Search & Quick Select Section */}
        <section className="flex flex-col items-center justify-center gap-4 text-center max-w-2xl mx-auto w-full">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Worldwide Weather Forecasts & AI
          </h1>
          <p className="text-sm text-muted-foreground">
            Search any city, coordinate or region for verified multi-provider forecasts and conversational analysis.
          </p>

          <LocationSearch
            onSelectLocation={handleLocationSelect}
            className="mt-2"
          />

          {/* Quick Select Cities */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            <span className="text-xs text-muted-foreground mr-1">Popular:</span>
            {POPULAR_LOCATIONS.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => handleQuickSelect(city)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  selectedLocation.toLowerCase().includes(city.toLowerCase())
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                }`}
              >
                {city}
              </button>
            ))}
          </div>
        </section>

        {/* Content Grid: Weather Details + AI Chat Assistant */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Weather Cards */}
          <div className="lg:col-span-7 xl:col-span-7 flex flex-col gap-6">
            {isWeatherLoading ? (
              <div className="space-y-6">
                <Skeleton className="h-64 w-full rounded-2xl" />
                <Skeleton className="h-80 w-full rounded-2xl" />
              </div>
            ) : isWeatherError ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center space-y-4">
                <AlertCircle className="size-8 text-destructive mx-auto" />
                <div>
                  <h3 className="font-semibold text-foreground">Failed to load weather data</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {weatherError?.message || "An unexpected error occurred while fetching forecast."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => refetchWeather()}
                  className="gap-2 mx-auto"
                >
                  <RefreshCw className="size-3.5" />
                  <span>Try Again</span>
                </Button>
              </div>
            ) : weatherData?.current ? (
              <>
                <CurrentWeatherCard
                  current={weatherData.current}
                  todayForecast={weatherData.forecast?.days?.[0]}
                />

                {weatherData.forecast?.days && (
                  <ForecastStrip
                    days={weatherData.forecast.days}
                    units={units}
                  />
                )}
              </>
            ) : null}
          </div>

          {/* Right Column: AI Chat Panel */}
          <div
            className={`lg:col-span-5 xl:col-span-5 sticky top-24 ${
              isChatOpenOnMobile ? "block" : "hidden lg:block"
            }`}
          >
            <WeatherChatPanel
              modelAlias={selectedModel}
              units={units}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 bg-muted/20 text-center text-xs text-muted-foreground mt-auto">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            <span>Weather AI Agent • Next.js 16 + Express + AI SDK 7</span>
          </div>
          <div>
            Powered by Open-Meteo, WeatherAPI & OpenAI/Anthropic Models
          </div>
        </div>
      </footer>
    </div>
  );
}
