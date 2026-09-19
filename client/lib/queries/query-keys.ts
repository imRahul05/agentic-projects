/**
 * Every TanStack Query key in the app. Centralised so invalidation never has to
 * guess at a key's shape.
 *
 * The chat stream is *not* here: `useChat` owns all streaming state.
 */
export const queryKeys = {
  capabilities: ["capabilities"] as const,
} as const;

export type QueryKeys = typeof queryKeys;
