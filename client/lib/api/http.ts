/**
 * Typed fetch wrapper for the weather agent API.
 *
 * Two rules this module exists to enforce:
 *  1. The API origin always comes from `NEXT_PUBLIC_API_BASE_URL`. Nothing else
 *     in the app may name an origin.
 *  2. The server's `{ error: { code, message, retryable, requestId } }` envelope
 *     becomes a typed `ApiError`, never a bare string, so callers can branch on
 *     `status` / `retryable` instead of pattern-matching prose.
 */

export const API_BASE_URL_ENV_VAR = "NEXT_PUBLIC_API_BASE_URL";

/** A JSON object with values still unverified. */
export type JsonRecord = { readonly [key: string]: unknown };

/** Narrow an unknown payload to an index-readable object. */
export function asJsonRecord(value: unknown): JsonRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonRecord;
}

export function readString(source: JsonRecord, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

export function readNumber(source: JsonRecord, key: string): number | undefined {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readBoolean(source: JsonRecord, key: string): boolean | undefined {
  const value = source[key];
  return typeof value === "boolean" ? value : undefined;
}

/** The app is misconfigured — not a transport failure. Never retryable. */
export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigurationError";
  }
}

export interface ApiErrorInit {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly retryable?: boolean;
  readonly requestId?: string;
}

/** The server answered with an error envelope, or a non-JSON failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId: string | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.retryable = init.retryable ?? init.status >= 500;
    this.requestId = init.requestId;
  }
}

/**
 * The configured API origin, or `undefined` when the variable is absent.
 *
 * Kept separate from {@link requireApiBaseUrl} so the UI can render a loud
 * "you forgot to configure this" banner instead of throwing during render.
 */
export function getApiBaseUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

export function missingApiBaseUrlMessage(): string {
  return `${API_BASE_URL_ENV_VAR} is not set. Point it at the weather agent API origin (see client/.env.example) and restart the dev server.`;
}

/** The configured API origin, or a thrown `ApiConfigurationError`. */
export function requireApiBaseUrl(): string {
  const baseUrl = getApiBaseUrl();
  if (baseUrl === undefined) {
    throw new ApiConfigurationError(missingApiBaseUrlMessage());
  }
  return baseUrl;
}

function readErrorEnvelope(payload: unknown): ApiErrorInit | undefined {
  const root = asJsonRecord(payload);
  const error = root === undefined ? undefined : asJsonRecord(root["error"]);
  if (error === undefined) {
    return undefined;
  }
  const code = readString(error, "code");
  const message = readString(error, "message");
  if (code === undefined || message === undefined) {
    return undefined;
  }
  return {
    status: 0,
    code,
    message,
    retryable: readBoolean(error, "retryable"),
    requestId: readString(error, "requestId"),
  };
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  const envelope = readErrorEnvelope(payload);
  if (envelope !== undefined) {
    return new ApiError({ ...envelope, status: response.status });
  }

  return new ApiError({
    status: response.status,
    code: "HTTP_ERROR",
    message:
      response.statusText.length > 0
        ? `Request failed (${String(response.status)} ${response.statusText}).`
        : `Request failed (${String(response.status)}).`,
  });
}

export interface ApiRequestOptions<T> {
  /**
   * Validates the decoded JSON body. Required so responses are narrowed by a
   * real check rather than an unchecked cast at the call site.
   */
  readonly parse: (payload: unknown) => T;
  readonly signal?: AbortSignal;
}

/** `GET {base}{path}` decoded and validated, or a typed error. */
export async function apiGetJson<T>(path: string, options: ApiRequestOptions<T>): Promise<T> {
  const url = `${requireApiBaseUrl()}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch {
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "Could not reach the weather agent API.",
      retryable: true,
    });
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError({
      status: response.status,
      code: "INVALID_JSON",
      message: "The weather agent API returned a malformed response.",
      retryable: true,
    });
  }

  return options.parse(payload);
}
