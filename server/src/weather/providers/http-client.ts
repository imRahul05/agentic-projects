import { Logger } from "../../platform/logging/logger.port.js";
import { WeatherProviderError } from "../domain/weather.types.js";

export interface HttpRequestOptions {
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly signal?: AbortSignal;
}

export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const sensitiveKeys = ["key", "apikey", "api_key", "token", "secret", "auth"];
    for (const key of url.searchParams.keys()) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString();
  } catch {
    return rawUrl.replace(/(key|apiKey|api_key|token)=([^&]+)/gi, "$1=[REDACTED]");
  }
}

export class HttpClient {
  constructor(
    private readonly defaultTimeoutMs: number = 7000,
    private readonly defaultRetries: number = 2,
    private readonly logger?: Logger
  ) {}

  async get<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
    const targetUrl = new URL(url);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          targetUrl.searchParams.set(key, String(value));
        }
      }
    }

    const fullUrl = targetUrl.toString();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = options.retries ?? this.defaultRetries;
    const redacted = redactUrl(fullUrl);

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      const abortHandler = (): void => {
        controller.abort();
      };

      if (options.signal) {
        options.signal.addEventListener("abort", abortHandler, { once: true });
      }

      try {
        const response = await fetch(fullUrl, {
          headers: options.headers,
          signal: controller.signal,
        });

        clearTimeout(timer);
        if (options.signal) {
          options.signal.removeEventListener("abort", abortHandler);
        }

        if (response.ok) {
          const json = (await response.json()) as T;
          return json;
        }

        const status = response.status;
        if (status === 404) {
          throw new WeatherProviderError({
            code: "LOCATION_NOT_FOUND",
            message: `Resource not found: ${redacted}`,
          });
        }
        if (status === 401 || status === 403) {
          throw new WeatherProviderError({
            code: "INVALID_KEY",
            message: `Authentication failed for upstream request`,
          });
        }
        if (status === 429) {
          if (attempt < maxRetries) {
            const delay = (attempt + 1) * 300 + Math.random() * 200;
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          throw new WeatherProviderError({
            code: "RATE_LIMITED",
            message: "Upstream weather rate limit exceeded",
          });
        }

        if (status >= 500 && attempt < maxRetries) {
          const delay = (attempt + 1) * 200 + Math.random() * 150;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw new WeatherProviderError({
          code: "SERVICE_UNAVAILABLE",
          message: `Upstream service returned HTTP ${status}`,
        });
      } catch (err: Error | unknown) {
        clearTimeout(timer);
        if (options.signal) {
          options.signal.removeEventListener("abort", abortHandler);
        }

        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;

        if (error instanceof WeatherProviderError) {
          throw error;
        }

        if (timedOut) {
          if (attempt < maxRetries) {
            continue;
          }
          throw new WeatherProviderError({
            code: "NETWORK_ERROR",
            message: `Request timed out after ${timeoutMs}ms: ${redacted}`,
          });
        }

        if (options.signal?.aborted) {
          throw new WeatherProviderError({
            code: "NETWORK_ERROR",
            message: "Request was cancelled",
          });
        }

        if (attempt < maxRetries) {
          const delay = (attempt + 1) * 200 + Math.random() * 150;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    const safeMessage = lastError ? lastError.message : "Request failed";
    this.logger?.warn(`HTTP request failed after retries: ${redacted}`);
    throw new WeatherProviderError({
      code: "NETWORK_ERROR",
      message: `Failed request to ${redacted}: ${safeMessage}`,
    });
  }
}
