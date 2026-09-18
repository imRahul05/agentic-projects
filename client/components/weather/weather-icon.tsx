import * as React from "react";
import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  LucideProps,
} from "lucide-react";

export interface WeatherIconProps extends LucideProps {
  readonly condition: string;
  readonly isDay?: boolean;
}

export function WeatherIcon({ condition, isDay = true, className, ...props }: WeatherIconProps) {
  const norm = condition.toLowerCase();

  if (norm.includes("thunder") || norm.includes("lightning")) {
    return <CloudLightning className={className} {...props} />;
  }
  if (norm.includes("snow") || norm.includes("sleet") || norm.includes("ice") || norm.includes("blizzard")) {
    return <CloudSnow className={className} {...props} />;
  }
  if (norm.includes("drizzle") || norm.includes("freezing")) {
    return <CloudDrizzle className={className} {...props} />;
  }
  if (norm.includes("rain") || norm.includes("shower")) {
    return <CloudRain className={className} {...props} />;
  }
  if (norm.includes("fog") || norm.includes("mist") || norm.includes("haze")) {
    return <CloudFog className={className} {...props} />;
  }
  if (norm.includes("overcast") || norm.includes("cloudy") && !norm.includes("partly")) {
    return <Cloud className={className} {...props} />;
  }
  if (norm.includes("partly") || norm.includes("scattered")) {
    return isDay ? (
      <CloudSun className={className} {...props} />
    ) : (
      <CloudMoon className={className} {...props} />
    );
  }

  return isDay ? (
    <Sun className={className} {...props} />
  ) : (
    <Moon className={className} {...props} />
  );
}
