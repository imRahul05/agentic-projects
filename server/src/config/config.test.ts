import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("loads valid default configuration", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      PORT: "4000",
    });

    expect(config.env).toBe("test");
    expect(config.http.port).toBe(4000);
    expect(config.weather.defaultProviderId).toBe("open-meteo");
    expect(config.ai.defaultAlias).toBe("default");
  });

  it("fails fast on invalid port", () => {
    expect(() =>
      loadConfig({
        PORT: "-10",
      })
    ).toThrow(ConfigError);
  });

  it("fails fast on invalid JSON for AI_MODEL_ALIASES", () => {
    expect(() =>
      loadConfig({
        AI_MODEL_ALIASES: "not-json",
      })
    ).toThrow(ConfigError);
  });
});
