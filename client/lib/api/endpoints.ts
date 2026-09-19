import { requireApiBaseUrl } from "@/lib/api/http";

/**
 * Every API path the client knows about. No URL or path string is written
 * inline anywhere else in the app.
 */
export const apiPaths = {
  chat: "/api/chat",
  capabilities: "/api/capabilities",
} as const;

export type ApiPath = (typeof apiPaths)[keyof typeof apiPaths];

/**
 * Absolute URL builders. These throw `ApiConfigurationError` when
 * `NEXT_PUBLIC_API_BASE_URL` is missing, so they are called at request time
 * (never during render) and the failure surfaces in a real error state.
 */
export const endpoints = {
  chat: (): string => `${requireApiBaseUrl()}${apiPaths.chat}`,
  capabilities: (): string => `${requireApiBaseUrl()}${apiPaths.capabilities}`,
} as const;
