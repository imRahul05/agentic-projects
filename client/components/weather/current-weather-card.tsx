import * as React from "react";
import { CurrentConditions, DailyForecast } from "@/lib/types/weather.types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WeatherIcon } from "./weather-icon";
import { Droplets, Wind, Sun, CloudRain, Clock, Database } from "lucide-react";

export interface CurrentWeatherCardProps {
  readonly current: CurrentConditions;
  readonly todayForecast?: DailyForecast;
}

export function CurrentWeatherCard({ current, todayForecast }: CurrentWeatherCardProps) {
  const tempUnit = current.units === "imperial" ? "°F" : "°C";
  const speedUnit = current.units === "imperial" ? "mph" : "km/h";
  const precipUnit = current.units === "imperial" ? "in" : "mm";

  return (
    <Card className="relative overflow-hidden border bg-gradient-to-br from-card via-card to-muted/30 shadow-md">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-0 pointer-events-none" />

      <CardContent className="p-6 md:p-8 relative z-10">
        {/* Top bar: location + provenance badges */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              {current.location.name}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {[current.location.region, current.location.country].filter(Boolean).join(", ")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px] gap-1 bg-background/50 backdrop-blur-sm">
              <Database className="size-3 text-primary" />
              <span>{current.meta.providerId}</span>
            </Badge>
            {current.meta.cacheHit && (
              <Badge variant="success" className="text-[11px]">
                Cached
              </Badge>
            )}
          </div>
        </div>

        {/* Hero temperature and condition */}
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/20 text-primary">
              <WeatherIcon
                condition={current.standardCondition || current.condition}
                isDay={current.isDay}
                className="size-12 md:size-16"
              />
            </div>
            <div>
              <div className="text-5xl md:text-6xl font-extrabold tracking-tighter text-foreground">
                {Math.round(current.temperature)}
                <span className="text-3xl font-medium text-muted-foreground">{tempUnit}</span>
              </div>
              <div className="text-base font-medium text-muted-foreground mt-1 capitalize">
                {current.condition}
              </div>
            </div>
          </div>

          {/* High / Low & Feels Like */}
          <div className="flex flex-col sm:items-end gap-1.5 text-sm">
            <div className="font-medium text-foreground">
              Feels like <span className="font-semibold">{Math.round(current.feelsLike)}{tempUnit}</span>
            </div>
            {todayForecast && (
              <div className="text-muted-foreground">
                High: <span className="font-medium text-foreground">{Math.round(todayForecast.maxTemperature)}{tempUnit}</span>{" "}
                • Low: <span className="font-medium text-foreground">{Math.round(todayForecast.minTemperature)}{tempUnit}</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Clock className="size-3" />
              <span>Local time: {current.localTime || "Current"}</span>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-border/40">
          <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
            <Droplets className="size-5 text-blue-500 shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">Humidity</div>
              <div className="text-sm font-semibold text-foreground">{current.humidity}%</div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
            <Wind className="size-5 text-teal-500 shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">Wind Speed</div>
              <div className="text-sm font-semibold text-foreground">
                {Math.round(current.windSpeed)} {speedUnit}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
            <CloudRain className="size-5 text-indigo-500 shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">Precipitation</div>
              <div className="text-sm font-semibold text-foreground">
                {current.precipitationProbability}%
                {current.rainMm !== undefined && current.rainMm > 0 ? ` (${current.rainMm} ${precipUnit})` : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
            <Sun className="size-5 text-amber-500 shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">UV Index</div>
              <div className="text-sm font-semibold text-foreground">{current.uvIndex}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
