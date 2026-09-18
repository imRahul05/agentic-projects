export type StandardCondition =
  | "clear"
  | "partly_cloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "freezing_rain"
  | "snow"
  | "thunderstorm";

export function normalizeConditionText(text: string): StandardCondition {
  const lower = text.toLowerCase();
  if (lower.includes("thunder") || lower.includes("storm")) return "thunderstorm";
  if (lower.includes("snow") || lower.includes("blizzard") || lower.includes("ice") || lower.includes("sleet")) return "snow";
  if (lower.includes("freezing")) return "freezing_rain";
  if (lower.includes("drizzle")) return "drizzle";
  if (lower.includes("rain") || lower.includes("shower")) return "rain";
  if (lower.includes("fog") || lower.includes("mist") || lower.includes("haze")) return "fog";
  if (lower.includes("overcast") || lower.includes("cloudy") && !lower.includes("partly")) return "overcast";
  if (lower.includes("partly") || lower.includes("scattered")) return "partly_cloudy";
  return "clear";
}
