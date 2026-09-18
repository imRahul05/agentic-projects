# Weather AI Agent — Architecture & Implementation Plan

> **SUPERSEDED (2026-09-18)** by [`weather-agent-websearch-architecture.md`](./weather-agent-websearch-architecture.md).
> Scope was cut to **one agent + one `web_search` tool, weather answers only**. The weather-API provider layer,
> capability ports, geocoding, units domain and the `/api/weather` + `/api/geocode` endpoints designed here are
> **not being built**. Kept for the repository audit (§0) and as the record of the rejected alternative.

**Status:** Design only. No code written, no packages installed.
**Date:** 2026-09-18
**Repo:** `agent-weather` (`client/` Next.js 16 + `server/` Express 4 + TypeScript)

---

## 0. Repository Audit (what actually exists today)

Verified by reading the tree, both `package.json` files, tsconfigs, and installed typedefs in `node_modules`.

### Server (`server/`)

| Fact | Value |
|---|---|
| Module system | ESM — `"type": "module"`, `module/moduleResolution: NodeNext`, `.js` import specifiers already used |
| Entry | `tsx watch src/server.ts` — **`src/server.ts` does not exist yet** |
| Express | `4.22.3` (Express 4, not 5) |
| AI SDK | `ai@7.0.105`, `@ai-sdk/openai@4`, `@ai-sdk/anthropic@4` |
| Validation | `zod@3.25.76` |
| Already installed | `helmet`, `cors`, `express-rate-limit@7`, `dotenv`, `vitest@3`, `tsx` |
| Existing code | `src/config/env.ts`, `src/weather/{weather.types,weather.interface,weather.factory}.ts`, `src/weather/providers/{open-meteo,weather-api,mock}.provider.ts` |

Existing weather layer is a useful starting point but has concrete issues the design must fix:

1. **`src/server.ts` missing** — no HTTP app, no routes, no bootstrap. Nothing runs.
2. **`env.ts` fails silently.** On a zod parse failure it logs and returns hardcoded defaults (`8080`, `"openai"`, `"open-meteo"`). Misconfiguration in production boots a subtly wrong server instead of refusing to start.
3. **Import-time singleton.** `export const defaultWeatherProvider = createWeatherProvider()` runs on module import, reads env at import, and cannot be substituted in tests without module mocking.
4. **Hardcoded values inside providers:** `7000` ms timeouts (twice), `https://api.open-meteo.com/...`, `https://geocoding-api.open-meteo.com/...`, `https://api.weatherapi.com/...`, `Math.min(days, 7)`, `count=1` geocode limit, `"en-US"` in `formatDayOfWeek`, provider display names.
5. **Interface too coarse.** `IWeatherProvider.getWeatherReport(location, days)` forces every provider to do geocode + current + forecast in one call. It cannot express "this provider has alerts but no history", and it makes the *forecast* request mandatory even when the user only asked "is it raining right now?".
6. **Lossy normalization.** `uvIndex: 0` hardcoded in the Open-Meteo path (the field simply isn't requested); units are implicitly Celsius/kph with no way to ask for imperial; `precipitationProbability` for *current* is borrowed from day[0] max.
7. **API key concatenated into URL** in `weather-api.provider.ts` — leaks into any log line that logs the request URL.

### Client (`client/`)

| Fact | Value |
|---|---|
| Next.js | `16.3.5`, App Router, RSC enabled (`components.json` → `"rsc": true`) |
| React | `19.2.8` |
| Styling | Tailwind **v4** CSS-first: `app/globals.css` has `@import "tailwindcss"` + `@import "shadcn/tailwind.css"`, `@theme inline`, oklch tokens, `@custom-variant dark` |
| shadcn | style `base-nova`, baseColor `neutral`, icons `lucide`, aliases `@/components`, `@/lib`, `@/components/ui`, `@/hooks` |
| Base UI | `@base-ui/react@1.8.0` — existing `components/ui/button.tsx` wraps `ButtonPrimitive` from `@base-ui/react/button` with `cva` |
| `cn` | re-exported from the **`cn` package** (`lib/utils.ts` → `export { cn } from "cn"`), not `clsx`+`tailwind-merge` |
| Installed, unused | `@ai-sdk/react@4`, `@tanstack/react-query@5.103`, `ai@7` |
| Existing components | only `components/ui/button.tsx` |
| Pages | `app/page.tsx` is still the create-next-app placeholder |
| Note | `client/AGENTS.md` warns this Next version differs from training data — read `node_modules/next/dist/docs/` during implementation |

Also: `pnpm-workspace.yaml` sits **inside `client/`**, and there is no root workspace. `client/` and `server/` are two independent pnpm projects. There are **no commits yet** on `main`.

### AI SDK v7 API surface (confirmed from `server/node_modules/ai/dist/index.d.ts`)

These are the primitives the design leans on — all verified present in the installed version, not assumed:

- `ToolLoopAgent` (class) + `ToolLoopAgentSettings` — `{ model, instructions, tools, toolsContext, toolChoice, stopWhen, telemetry, prepareStep, activeTools, ... }`. Note v7 uses **`instructions`**, not `system`.
- `pipeAgentUIStreamToResponse({ response: ServerResponse, agent, uiMessages, abortSignal, timeout, ... })` — **streams an agent straight into a Node `res`**. This is the correct Express integration; no Web-`Response` adapter needed.
- `createAgentUIStreamResponse` (Web `Response` variant — not needed here, but the escape hatch if the API ever moves to a Next route handler).
- `tool({ description, inputSchema, execute(input, options) })` where `execute: (input, options: ToolExecutionOptions<CONTEXT>) => ...`, and `toolsContext` on the agent/`streamText` call provides **typed dependency injection into tools** (`ToolsContextParameter`, `InferToolSetContext`). This removes the need for module singletons in the tool layer.
- `createProviderRegistry(providers, { separator, languageModelMiddleware })`, `customProvider`, `wrapLanguageModel`, `defaultSettingsMiddleware`, `defaultInstructionsMiddleware`.
- `createOpenAI(...)` / `createAnthropic(...)` factories (both take `apiKey`, `baseURL`, custom `fetch`).
- `stopWhen` conditions: `stepCountIs` / `isStepCount`, `hasToolCall`, `isLoopFinished`.
- `validateUIMessages` / `safeValidateUIMessages`, `convertToModelMessages`, `pruneMessages`, `smoothStream`.
- `InferAgentUIMessage<typeof agent>` — derives the exact client-side `UIMessage` type (including typed tool parts) from the agent definition.
- Telemetry: `telemetry` option + `registerTelemetry`, `AI_SDK_TELEMETRY_TRACING_CHANNEL`.
- `ai/test` exports `MockLanguageModelV4`, `MockProviderV4`, `convertArrayToReadableStream`, `simulateReadableStream`, `mockId` — the agent layer is testable with zero network.
- Client: `useChat` from `@ai-sdk/react` with `transport: new DefaultChatTransport({ api, prepareSendMessagesRequest })`; also `Chat`, `useObject`.

### AI SDK Tools Registry review

Fetched <https://ai-sdk.dev/resources/tools>. Current entries: Code Execution (Vercel Sandbox), Exa, Parallel, ctx-zip, Perplexity Search, Tavily, Firecrawl, Amazon Bedrock AgentCore, Superagent, Tako Search, Valyu, Airweave, bash-tool, Browserbase.

**Conclusion: nothing in the registry covers weather, geocoding, HTTP fetching, caching, or observability.** The registry is web-search / scraping / sandbox / browser-automation / guardrails. So:

- **Weather + geocoding tools must be first-party.** No registry package to adopt.
- Registry packages worth keeping as *future* plug-ins, not v1 dependencies:
  - **Exa / Tavily / Perplexity** — if "weather news", "storm coverage", or "is the airport closed" is ever in scope, drop one in as an extra tool. The tool registry design below makes this a config flag + one file.
  - **Superagent** — prompt-injection / PII guard if the agent later ingests untrusted third-party text.
- The design therefore invests in a clean *tool registry boundary* so registry tools can be added later, rather than in bespoke infrastructure.

---

## 1. High-Level Architecture

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ BROWSER — Next.js 16 App Router (client/)                                     │
│                                                                               │
│  ┌──────────────────────────┐        ┌────────────────────────────────────┐   │
│  │ Chat surface             │        │ Weather surface                    │   │
│  │ components/chat/*        │        │ components/weather/*               │   │
│  └───────────┬──────────────┘        └──────────────────┬─────────────────┘   │
│              │                                          │                     │
│  ┌───────────▼──────────────┐        ┌──────────────────▼─────────────────┐   │
│  │ useChat (@ai-sdk/react)  │        │ TanStack Query                     │   │
│  │ + DefaultChatTransport   │        │ (capabilities, geocode typeahead,  │   │
│  │ streaming token/tool     │        │  direct weather reads, units)      │   │
│  │ state — NOT in Query     │        │ staleTime mirrors server TTL       │   │
│  └───────────┬──────────────┘        └──────────────────┬─────────────────┘   │
│              │  POST /api/chat (SSE, UI message stream) │  GET (JSON)         │
└──────────────┼──────────────────────────────────────────┼─────────────────────┘
               │                                          │
               ▼                                          ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ EXPRESS API (server/) — the only holder of provider secrets                    │
│                                                                               │
│  HTTP EDGE:  helmet · cors · request-id · body limit · rate-limit ·           │
│              zod request validation · error handler · access log              │
│  ROUTES:     POST /api/chat        (stream)                                   │
│              GET  /api/weather     GET /api/geocode   (typed JSON, cacheable) │
│              GET  /api/capabilities (models/providers/units the UI may offer) │
│              GET  /healthz  /readyz                                           │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                │  (container: config + ports, no singletons)
                ┌───────────────┴────────────────┐
                ▼                                ▼
┌──────────────────────────────┐   ┌──────────────────────────────────────────┐
│ AGENT LAYER                  │   │ DIRECT READ PATH                         │
│ ToolLoopAgent                │   │ WeatherService used without the LLM      │
│  · instructions (templated)  │   │ (dashboard, deep links, typeahead)       │
│  · model ← ModelResolver     │   └────────────────┬─────────────────────────┘
│  · tools  ← ToolRegistry     │                    │
│  · toolsContext ← per request│                    │
│  · stopWhen / timeout / caps │                    │
└──────────────┬───────────────┘                    │
               ▼                                    │
┌──────────────────────────────┐                    │
│ MODEL PROVIDER ABSTRACTION   │                    │
│ createProviderRegistry       │                    │
│  openai: createOpenAI(...)   │                    │
│  anthropic: createAnthropic()│                    │
│ + wrapLanguageModel /        │                    │
│   defaultSettingsMiddleware  │                    │
│ Alias map: "default"|"fast"| │                    │
│  "reasoning" → provider:model│                    │
└──────────────────────────────┘                    │
               ▼                                    │
┌───────────────────────────────────────────────────▼───────────────────────────┐
│ TOOL LAYER  (thin, declarative; zod in → normalized domain out)               │
│  search_location · get_current_weather · get_forecast · compare_weather       │
│  (later: get_alerts · get_historical_weather · web_search from registry)      │
│  Each tool: inputSchema, execute(input, {context, abortSignal}) → DTO         │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ WEATHER DOMAIN — WeatherService (orchestration, caching, units, fallback)     │
│   Ports:  GeocodingPort · ConditionsPort · ForecastPort                       │
│           (later: AlertsPort · HistoryPort)                                   │
│   Capability-based provider selection + optional fallback chain               │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ WEATHER PROVIDER ADAPTERS — open-meteo · weatherapi · mock                    │
│ each: raw response schema → domain mapper; all URLs/keys/timeouts from config │
│ shared HttpClient: timeout, bounded retry+jitter, redacted logging            │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ PLATFORM PORTS (cross-cutting, injected)                                      │
│  CachePort (memory TTL + single-flight) · LoggerPort · MetricsPort · Clock    │
└───────────────────────────────────────────────────────────────────────────────┘
```

**One rule governs every arrow:** a layer depends only on the *interface* of the layer below, obtained by injection. Nothing imports a configured singleton.

---

## 2. Client / Server Responsibility Split

### Client owns

- Rendering and interaction: chat transcript, weather cards, forecast strip, location typeahead, unit toggle, model picker.
- **Conversation state** — `useChat` holds messages; the *client* is the source of truth for history. Sent with each request.
- Ephemeral UI prefs (units, selected model alias, theme) in `localStorage`, hydrated safely.
- Non-chat server state via TanStack Query: capabilities, geocode search, direct weather reads.
- Optimistic/abort UX: stop button → `useChat().stop()`, retry → `regenerate()`.

### Server owns

- **All secrets.** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `WEATHER_API_KEY` never reach the browser, never appear in a response body, never in a URL that gets logged.
- Model/provider selection and enforcement: client may *request* a model **alias**; server maps alias → concrete model and rejects anything not in the configured allowlist.
- Agent orchestration, tool execution, step/token/time budgets.
- Weather fetching, normalization, unit conversion, caching, provider fallback.
- Validation of every inbound payload (including the UI message array), rate limiting, error shaping, observability.

### Explicit non-responsibilities (v1)

- No database, no session store, no server-side chat persistence.
- No auth — so **rate limiting and payload caps are the only abuse controls**, and they must be real.
- No server-rendered chat (the chat page is a client component; the weather dashboard may be RSC-prefetched via Query hydration).

---

## 3. Agent & Tool Flow

### Decision: a single `ToolLoopAgent`, not a workflow graph

Weather answering is **retrieve → synthesize**, with a small, bounded fan-out (resolve location, then 1–3 data reads, then compose). It has no long-running human-in-the-loop steps, no branching approval, no durable state. A hand-rolled graph or workflow engine would be infrastructure with no question to answer.

`ToolLoopAgent` already gives us everything the "structured agent" argument usually wants:

| Requirement | v7 mechanism |
|---|---|
| Bounded loop | `stopWhen: [stepCountIs(config.agent.maxSteps)]` |
| Deadline | `timeout` on the stream call |
| Phase restriction | `prepareStep` + `activeTools` (e.g. force `search_location` first when the location is ambiguous) |
| Forced first tool | `toolChoice: { type: 'tool', toolName: ... }` for narrow endpoints |
| Structured output | `Output` (`output_object`) when we want a typed card payload instead of prose |
| Dependency injection | `toolsContext` |
| Per-request model swap | resolver called per request, not at module load |

So: **simple tool-calling agent now, with the documented escalation path** (see §14, phase 5) of composing multiple `ToolLoopAgent` instances behind an `AgentRegistry` if a genuinely multi-stage use case appears (e.g. "plan a 3-city trip around the weather").

### Request flow (`POST /api/chat`)

```text
1. edge        rate-limit → body size cap → zod parse { messages, modelAlias?, units?, locale?, timezone? }
2. validate    safeValidateUIMessages(messages, {tools})  → reject malformed/oversized histories
3. prune       pruneMessages(...) to config.agent.historyWindow  (token + payload control)
4. resolve     ModelResolver.resolve(modelAlias) → LanguageModel   (allowlist enforced)
5. context     build ToolContext { weather, cache, logger, metrics, clock, requestId, units, locale, timezone, signal }
6. agent       AgentFactory.create({ model, tools, instructions: render(template, {units, locale, now}) })
7. stream      pipeAgentUIStreamToResponse({ response: res, agent, uiMessages, abortSignal, timeout,
                 messageMetadata, onError: maskError, onFinish: logUsage })
8. client      useChat renders text deltas + typed tool parts (cards render from tool output, not from prose)
```

Abort: `req.on('close')` → `AbortController.abort()` → propagates into tool `execute` → into `HttpClient` fetch → upstream request cancelled. No orphaned provider spend.

### Agent loop, concretely

```text
User: "Should I take a jacket to Lisbon tomorrow, and how does it compare to Madrid?"

step 1  model → search_location({ query: "Lisbon" })      → { id, name, country, lat, lon, tz }
        model → search_location({ query: "Madrid" })       → { ... }              (parallel)
step 2  model → get_forecast({ location: <lisbon ref>, days: 2, units: "metric" })
        model → get_forecast({ location: <madrid ref>, days: 2, units: "metric" }) (parallel)
              ↳ both served from one WeatherService, second Madrid call shares cache/single-flight
step 3  model → text: recommendation, streamed token-by-token
stop    stepCountIs(maxSteps) never reached; loop ends naturally on a text-only step
```

Key design points in the tool layer:

- **Location is a typed reference, not a string.** `search_location` returns a `LocationRef` (with lat/lon/timezone) that data tools accept. This stops the model from re-geocoding, removes ambiguity ("Springfield"), and makes cache keys stable. Data tools *also* accept a raw query for one-shot convenience, resolving internally.
- **Tool output is split.** Each tool returns a compact, model-facing object (rounded numbers, no nesting soup) — token efficiency matters when the loop has 3–4 steps. Rich display data travels in the same typed payload and is rendered by the client from the **tool UI part**, so the UI never parses prose.
- **Tool failures are values, not exceptions.** A `LOCATION_NOT_FOUND` returns `{ ok: false, code, message, suggestions? }` so the model can ask a clarifying question. Only genuinely unrecoverable faults throw and surface as a stream error.
- `compare_weather` is deliberately a *thin* tool over `get_forecast` (N locations) rather than a new provider call path — it exists to give the model an efficient single call and to give the UI a comparison payload.

---

## 4. Proposed Folder / Module Structure

Built on what exists; existing files move or are refactored rather than duplicated.

### Server

```text
server/src/
  server.ts                        # NEW. bootstrap only: config → container → app → listen, graceful shutdown
  app.ts                           # createApp(container): Express instance, no listen (supertest-friendly)
  container.ts                     # buildContainer(config): wires every port; the only wiring site

  config/
    config.schema.ts               # zod schema for process.env (single source of truth)
    config.ts                      # loadConfig(env): AppConfig — FAIL FAST on invalid
    config.types.ts                # AppConfig + section types
    # (replaces src/config/env.ts)

  http/
    middleware/
      request-id.ts
      security.ts                  # helmet + cors from config
      rate-limit.ts                # express-rate-limit factory, buckets from config
      validate.ts                  # zod body/query validator → 422 with field errors
      error-handler.ts             # AppError → status + client-safe JSON
      access-log.ts
    routes/
      index.ts                     # mounts the router tree at config.http.basePath
      chat.route.ts
      weather.route.ts
      geocode.route.ts
      capabilities.route.ts
      health.route.ts              # /healthz liveness, /readyz provider reachability
    contracts/
      chat.contract.ts             # zod: ChatRequest / metadata
      weather.contract.ts          # zod: query params + response DTOs
    stream/
      chat-stream.ts               # pipeAgentUIStreamToResponse wiring, abort, header hygiene

  ai/
    provider/
      provider-registry.ts         # createProviderRegistry from configured providers only
      model-resolver.ts            # alias → "provider:model" → LanguageModel (+ allowlist)
      model-middleware.ts          # wrapLanguageModel / defaultSettingsMiddleware per alias
    agent/
      agent.factory.ts             # createWeatherAgent(deps): ToolLoopAgent
      instructions.ts              # template + render({units, locale, now, capabilities})
      policies.ts                  # stopWhen, prepareStep, activeTools, budgets from config
      agent.types.ts               # WeatherAgent, WeatherUIMessage = InferAgentUIMessage<...>
    tools/
      tool-context.ts              # ToolContext type (the toolsContext payload)
      tool-registry.ts             # buildTools(ctxType, config): ToolSet, feature-flagged
      search-location.tool.ts
      get-current-weather.tool.ts
      get-forecast.tool.ts
      compare-weather.tool.ts
      # later: get-alerts.tool.ts, get-historical-weather.tool.ts, web-search.tool.ts

  weather/
    weather.service.ts             # facade: capability routing, cache, units, fallback
    weather.service.types.ts
    ports/
      geocoding.port.ts
      conditions.port.ts
      forecast.port.ts
      # later: alerts.port.ts, history.port.ts
    domain/
      weather.types.ts             # MOVED from src/weather/weather.types.ts (extended)
      location.types.ts            # LocationRef
      units.ts                     # UnitSystem + pure conversions
      wmo-codes.ts                 # MOVED out of open-meteo provider
      condition.ts                 # normalized condition enum + provider code mapping
    providers/
      provider-catalog.ts          # id → factory + declared capabilities (replaces weather.factory.ts)
      http-client.ts               # fetch wrapper: timeout, retries+jitter, redaction, abort
      open-meteo/
        open-meteo.provider.ts     # REFACTORED from existing
        open-meteo.schema.ts       # zod parse of upstream payloads
        open-meteo.mapper.ts
      weatherapi/
        weatherapi.provider.ts     # REFACTORED (key moves to header/params via HttpClient, never logged)
        weatherapi.schema.ts
        weatherapi.mapper.ts
      mock/
        mock.provider.ts           # REFACTORED, deterministic fixtures for tests

  platform/
    cache/
      cache.port.ts
      memory-cache.ts              # TTL + max entries + single-flight
    logging/
      logger.port.ts
      console-logger.ts            # swap for pino later without touching callers
    metrics/
      metrics.port.ts
      noop-metrics.ts
    errors/
      app-error.ts                 # AppError + codes
      to-http.ts                   # code → status + safe message
    telemetry/
      telemetry.ts                 # AI SDK telemetry config (off unless configured)
    clock.ts

  __tests__/                       # or colocated *.test.ts — vitest already installed
```

### Client

```text
client/
  app/
    layout.tsx                     # + <Providers> (Query + theme), real metadata
    page.tsx                       # REPLACE placeholder → weather agent experience
    providers.tsx                  # QueryClientProvider (client component)
  components/
    chat/
      chat-panel.tsx               # owns useChat
      message-list.tsx
      message-item.tsx             # text parts + reasoning parts
      tool-part.tsx                # switch on typed tool part → weather component
      prompt-input.tsx
      suggestions.tsx              # empty-state prompts (from capabilities, not hardcoded)
      model-picker.tsx             # options from /api/capabilities
      chat-status.tsx              # streaming / stop / retry / error surface
    weather/
      current-conditions-card.tsx
      forecast-strip.tsx
      forecast-day.tsx
      comparison-table.tsx
      location-search.tsx          # Query-backed typeahead
      units-toggle.tsx
      weather-icon.tsx             # normalized condition → lucide icon
      weather-skeleton.tsx
    ui/                            # shadcn additions (see §12)
  lib/
    api/
      http.ts                      # fetch wrapper, base URL from NEXT_PUBLIC_API_BASE_URL
      endpoints.ts                 # path builders — no inline URL strings anywhere else
    chat/
      transport.ts                 # DefaultChatTransport + prepareSendMessagesRequest
      use-weather-chat.ts          # thin wrapper over useChat: units, modelAlias, abort
    queries/
      query-keys.ts
      capabilities.query.ts
      geocode.query.ts
      weather.query.ts
    contracts/
      weather.ts                   # mirrored response types (see §13 trade-off)
      chat.ts                      # WeatherUIMessage type
    format/
      temperature.ts  date.ts      # locale/units-aware, no hardcoded "en-US"
  hooks/
    use-units.ts
    use-debounced-value.ts
```

---

## 5. Configuration Strategy

**One schema, one load, fail fast, inject everywhere.**

```ts
// config/config.ts
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(formatIssues(parsed.error));   // refuse to boot — never silent defaults
  }
  return toAppConfig(parsed.data);
}
```

Shape (abridged):

```ts
interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly http: {
    port: number; basePath: string; trustProxy: boolean | number;
    corsOrigins: readonly string[]; bodyLimitBytes: number; requestTimeoutMs: number;
  };
  readonly ai: {
    providers: Readonly<Record<string, ProviderConfig>>;   // only ones with credentials
    modelAliases: Readonly<Record<string, ModelSpec>>;     // "default" | "fast" | ... → {provider, model, settings}
    defaultAlias: string;
    clientSelectableAliases: readonly string[];            // allowlist exposed to the browser
    agent: {
      maxSteps: number; totalTimeoutMs: number; stepTimeoutMs: number;
      maxOutputTokens: number; historyWindowMessages: number; maxInputChars: number;
    };
  };
  readonly weather: {
    defaultProviderId: string;
    fallbackProviderIds: readonly string[];
    providers: Readonly<Record<string, WeatherProviderConfig>>; // baseUrl, apiKey, timeoutMs, retries
    defaults: { units: UnitSystem; forecastDays: number; maxForecastDays: number; geocodeLimit: number; locale: string };
  };
  readonly cache: { enabled: boolean; maxEntries: number; ttlMs: Readonly<Record<WeatherCapability, number>> };
  readonly rateLimit: Readonly<Record<'chat' | 'read', { windowMs: number; max: number }>>;
  readonly observability: { logLevel: LogLevel; telemetryEnabled: boolean; serviceName: string };
  readonly features: Readonly<Record<string, boolean>>;    // tool + capability flags
}
```

Rules:

1. **No literal model name, provider name, URL, timeout, TTL, or limit anywhere outside `config/` and the env file.** Reviewable as a grep.
2. **Aliases, not model IDs, cross the wire.** `AI_MODEL_ALIASES` maps them. Swapping to a newer model is an env change and a restart — no code, no deploy of new logic.
3. **Providers are registered only if credentialed.** Missing `ANTHROPIC_API_KEY` → Anthropic simply absent from the registry, absent from `/api/capabilities`, and rejected if requested. No half-configured provider that fails at first token.
4. **Config is a value, passed to `buildContainer(config)`.** Tests construct their own; no `process.env` mutation, no import-time side effects.
5. `.env.example` is committed and exhaustive (`.env*` is already gitignored).

Env surface:

```text
NODE_ENV  PORT  API_BASE_PATH  CORS_ORIGINS  TRUST_PROXY  BODY_LIMIT_BYTES  REQUEST_TIMEOUT_MS
OPENAI_API_KEY  OPENAI_BASE_URL   ANTHROPIC_API_KEY  ANTHROPIC_BASE_URL
AI_MODEL_ALIASES            # JSON: {"default":"<provider>:<model>","fast":"...","reasoning":"..."}
AI_DEFAULT_MODEL_ALIAS  AI_CLIENT_SELECTABLE_ALIASES
AGENT_MAX_STEPS  AGENT_TOTAL_TIMEOUT_MS  AGENT_STEP_TIMEOUT_MS  AGENT_MAX_OUTPUT_TOKENS
AGENT_HISTORY_WINDOW  AGENT_MAX_INPUT_CHARS
WEATHER_PROVIDER  WEATHER_FALLBACK_PROVIDERS
WEATHER_OPEN_METEO_BASE_URL  WEATHER_OPEN_METEO_GEOCODING_BASE_URL  WEATHER_OPEN_METEO_TIMEOUT_MS
WEATHER_WEATHERAPI_BASE_URL  WEATHER_API_KEY  WEATHER_WEATHERAPI_TIMEOUT_MS
WEATHER_DEFAULT_UNITS  WEATHER_DEFAULT_FORECAST_DAYS  WEATHER_MAX_FORECAST_DAYS  WEATHER_GEOCODE_LIMIT
CACHE_ENABLED  CACHE_MAX_ENTRIES  CACHE_TTL_CURRENT_MS  CACHE_TTL_FORECAST_MS  CACHE_TTL_GEOCODE_MS
RATE_LIMIT_CHAT_WINDOW_MS  RATE_LIMIT_CHAT_MAX  RATE_LIMIT_READ_WINDOW_MS  RATE_LIMIT_READ_MAX
LOG_LEVEL  TELEMETRY_ENABLED  SERVICE_NAME  FEATURE_FLAGS
# client
NEXT_PUBLIC_API_BASE_URL
```

---

## 6. OpenAI / Anthropic Provider Strategy

Three layers, each swappable:

```text
alias ("default")  →  ModelSpec {provider:"openai", model:"<from env>", settings}
                   →  registry.languageModel("openai:<model>")
                   →  wrapLanguageModel(model, defaultSettingsMiddleware({...}))
```

```ts
// provider-registry.ts
export function createLlmRegistry(cfg: AppConfig['ai'], deps: { fetch?: FetchFunction }) {
  const providers: Record<string, ProviderV4> = {};
  if (cfg.providers.openai)    providers.openai    = createOpenAI({ apiKey: …, baseURL: …, fetch: deps.fetch });
  if (cfg.providers.anthropic) providers.anthropic = createAnthropic({ apiKey: …, baseURL: …, fetch: deps.fetch });
  return createProviderRegistry(providers, { separator: ':' });
}

// model-resolver.ts
export interface ModelResolver {
  resolve(alias?: string): { model: LanguageModel; spec: ModelSpec };
  listSelectable(): readonly PublicModelInfo[];   // safe for /api/capabilities
}
```

Why this shape:

- **`createProviderRegistry` is the only place provider identity exists.** Adding Google/Bedrock/AI Gateway later = one `if` + one env entry. Nothing in the agent, tools, or routes changes.
- **Provider-specific knobs stay provider-specific and declarative.** Anthropic extended thinking and OpenAI reasoning effort are expressed as `settings.providerOptions` on the alias in config, applied via `defaultSettingsMiddleware`. No `if (provider === 'anthropic')` branches in application code.
- **Injectable `fetch`** on both factories → provider adapters are testable and observable (timing, redacted logging) without intercepting global fetch.
- **Capability differences are handled by the agent, not by branching.** Tool calling, parallel tool calls, and streaming are supported by both target providers for the models we'd alias; anything provider-specific that matters (e.g. reasoning-part streaming) is additive in the UI — `message-item.tsx` renders reasoning parts if present, ignores them if not.
- **Degradation, not surprise.** If the requested alias's provider is unavailable, the resolver returns a `MODEL_UNAVAILABLE` `AppError` (422) rather than silently substituting a different model — silent substitution changes cost and behavior invisibly. Config *may* declare an explicit `fallbackAlias` per alias; opt-in only.
- Testing: `MockProviderV4` / `MockLanguageModelV4` from `ai/test` register under a `mock` provider id in test config. The agent is fully testable offline.

---

## 7. Weather Provider Strategy

### Replace one god method with capability ports

```ts
export type WeatherCapability = 'geocode' | 'current' | 'forecast' | 'alerts' | 'history';

export interface GeocodingPort  { geocode(q: GeocodeQuery, ctx: CallCtx): Promise<readonly LocationRef[]>; }
export interface ConditionsPort { getCurrent(loc: LocationRef, o: CurrentOptions, ctx: CallCtx): Promise<CurrentConditions>; }
export interface ForecastPort   { getForecast(loc: LocationRef, o: ForecastOptions, ctx: CallCtx): Promise<Forecast>; }
// later, additive only:
export interface AlertsPort     { getAlerts(loc: LocationRef, ctx: CallCtx): Promise<readonly WeatherAlert[]>; }
export interface HistoryPort    { getHistory(loc: LocationRef, r: DateRange, ctx: CallCtx): Promise<HistoricalSeries>; }

export interface WeatherProviderAdapter {
  readonly id: string;
  readonly capabilities: ReadonlySet<WeatherCapability>;
  readonly geocoding?: GeocodingPort;
  readonly conditions?: ConditionsPort;
  readonly forecast?: ForecastPort;
  readonly alerts?: AlertsPort;
  readonly history?: HistoryPort;
  health(ctx: CallCtx): Promise<HealthStatus>;
}
```

This is the single most important departure from the existing code. Consequences:

- A provider that only geocodes, or only has alerts, is a first-class citizen. `WeatherService` routes **per capability**, so we can run Open-Meteo for forecast and something else for alerts without either provider pretending to do both.
- "Is it raining now?" issues one current-conditions request. Today it would fetch a 5-day forecast too.
- Adding alerts/history is **additive**: new port file, new method on the adapters that support it, new tool file, one feature flag. The agent core and every existing tool are untouched — which is exactly the evolution requirement.

### WeatherService responsibilities

```ts
export interface WeatherService {
  searchLocations(q: GeocodeQuery, ctx: CallCtx): Promise<readonly LocationRef[]>;
  resolveLocation(input: LocationInput, ctx: CallCtx): Promise<LocationRef>;   // ref | freeform | lat/lon
  getCurrent(input: LocationInput, o: CurrentOptions, ctx: CallCtx): Promise<CurrentConditions>;
  getForecast(input: LocationInput, o: ForecastOptions, ctx: CallCtx): Promise<Forecast>;
  compare(inputs: readonly LocationInput[], o: CompareOptions, ctx: CallCtx): Promise<WeatherComparison>;
  capabilities(): ReadonlySet<WeatherCapability>;
}
```

It, and only it, does: capability routing · cache read/write with single-flight · unit conversion at the **edge of the domain** (providers always return canonical SI-ish values; conversion happens once, on output) · bounded fallback to the next configured provider on retryable failure (never on `LOCATION_NOT_FOUND`) · clamping `days` to `config.weather.defaults.maxForecastDays` · attaching provenance (`providerId`, `fetchedAt`, `cache: hit|miss`) so the UI can honestly say "Open-Meteo, 2 min ago".

### Adapter rules

- Upstream JSON is **parsed with zod**, then mapped. Today's `as OpenMeteoForecastResponse` cast means a provider schema change surfaces as `undefined` deep in a mapper; a parse failure should be a clean `PROVIDER_CONTRACT_ERROR`.
- All URLs, keys, timeouts, retry counts come from that provider's config slice.
- Shared `HttpClient`: per-call timeout + `AbortSignal` chaining, bounded retry with jitter on 429/5xx/network only, **URL redaction before logging** (fixes the WeatherAPI key-in-URL leak; prefer header/param injection handled centrally).
- `mock` provider stays and gets richer: it's the fixture backend for tests and for `pnpm dev` without keys. Existing magic strings (`"invalid"`, `"fail"`) become documented, explicit scenario triggers.
- `formatDayOfWeek`'s `"en-US"` moves out of providers entirely — day-of-week is a **presentation** concern, computed client-side from the ISO date with the user's locale, or server-side from `config.weather.defaults.locale` when needed.

---

## 8. State Management Strategy

The dividing line, stated once and enforced:

> **Streaming/LLM state → AI SDK. Request/response server state → TanStack Query. Nothing crosses.**

### AI SDK owns (do NOT wrap in Query)

- `useChat({ transport: new DefaultChatTransport({ api, prepareSendMessagesRequest }) })`
- messages, status (`submitted|streaming|ready|error`), token deltas, tool-call lifecycle, `stop()`, `regenerate()`, `sendMessage()`.

Wrapping a stream in `useQuery` would fight it on every axis: no incremental data model, retry semantics that re-run a paid generation, cache keys for something inherently non-idempotent. `useChat` already handles transport, abort, and reconnection.

`prepareSendMessagesRequest` is where per-request options ride along — `{ messages, modelAlias, units, locale, timezone }` — so the *server* stays the decision-maker and the client just states preferences.

### TanStack Query owns

| Query | Why Query earns its place |
|---|---|
| `['capabilities']` | fetched once, `staleTime: Infinity`; drives the model picker and unit options → nothing hardcoded in the UI |
| `['geocode', debouncedQuery, locale]` | typeahead: dedupe, `placeholderData: keepPreviousData`, cancel-on-unmount, `enabled: q.length >= n` |
| `['weather','current',locationKey,units]` | dashboard / deep-linked city view without spending a model call; `staleTime` mirrors server TTL; `refetchOnWindowFocus` is genuinely right for weather |
| `['weather','forecast',locationKey,units,days]` | same |

Also: one `QueryClient` in `app/providers.tsx` with defaults from a single module (retry policy, `staleTime`, `gcTime`); RSC pages may prefetch + `HydrationBoundary` for the dashboard route.

### The one deliberate bridge

When a chat tool result names a location, the client **seeds** the Query cache (`queryClient.setQueryData`) with that tool's payload. Clicking "see full forecast" then renders instantly from cache instead of refetching. One-directional, explicit, ~5 lines — chat state is never read *from* Query.

### Not used

No Redux/Zustand/Jotai. Remaining local state is component-level or one small context for units/model preference. Introducing a global store here would be ceremony.

---

## 9. Streaming Strategy

- **Transport:** SSE via the AI SDK **UI Message Stream** protocol — typed parts (text, reasoning, tool input/output, data, errors), not a raw token stream. That's what lets the client render weather cards from tool output mid-stream.
- **Server:** `pipeAgentUIStreamToResponse({ response: res, agent, uiMessages, abortSignal, timeout, messageMetadata, onError, onFinish })`. It writes to the Node `ServerResponse` directly — the natural fit for Express 4, and it sets the protocol headers for us.
- **Express specifics that must be handled** (these are the usual failure modes):
  - Do **not** put `compression()` in front of `/api/chat`, or exclude it there — buffering kills first-token latency.
  - `app.set('trust proxy', config.http.trustProxy)` so rate-limit keys and logs are honest behind a proxy.
  - CORS must allow the chat route and expose the stream's protocol headers; credentials off (no auth).
  - No global `express.json()` timeout/`server.requestTimeout` shorter than `agent.totalTimeoutMs`.
- **Abort:** `req.on('close')` → `controller.abort()` → agent → tools → upstream fetch. Log as `aborted`, not as an error, and don't count it as a failure metric.
- **Backpressure/pacing:** `smoothStream` is available as an optional, config-flagged transform. Default off — it adds latency for a cosmetic gain; enable only if the UI looks choppy.
- **Metadata:** `messageMetadata` carries `{ modelAlias, providerId, cacheHits, durationMs, usage }` → the UI can show provenance and we get per-message telemetry without a side channel.
- **Errors mid-stream:** masked through `onError` into a safe `{ code, message }` error part. The transcript keeps everything already streamed and shows an inline retry — far better than a blank failure.
- **Typed client:** `type WeatherUIMessage = InferAgentUIMessage<typeof weatherAgent>`; `useChat<WeatherUIMessage>()` gives exhaustive `switch` over tool parts, so a new tool is a **compile error** until the UI handles it.
- **Not in v1:** resumable streams (`resume`) — that needs durable stream storage, i.e. a database. Explicitly deferred (§13).

---

## 10. Errors, Caching, Rate Limiting

### Errors

One taxonomy, mapped once at the edge:

```ts
type ErrorCode =
  | 'VALIDATION_ERROR' | 'LOCATION_NOT_FOUND' | 'LOCATION_AMBIGUOUS'
  | 'MODEL_UNAVAILABLE' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_CONTRACT_ERROR'
  | 'RATE_LIMITED' | 'UPSTREAM_TIMEOUT' | 'AGENT_LIMIT_EXCEEDED'
  | 'REQUEST_ABORTED' | 'INTERNAL_ERROR';

class AppError extends Error {
  constructor(readonly code: ErrorCode, readonly detail: {
    status?: number; publicMessage: string; cause?: unknown;
    retryable?: boolean; meta?: Record<string, unknown>;
  }) { super(detail.publicMessage); }
}
```

- The existing `WeatherProviderError` is kept as the **domain** error and mapped to `AppError` at the service boundary — no rewrite of provider code needed.
- **Three distinct surfaces, deliberately different:**
  1. *Inside a tool* — recoverable failures become structured tool results (`{ ok: false, code, message, suggestions }`). The model can then ask "Did you mean Springfield, Illinois?" This is the single biggest UX win available here.
  2. *Mid-stream* — masked error part + inline retry.
  3. *Pre-stream (route level)* — normal JSON error with correct status.
- Client-safe messages only: provider names/URLs/keys/stack traces never leave the server; full detail goes to logs with the `requestId`, which is echoed in the response so a user can quote it.
- `4xx` is not alert-worthy; `5xx` and `PROVIDER_CONTRACT_ERROR` are.

### Caching (no database, no Redis in v1)

| Layer | What | TTL |
|---|---|---|
| Per-request memo | dedupes repeat reads inside one agent run (Lisbon asked twice) | request lifetime |
| Process TTL cache + **single-flight** | geocode / current / forecast, keyed `capability:providerId:lat,lon@precision:units:days:locale` | per capability from config (geocode long, forecast medium, current short) |
| HTTP response headers | `Cache-Control: public, s-maxage=…` on GET weather/geocode routes | mirrors TTL — free CDN win later |
| TanStack Query | client-side, `staleTime` mirroring server TTL | per query |

Design notes: **single-flight is the point** — 10 concurrent "weather in Paris" hits upstream once. Coordinates are rounded to a configured precision before keying, so "Paris" and "Paris, France" collapse to one entry. Cache stores canonical units; conversion is post-cache, so metric and imperial users share entries. Bounded `maxEntries` with LRU eviction — an in-process cache is a memory leak the moment it's unbounded. `CachePort` means Redis is a later swap, not a rewrite. **No LLM response caching in v1** (the extension point is a `wrapLanguageModel` middleware).

### Rate limiting

- `express-rate-limit@7` (already installed), **two buckets from config**: a tight one on `/api/chat` (expensive, unauthenticated) and a loose one on the GET read routes. Standard headers on.
- Key: client IP via `trust proxy`, plus an optional client-supplied `x-session-id` **only to make limits stricter**, never looser (it's forgeable).
- Layered budgets beyond HTTP — these are the real cost controls:
  - `bodyLimitBytes` + `AGENT_MAX_INPUT_CHARS` + `AGENT_HISTORY_WINDOW` (`pruneMessages`) cap input growth. Without this, client-held history is an unbounded-payload hole.
  - `stopWhen: stepCountIs(maxSteps)` caps tool loops; `maxOutputTokens` caps generation; `totalTimeoutMs` / `stepTimeoutMs` cap wall clock.
  - Provider-side: bounded retries with jitter, so a flaky upstream can't be amplified into a stampede.
- Path to real quotas later (per-user, distributed) is a `RateLimitPort` with a Redis store — same pattern as the cache.

---

## 11. Key Interfaces & Contracts

### Tool context (the DI seam)

```ts
export interface ToolContext {
  readonly weather: WeatherService;
  readonly logger: Logger;
  readonly metrics: Metrics;
  readonly clock: Clock;
  readonly requestId: string;
  readonly preferences: { units: UnitSystem; locale: string; timezone?: string };
  readonly limits: { maxForecastDays: number; maxCompareLocations: number };
}
```

Passed as `toolsContext` on the agent call; reaches `execute(input, { context, abortSignal })` fully typed. **No tool ever imports a singleton.** A tool test is: build a fake context, call `execute`, assert. No network, no module mocking.

### Tool shape

```ts
export const getForecastTool = tool({
  description: '…',                                  // string from a single instructions/description module
  inputSchema: z.object({
    location: locationInputSchema,                   // LocationRef | freeform | {lat,lon}
    days: z.number().int().min(1).optional(),        // clamped server-side to config max
    units: unitSystemSchema.optional(),
  }),
  execute: async (input, { context, abortSignal }): Promise<ToolResult<ForecastPayload>> => { … },
});
```

`ToolResult<T> = { ok: true; data: T; meta: Provenance } | { ok: false; code: ErrorCode; message: string; suggestions?: … }` — a uniform envelope, so the client's `tool-part.tsx` and the model both handle success/failure consistently.

### Agent factory

```ts
export interface AgentDeps {
  modelResolver: ModelResolver;
  tools: ToolSet;
  config: AppConfig['ai'];
  logger: Logger;
}
export interface AgentRequest {
  modelAlias?: string;
  preferences: { units: UnitSystem; locale: string; timezone?: string };
}
export function createWeatherAgent(deps: AgentDeps, req: AgentRequest): WeatherAgent;
export type WeatherAgent = ToolLoopAgent</* … */>;
export type WeatherUIMessage = InferAgentUIMessage<WeatherAgent, ChatMessageMetadata>;
```

### HTTP contracts

```text
POST /api/chat
  body  { messages: UIMessage[], modelAlias?: string, units?: 'metric'|'imperial',
          locale?: string, timezone?: string }
  200   text/event-stream — AI SDK UI message stream
  4xx   { error: { code, message, requestId, fields? } }

GET /api/geocode?q=&limit=&locale=
  200   { locations: LocationRef[], meta: { providerId, cache } }

GET /api/weather?location=|lat=&lon=&days=&units=&include=current,forecast
  200   { location, current?, forecast?, meta: { providerId, fetchedAt, cache } }

GET /api/capabilities
  200   { models: [{ alias, label, providerId }], units: [...], weather: { capabilities: [...] },
          limits: { maxForecastDays, maxCompareLocations }, features: {...} }
      # no secrets, no concrete model IDs unless config marks them public

GET /healthz  → { status: 'ok' }                       (liveness, no upstream calls)
GET /readyz   → { status, providers: {...} }           (readiness, cached health probes)
```

`/api/capabilities` is what keeps the **frontend** free of hardcoded values — the model picker, unit toggle, and suggestion chips are all rendered from it.

### Platform ports

```ts
interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T>;  // single-flight
}
interface Logger { child(b: Record<string, unknown>): Logger; debug/info/warn/error(msg, meta?): void }
interface Metrics { increment(n, tags?): void; timing(n, ms, tags?): void }
interface Clock { now(): Date }
```

---

## 12. Dependency Changes

### Server — nothing is required for v1

Everything needed is installed: `ai@7`, `@ai-sdk/openai@4`, `@ai-sdk/anthropic@4`, `zod`, `express`, `cors`, `helmet`, `express-rate-limit`, `dotenv`, `vitest`, `tsx`, `typescript`.

Optional, with the reason each is *not* needed on day one:

| Package | When | Why deferred |
|---|---|---|
| `pino` + `pino-http` | phase 4 | `LoggerPort` + console adapter ships first; swap is one file |
| `supertest` + `@types/supertest` (dev) | phase 4 | route tests; `createApp()` is already listen-free to enable this |
| `@opentelemetry/*` | phase 5 | AI SDK telemetry hooks are wired but off by default; no collector yet |
| `lru-cache` | if needed | bounded Map + TTL is ~60 lines and dependency-free |
| `compression` | **avoid on `/api/chat`** | buffers SSE; only add scoped to JSON routes if measurements justify it |
| `express@5` | not now | Express 4.22 is fine; migration is unrelated churn |

### Client — shadcn components + one dev tool

- shadcn/Base UI components to add via CLI (style `base-nova` already configured): `input`, `card`, `scroll-area`, `separator`, `badge`, `skeleton`, `tooltip`, `select`, `toggle-group`, `sonner` (or `alert`), `avatar`, `dialog`. These land in `components/ui/` alongside the existing `button.tsx`.
- `@tanstack/react-query-devtools` (dev only).
- Deliberately **not** adding: a markdown renderer until we confirm responses need one (and then it must be sanitized); a charting library until the forecast UI genuinely needs a chart (CSS bars cover the first version); a global state library.
- **`ai-elements` — considered, deferred.** It's the natural fit for chat scaffolding, but this project is on shadcn style `base-nova` with Base UI primitives and a `cn` package instead of `clsx`+`tailwind-merge`. Dropping a registry's components in risks a styling/primitive mismatch across the whole chat surface. Decision: build the ~6 chat components against existing primitives in phase 3; **evaluate `ai-elements` on one component first** (e.g. the tool-call display) before adopting broadly.
- No root pnpm workspace in v1 (see §13).

---

## 13. Trade-offs & Key Decisions

| # | Decision | Alternative rejected | Reasoning |
|---|---|---|---|
| 1 | Single `ToolLoopAgent` | workflow/graph engine, multi-agent | The task is retrieve→synthesize with ≤4 steps. v7's `stopWhen`/`prepareStep`/`activeTools` already provide the control a graph would. Escalation path documented (phase 5). |
| 2 | Capability ports replace `IWeatherProvider.getWeatherReport` | keep the one coarse method | The god method can't express partial providers, forces unneeded requests, and blocks alerts/history without a signature change. This is the change that buys the "evolve without rewriting" requirement. Cost: a real refactor of 3 existing provider files. |
| 3 | Typed `LocationRef` from `search_location`, threaded through data tools | pass city strings everywhere | Kills re-geocoding, makes ambiguity explicit, stabilizes cache keys. Cost: one extra agent step on first mention (mitigated: data tools also accept freeform). |
| 4 | Streaming via `pipeAgentUIStreamToResponse` into Express | Next.js route handler owning the AI logic | Keeps secrets and orchestration in one server, matches the requested layering, and avoids splitting the agent across two runtimes. Cost: must get SSE hygiene right in Express (no compression, trust proxy, CORS headers). |
| 5 | In-process TTL cache + single-flight | Redis; no cache | No infra, big win (weather is highly repetitive). Cost: cache is per-instance, so hit rate drops when scaled horizontally. `CachePort` makes Redis a later swap. |
| 6 | No database | persist chats/streams | Nothing in v1 needs durability. Costs, stated plainly: no cross-device history, no resumable streams, no server-side analytics on conversations. All three are acceptable v1 gaps and each has a clear later path. |
| 7 | Client holds conversation history | server session store | Stateless server, trivially scalable. Cost: payload grows and is client-controlled → **mandatory** body limit + `pruneMessages` + `safeValidateUIMessages`. Called out as a security item, not an afterthought. |
| 8 | Model **aliases** over the wire | client sends model IDs | No model names in client code; swapping models is env-only; the allowlist prevents a client from selecting an expensive model. |
| 9 | Fail-fast config | current silent-defaults `env.ts` | A prod deploy with a typo'd var should refuse to boot, not serve wrong data quietly. |
| 10 | Duplicate contract types in `client/lib/contracts` initially | root pnpm workspace + `packages/contracts` now | There is no root workspace today and no commits; adding one touches both installs and CI before any feature exists. Cost: types can drift. Mitigations: derive client types from a single mirrored module, keep DTOs small, and **extract the shared package in phase 5** — the moment drift is felt. This is the weakest link in the plan and is named as such. |
| 11 | Zod-parse upstream provider payloads | keep `as Response` casts | A silent upstream schema change currently produces `undefined` deep in a mapper. Parsing turns it into one clean `PROVIDER_CONTRACT_ERROR` with a log. Small CPU cost, fine at this volume. |
| 12 | Canonical units in the domain, convert on output | per-provider unit handling | One conversion site, metric and imperial share cache entries, and unit bugs have one place to live. |
| 13 | Tool failures as values, not exceptions | throw and fail the stream | Lets the model ask a clarifying question instead of the user seeing "something went wrong". |
| 14 | Keep and extend the `mock` provider | test against live APIs | Deterministic tests, `pnpm dev` with zero keys, and a fixture backend for UI work. |
| 15 | Build chat UI on existing Base UI/shadcn primitives; trial `ai-elements` on one component | adopt `ai-elements` wholesale now | The repo's `base-nova` + Base UI + `cn`-package setup is unusual enough that a registry mismatch would be felt across the whole chat surface. |
| 16 | No registry tool in v1 | adopt Exa/Tavily for weather context | The registry has no weather/geo tool, and web search isn't needed to answer weather questions. The tool-registry boundary makes adding one a config flag + one file if scope grows. |

---

## 14. Implementation Phases

Each phase ends in a state that runs and is verifiable.

### Phase 0 — Foundation (unblocks everything)

1. `config/config.schema.ts` + `config.ts` (fail-fast), `config.types.ts`; delete `config/env.ts`; commit `.env.example`.
2. `platform/`: `AppError` + `to-http`, `LoggerPort` + console adapter, `MetricsPort` + noop, `Clock`, `CachePort` + memory cache with TTL/LRU/single-flight.
3. `container.ts` (`buildContainer(config)`), `app.ts` (`createApp(container)`, no `listen`), **`server.ts`** (bootstrap + graceful shutdown) — fixes the missing entry point.
4. Edge middleware: request-id, helmet, CORS, body limit, access log, zod `validate`, error handler.
5. `GET /healthz`, `/readyz`.
6. Vitest: config parsing (valid/invalid/defaults), cache TTL + single-flight + eviction, error mapping.

**Done when:** `pnpm dev` boots, `/healthz` responds, an invalid env var refuses to boot with a readable message.

### Phase 1 — Weather domain

1. Move/extend `domain/`: `weather.types`, `location.types`, `units`, `wmo-codes`, `condition`.
2. Define `ports/` (`geocoding`, `conditions`, `forecast`).
3. `providers/http-client.ts` (timeout, retry+jitter, abort, redaction).
4. Refactor the three existing providers into `open-meteo/`, `weatherapi/`, `mock/` with zod schemas + mappers; remove every hardcoded URL/timeout/day-clamp; move the WeatherAPI key out of the URL; drop the `uvIndex: 0` fiction (omit or request it properly).
5. `provider-catalog.ts` replacing `weather.factory.ts` — no import-time singleton.
6. `weather.service.ts`: routing, cache, units, clamps, provenance, bounded fallback.
7. `GET /api/weather`, `GET /api/geocode` with `Cache-Control`.
8. Tests: mappers against captured fixtures, service routing/fallback/cache with a fake adapter, unit conversions.

**Done when:** weather is fully usable over REST with **no AI involved** — the agent becomes a consumer of a proven layer, not the only path to it.

### Phase 2 — AI layer & streaming

1. `provider-registry.ts`, `model-resolver.ts` (aliases + allowlist), `model-middleware.ts`.
2. `tools/tool-context.ts`, `tool-registry.ts` (feature-flagged), then `search_location`, `get_current_weather`, `get_forecast`, `compare_weather`.
3. `agent/instructions.ts` (templated: units, locale, current time, tool-use guidance, refusal-to-guess rule), `policies.ts` (budgets), `agent.factory.ts`.
4. `POST /api/chat`: validate → prune → resolve model → build context → `pipeAgentUIStreamToResponse`, with abort wiring, masked `onError`, `messageMetadata`, usage logging.
5. `GET /api/capabilities`.
6. Tests with `MockLanguageModelV4`: tool schema validation, a scripted multi-step loop, step-cap enforcement, abort propagation, error masking.

**Done when:** `curl -N` against `/api/chat` streams a real, tool-grounded answer, and the step cap and abort are provably enforced.

### Phase 3 — Frontend

1. `app/providers.tsx` (QueryClient defaults), fix `layout.tsx` metadata, replace the placeholder `app/page.tsx`.
2. `lib/api/http.ts` + `endpoints.ts`; `lib/queries/*` for capabilities, geocode, weather.
3. Add the shadcn components listed in §12.
4. `lib/chat/transport.ts` + `use-weather-chat.ts`; `components/chat/*` with a typed exhaustive `switch` in `tool-part.tsx`.
5. `components/weather/*`: current conditions card, forecast strip, comparison table, location typeahead, units toggle, skeletons.
6. Model picker + suggestion chips rendered from `/api/capabilities`.
7. Accessibility and states: live region for streaming text, visible focus, keyboard-only flow, `prefers-reduced-motion`, empty/loading/error/aborted states, mobile layout.

**Done when:** a question produces streaming prose *and* rendered weather cards, with working stop/retry, and no hardcoded model or unit lists in the client.

### Phase 4 — Hardening

1. Rate-limit buckets from config; `trust proxy`; verify SSE is not compressed or buffered.
2. Swap console logger for `pino` behind the port; structured tool-call logs (duration, cache hit, provider, requestId).
3. Turn on AI SDK `telemetry` (config-gated); metrics: tool latency, cache hit rate, provider errors, tokens per request.
4. `supertest` route tests incl. a rate-limit trip and an oversized-history rejection; a small eval set of representative questions run against the mock provider.
5. Security pass: confirm no secret in any response/log/URL; CORS origins locked; `readyz` doesn't leak provider detail; request-size and step caps verified by test.

### Phase 5 — Extensions (each additive by construction)

- `AlertsPort` + `get_alerts` tool + alert banner UI.
- `HistoryPort` + `get_historical_weather` + "vs. seasonal normal" comparison.
- Extract `packages/contracts` behind a root pnpm workspace (resolves trade-off #10).
- Redis `CachePort` + `RateLimitPort` implementations for multi-instance deploys.
- Optional registry tool (Exa/Tavily) if weather *news* enters scope.
- If a genuinely multi-stage use case appears: `AgentRegistry` with several `ToolLoopAgent`s + a router — still no bespoke workflow engine.
- Resumable streams / chat persistence — the first feature that would justify a database. Not before.

---

## Plan Ready for Approval

**What this designs:** a Weather AI Agent as `Next.js UI → (useChat for streaming | TanStack Query for server state) → Express API → ToolLoopAgent → tool layer → WeatherService → provider adapters`, with every layer injected rather than imported as a singleton.

**The load-bearing decisions:**

1. **One `ToolLoopAgent`**, not a workflow engine — v7's `stopWhen` / `prepareStep` / `activeTools` / `toolsContext` already cover the control and DI a graph would be built for.
2. **Capability ports** (`GeocodingPort` / `ConditionsPort` / `ForecastPort`, later alerts + history) replace the existing single `getWeatherReport` method. This is the refactor that makes alerts, history, and comparison additive instead of a core rewrite.
3. **Model aliases + `createProviderRegistry`** — OpenAI and Anthropic are config entries; no model or provider name appears in any client or application file, and the client can only pick from a server allowlist.
4. **Fail-fast config** replacing the current silent-defaults `env.ts`; every URL, timeout, TTL, limit, and flag lives in `AppConfig`.
5. **Clean state split** — AI SDK owns streaming/chat, TanStack Query owns capabilities/geocode/direct weather reads, with one explicit one-way cache-seeding bridge.
6. **Stateless, no database.** In-process TTL cache with single-flight, two rate-limit buckets, and layered step/token/time/payload budgets as the real cost controls (there's no auth).
7. **Tool failures as values**, so the agent asks "did you mean Springfield, Illinois?" instead of surfacing an error.
8. The **AI SDK Tools Registry has no weather, geocoding, HTTP, caching, or observability tool** (checked: 14 entries, all search/scrape/sandbox/browser/guardrail) — so the tool layer is first-party, with a boundary that makes adding Exa/Tavily/Superagent later a config flag plus one file.

**Named weak point:** no shared contracts package in v1 (there's no root pnpm workspace today), so client types are mirrored and can drift. Mitigated by keeping DTOs small and a single mirrored module; extraction is phase 5.

**Dependencies:** server needs **nothing new** for v1. Client needs a set of shadcn components plus Query devtools. Optional server additions (`pino`, `supertest`, OTel) are phase 4–5.

**Existing-code impact:** `src/config/env.ts` is replaced; `weather.factory.ts` becomes `provider-catalog.ts`; the three provider files are refactored (zod parsing, config-driven URLs/timeouts, key out of the URL); `weather.types.ts` moves into `weather/domain/`; `weather.interface.ts`'s single method is split into ports. `server.ts` is written for the first time. On the client, `app/page.tsx` replaces the create-next-app placeholder and `layout.tsx` gains providers and real metadata.

**Phasing:** 0 foundation → 1 weather domain usable over REST with no AI → 2 agent + streaming → 3 frontend → 4 hardening → 5 extensions. Each phase ends runnable and tested.

**Nothing has been modified or installed.** Awaiting approval before implementing.
