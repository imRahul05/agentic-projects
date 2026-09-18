import { Router, type RequestHandler } from "express";
import type { PublicModelInfo } from "../../ai/provider/model-resolver.js";
import type { Container } from "../../container.js";
import type { SearchMode } from "../../config/config.types.js";

export interface CapabilitiesRouteDeps {
  readonly container: Container;
  readonly rateLimiters: readonly RequestHandler[];
}

/**
 * Everything the client needs to render itself, and nothing else: no api keys,
 * no base URLs, no provider-native model ids beyond what `listSelectable`
 * deliberately publishes.
 */
export interface CapabilitiesResponse {
  readonly models: readonly PublicModelInfo[];
  readonly search: {
    readonly mode: SearchMode;
    readonly maxSearches: number;
  };
  readonly limits: {
    readonly maxSteps: number;
    readonly maxInputChars: number;
  };
  readonly suggestions: readonly string[];
  readonly defaultLocale: string;
  readonly features: Readonly<Record<string, boolean>>;
}

export function createCapabilitiesRouter(deps: CapabilitiesRouteDeps): Router {
  const router = Router();
  const { config, modelResolver } = deps.container;

  router.get("/capabilities", ...deps.rateLimiters, (_req, res): void => {
    const payload: CapabilitiesResponse = {
      models: modelResolver.listSelectable(),
      search: {
        mode: config.search.mode,
        maxSearches: config.ai.agent.maxSearches,
      },
      limits: {
        maxSteps: config.ai.agent.maxSteps,
        maxInputChars: config.ai.agent.maxInputChars,
      },
      suggestions: config.chat.suggestions,
      defaultLocale: config.chat.defaultLocale,
      features: config.features,
    };

    // Capabilities change only with a deployment, but a stale cached copy would
    // outlive one, so the client is told to revalidate.
    res.setHeader("cache-control", "no-cache");
    res.json(payload);
  });

  return router;
}
