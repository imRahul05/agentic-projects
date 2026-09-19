import { asJsonRecord, readNumber, readString, type JsonRecord } from "@/lib/api/http";

/**
 * Shape of `GET /api/capabilities`.
 *
 * Intentionally duplicated from the server (there is no shared package yet).
 * The parser below is tolerant: a field the server has not shipped yet becomes
 * `undefined`/empty rather than throwing, so the chat stays usable.
 */

export interface ModelOption {
  readonly alias: string;
  readonly label: string;
  readonly providerId: string;
  readonly description?: string;
}

export interface SearchCapability {
  readonly mode?: string;
  readonly maxSearches?: number;
}

export interface CapabilityLimits {
  readonly maxSteps?: number;
  readonly maxInputChars?: number;
}

export interface Capabilities {
  readonly models: readonly ModelOption[];
  readonly search: SearchCapability;
  readonly limits: CapabilityLimits;
  readonly suggestions: readonly string[];
  readonly defaultLocale?: string;
  readonly features: Readonly<Record<string, boolean>>;
}

function parseModel(value: unknown): ModelOption | undefined {
  const record = asJsonRecord(value);
  if (record === undefined) {
    return undefined;
  }
  const alias = readString(record, "alias");
  if (alias === undefined || alias.length === 0) {
    return undefined;
  }
  const description = readString(record, "description");
  return {
    alias,
    label: readString(record, "label") ?? alias,
    providerId: readString(record, "providerId") ?? "",
    ...(description === undefined ? {} : { description }),
  };
}

function parseStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim().length > 0) {
      items.push(entry);
    }
  }
  return items;
}

function parseFeatures(value: unknown): Readonly<Record<string, boolean>> {
  const record = asJsonRecord(value);
  if (record === undefined) {
    return {};
  }
  const features: Record<string, boolean> = {};
  for (const key of Object.keys(record)) {
    const flag = record[key];
    if (typeof flag === "boolean") {
      features[key] = flag;
    }
  }
  return features;
}

function parseSearch(record: JsonRecord | undefined): SearchCapability {
  if (record === undefined) {
    return {};
  }
  const mode = readString(record, "mode");
  const maxSearches = readNumber(record, "maxSearches");
  return {
    ...(mode === undefined ? {} : { mode }),
    ...(maxSearches === undefined ? {} : { maxSearches }),
  };
}

function parseLimits(record: JsonRecord | undefined): CapabilityLimits {
  if (record === undefined) {
    return {};
  }
  const maxSteps = readNumber(record, "maxSteps");
  const maxInputChars = readNumber(record, "maxInputChars");
  return {
    ...(maxSteps === undefined ? {} : { maxSteps }),
    ...(maxInputChars === undefined ? {} : { maxInputChars }),
  };
}

export function parseCapabilities(payload: unknown): Capabilities {
  const root = asJsonRecord(payload) ?? {};
  const rawModels = root["models"];
  const models: ModelOption[] = [];
  if (Array.isArray(rawModels)) {
    for (const entry of rawModels) {
      const model = parseModel(entry);
      if (model !== undefined) {
        models.push(model);
      }
    }
  }

  const defaultLocale = readString(root, "defaultLocale");

  return {
    models,
    search: parseSearch(asJsonRecord(root["search"])),
    limits: parseLimits(asJsonRecord(root["limits"])),
    suggestions: parseStringList(root["suggestions"]),
    ...(defaultLocale === undefined ? {} : { defaultLocale }),
    features: parseFeatures(root["features"]),
  };
}
