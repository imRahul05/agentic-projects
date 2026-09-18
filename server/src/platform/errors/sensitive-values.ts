import type { AppConfig } from "../../config/config.types.js";

/**
 * Every configured value that must never appear in a client-visible message:
 * api keys, base URLs, provider ids and provider-native model ids. Model
 * *aliases* are deliberately absent — they are the client's own vocabulary.
 */
export function collectSensitiveValues(config: AppConfig): readonly string[] {
  const values: string[] = [];

  for (const [providerId, credentials] of Object.entries(config.ai.providers)) {
    values.push(providerId);
    if (credentials.apiKey !== undefined) values.push(credentials.apiKey);
    if (credentials.baseURL !== undefined) values.push(credentials.baseURL);
  }

  for (const spec of Object.values(config.ai.modelAliases)) {
    values.push(spec.provider, spec.model);
  }

  for (const toolId of Object.values(config.search.native.toolIdByProvider)) {
    values.push(toolId);
  }

  const external = config.search.external;
  if (external !== undefined) {
    values.push(external.clientId);
    if (external.apiKey.length > 0) values.push(external.apiKey);
    if (external.baseUrl !== undefined) values.push(external.baseUrl);
  }

  return values;
}
