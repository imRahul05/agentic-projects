import type { SearchConfig } from "../../config/config.types.js";
import { AppError } from "../../platform/errors/app-error.js";
import type { CachePort } from "../../platform/cache/cache.port.js";
import type { Logger } from "../../platform/logging/logger.port.js";
import type { LlmProvider } from "../provider/provider-registry.js";
import { createExternalSearchTool, type ExternalSearchTool } from "./external-search.tool.js";
import {
  createNativeSearchTools,
  WEB_SEARCH_TOOL_NAME,
  type NativeWebSearchTool,
} from "./native-search.tool.js";
import type { SearchClient } from "./search-client.port.js";

export type WebSearchTool = NativeWebSearchTool | ExternalSearchTool;

/** Always exactly one entry, under {@link WEB_SEARCH_TOOL_NAME}. */
export type SearchToolSet = Readonly<Record<typeof WEB_SEARCH_TOOL_NAME, WebSearchTool>>;

export interface SearchToolFactory {
  create(ctx: { readonly providerId: string }): SearchToolSet;
}

export interface SearchToolFactoryDeps {
  readonly search: SearchConfig;
  readonly providers: Readonly<Record<string, LlmProvider>>;
  /** Required in `external` mode, unused in `native` mode. */
  readonly searchClient?: SearchClient;
  readonly cache: CachePort;
  readonly logger: Logger;
}

function unavailable(reason: string, providerId: string): AppError {
  return new AppError("SEARCH_UNAVAILABLE", {
    publicMessage: "Web search is not available right now.",
    meta: { providerId, reason },
  });
}

/**
 * Picks the native or the external web-search implementation. This is the only
 * place downstream of the registry that is allowed to know a provider id, and
 * it uses it for a single lookup.
 */
export function createSearchToolFactory(deps: SearchToolFactoryDeps): SearchToolFactory {
  function create(ctx: { readonly providerId: string }): SearchToolSet {
    if (deps.search.mode === "native") {
      const provider = deps.providers[ctx.providerId];
      if (provider === undefined) throw unavailable("provider_not_registered", ctx.providerId);
      return createNativeSearchTools(provider, ctx.providerId, deps.search.native);
    }

    const external = deps.search.external;
    if (external === undefined) throw unavailable("external_search_not_configured", ctx.providerId);
    if (deps.searchClient === undefined) throw unavailable("search_client_missing", ctx.providerId);

    return {
      [WEB_SEARCH_TOOL_NAME]: createExternalSearchTool({
        config: external,
        context: {
          client: deps.searchClient,
          cache: deps.cache,
          logger: deps.logger,
        },
      }),
    };
  }

  return { create };
}
