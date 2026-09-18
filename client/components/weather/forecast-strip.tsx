import * as React from "react";
import { DailyForecast, UnitSystem } from "@/lib/types/weather.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeatherIcon } from "./weather-icon";
import { CloudRain, Calendar } from "lucide-react";

export interface ForecastStripProps {
  readonly days: readonly DailyForecast[];
  readonly units: UnitSystem;
}

export function ForecastStrip({ days, units }: ForecastStripProps) {
  const tempUnit = units === "imperial" ? "°F" : "°C";

  if (!days || days.length === 0) {
    return null;
  }

  // Calculate min and max temperatures across all days for visual scaling
  const allMins = days.map((d) => d.minTemperature);
  const allMaxs = days.map((d) => d.maxTemperature);
  const lowest = Math.min(...allMins);
  const highest = Math.max(...allMaxs);
  const range = Math.max(highest - lowest, 1);

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-primary" />
          <CardTitle className="text-base font-semibold">
            {days.length}-Day Forecast
          </CardTitle>
        </div>
        <span className="text-xs text-muted-foreground">
          Temperatures in {tempUnit}
        </span>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-1 divide-y divide-border/40">
          {days.map((day) => {
            const leftPercent = Math.max(0, Math.min(100, ((day.minTemperature - lowest) / range) * 100));
            const widthPercent = Math.max(
              8,
              Math.min(100 - leftPercent, ((day.maxTemperature - day.minTemperature) / range) * 100)
            );

            return (
              <div
                key={day.date}
                className="flex items-center justify-between gap-3 py-3 hover:bg-muted/30 px-2 rounded-lg transition-colors"
              >
                {/* Day and date */}
                <div className="w-24 sm:w-28 shrink-0">
                  <div className="font-semibold text-sm text-foreground">{day.dayOfWeek}</div>
                  <div className="text-xs text-muted-foreground">{day.date}</div>
                </div>

                {/* Weather icon and condition */}
                <div className="flex items-center gap-2.5 w-36 sm:w-44 shrink-0">
                  <WeatherIcon
                    condition={day.standardCondition || day.condition}
                    className="size-5 text-primary shrink-0"
                  />
                  <span className="text-xs sm:text-sm text-foreground truncate capitalize">
                    {day.condition}
                  </span>
                </div>

                {/* Rain probability */}
                <div className="w-16 shrink-0 flex items-center gap-1 text-xs text-blue-500 font-medium">
                  {day.precipitationProbability > 0 ? (
                    <>
                      <CloudRain className="size-3.5 shrink-0" />
                      <span>{day.precipitationProbability}%</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </div>

                {/* Temp bar visualization */}
                <div className="flex items-center gap-2 flex-1 max-w-xs justify-end">
                  <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                    {Math.round(day.minTemperature)}°
                  </span>

                  <div className="relative h-2 w-24 sm:w-32 rounded-full bg-muted/60 overflow-hidden hidden sm:block">
                    <div
                      className="absolute top-0 h-full rounded-full bg-gradient-to-r from-blue-400 to-amber-500"
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                      }}
                    />
                  </div>

                  <span className="text-xs font-bold text-foreground w-8">
                    {Math.round(day.maxTemperature)}°
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
