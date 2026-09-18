import * as React from "react";
import { UnitSystem } from "@/lib/types/weather.types";
import { cn } from "@/lib/utils";

export interface UnitToggleProps {
  readonly units: UnitSystem;
  readonly onChange: (units: UnitSystem) => void;
}

export function UnitToggle({ units, onChange }: UnitToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Temperature unit selection"
      className="inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground shadow-inner"
    >
      <button
        type="button"
        role="radio"
        aria-checked={units === "metric"}
        onClick={() => onChange("metric")}
        className={cn(
          "inline-flex items-center justify-center rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
          units === "metric"
            ? "bg-background text-foreground shadow-sm"
            : "hover:text-foreground"
        )}
      >
        °C (Metric)
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={units === "imperial"}
        onClick={() => onChange("imperial")}
        className={cn(
          "inline-flex items-center justify-center rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
          units === "imperial"
            ? "bg-background text-foreground shadow-sm"
            : "hover:text-foreground"
        )}
      >
        °F (Imperial)
      </button>
    </div>
  );
}
