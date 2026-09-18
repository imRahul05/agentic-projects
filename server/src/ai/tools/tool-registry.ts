import { searchLocationTool } from "./search-location.tool.js";
import { getCurrentWeatherTool } from "./get-current-weather.tool.js";
import { getForecastTool } from "./get-forecast.tool.js";
import { compareWeatherTool } from "./compare-weather.tool.js";

export function createWeatherTools() {
  return {
    search_location: searchLocationTool,
    get_current_weather: getCurrentWeatherTool,
    get_forecast: getForecastTool,
    compare_weather: compareWeatherTool,
  };
}

export type WeatherToolSet = ReturnType<typeof createWeatherTools>;
