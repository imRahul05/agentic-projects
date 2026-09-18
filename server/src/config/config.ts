import dotenv from "dotenv";
import { AppConfig } from "./config.types.js";
import { mapRawEnvToAppConfig, rawEnvSchema } from "./config.schema.js";

dotenv.config();

export class ConfigError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`Configuration validation failed:\n  - ${issues.join("\n  - ")}`);
    this.name = "ConfigError";
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    );
    throw new ConfigError(issues);
  }
  return mapRawEnvToAppConfig(parsed.data);
}
