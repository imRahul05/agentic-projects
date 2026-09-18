import { ApiErrorResponse } from "../types/weather.types";

export interface RequestOptions extends Omit<RequestInit, "body"> {
  readonly params?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly body?: object | string;
}

export class HttpClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly requestId?: string;

  constructor(
    status: number,
    message: string,
    code: string = "HTTP_ERROR",
    retryable: boolean = false,
    requestId?: string
  ) {
    super(message);
    this.name = "HttpClientError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
    Object.setPrototypeOf(this, HttpClientError.prototype);
  }
}

function buildUrl(
  endpoint: string,
  params?: Readonly<Record<string, string | number | boolean | undefined>>
): string {
  if (!params) {
    return endpoint;
  }
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  const queryStr = searchParams.toString();
  if (!queryStr) {
    return endpoint;
  }
  return endpoint.includes("?") ? `${endpoint}&${queryStr}` : `${endpoint}?${queryStr}`;
}

export async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = buildUrl(endpoint, options.params);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (options.headers) {
    const customHeaders = options.headers as Record<string, string>;
    for (const [key, value] of Object.entries(customHeaders)) {
      headers[key] = value;
    }
  }

  let bodyContent: BodyInit | undefined = undefined;
  if (options.body !== undefined) {
    if (typeof options.body === "string") {
      bodyContent = options.body;
      headers["Content-Type"] = "application/json";
    } else {
      bodyContent = JSON.stringify(options.body);
      headers["Content-Type"] = "application/json";
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body: bodyContent,
  });

  if (!response.ok) {
    let errorDetail: ApiErrorResponse | null = null;
    try {
      errorDetail = (await response.json()) as ApiErrorResponse;
    } catch {
      // response body was not JSON
    }

    if (errorDetail?.error) {
      throw new HttpClientError(
        response.status,
        errorDetail.error.message,
        errorDetail.error.code,
        errorDetail.error.retryable,
        errorDetail.error.requestId
      );
    }

    throw new HttpClientError(
      response.status,
      `HTTP Error ${response.status}: ${response.statusText}`,
      "HTTP_ERROR",
      response.status >= 500
    );
  }

  return (await response.json()) as T;
}

export const httpClient = {
  get: <T>(endpoint: string, options?: RequestOptions): Promise<T> => {
    return request<T>(endpoint, { ...options, method: "GET" });
  },
  post: <T>(endpoint: string, body?: object | string, options?: RequestOptions): Promise<T> => {
    return request<T>(endpoint, { ...options, method: "POST", body });
  },
  put: <T>(endpoint: string, body?: object | string, options?: RequestOptions): Promise<T> => {
    return request<T>(endpoint, { ...options, method: "PUT", body });
  },
  delete: <T>(endpoint: string, options?: RequestOptions): Promise<T> => {
    return request<T>(endpoint, { ...options, method: "DELETE" });
  },
};
