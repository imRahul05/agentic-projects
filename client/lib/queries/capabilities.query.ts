"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiPaths } from "@/lib/api/endpoints";
import { apiGetJson } from "@/lib/api/http";
import { parseCapabilities, type Capabilities } from "@/lib/contracts/capabilities";
import { queryKeys } from "@/lib/queries/query-keys";

/**
 * Capabilities are the only genuinely cacheable server state in this app: a
 * static description of the deployment (models, search mode, budgets, suggested
 * prompts). It never changes inside a session, hence `staleTime: Infinity`.
 *
 * It drives the model picker, the suggestion chips and the composer's character
 * budget, so the UI hardcodes no model names, prompts or limits.
 */
export function useCapabilitiesQuery(): UseQueryResult<Capabilities, Error> {
  return useQuery<Capabilities, Error>({
    queryKey: queryKeys.capabilities,
    queryFn: ({ signal }) => apiGetJson(apiPaths.capabilities, { parse: parseCapabilities, signal }),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}
