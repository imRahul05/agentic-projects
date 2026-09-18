# Weather Agent (Web Search Only) — Architecture & Implementation Plan

**Status:** Design only. No code written, no packages installed.
**Date:** 2026-09-18
**Scope:** ONE agent · ONE tool (`web_search`) · weather questions only · nothing else.
**Supersedes:** `weather-ai-agent-architecture.md` (kept for the repo audit and the rejected-alternative record).

---

## 0. Scope Change from the Previous Plan

| Previous plan | This plan |
|---|---|
| 4 tools (`search_location`, `get_current_weather`, `get_forecast`, `compare_weather`) | **1 tool: `web_search`** |
| Weather HTTP providers (Open-Meteo, WeatherAPI, mock) + capability ports + `WeatherService` | **deleted** — no weather API integration at all |
| Geocoding, units domain, WMO code mapping, provider fallback, provenance | **deleted** |
| `GET /api/weather`, `GET /api/geocode` | **deleted** |
| TanStack Query for weather reads + typeahead | Query keeps **one** job: `GET /api/capabilities` |
| Typed weather cards from structured provider data | Streaming prose + **citations**; typed card is an optional later step |
| Multi-layer cache keyed by capability/coords/units | Cache only in external-search mode; **none** in the default mode |

**Existing `server/src/weather/**` is removed** (it's uncommitted; git keeps nothing, so the files are simply deleted — the previous doc records what they did). `weather.types.ts` does not survive: there is no structured weather domain in this design.

**What the cut costs, stated up front:** answers become as good as search snippets. No guaranteed numeric accuracy, no controllable freshness, no forecast arrays, no unit conversion, no offline determinism in the default mode. That is the accepted trade for one tool and near-zero moving parts. §13 covers it honestly.

---

## 1. High-Level Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│ BROWSER — Next.js 16 (client/)                                       │
│   components/chat/*        components/weather/sources-list.tsx       │
│         │                                                            │
│   useChat (@ai-sdk/react) + DefaultChatTransport   ← streaming        │
│   TanStack Query → GET /api/capabilities only      ← server state     │
└────────────────────┬─────────────────────────────────────────────────┘
                     │ POST /api/chat  (SSE, UI message stream)
                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│ EXPRESS API (server/) — sole holder of secrets                        │
│  edge: helmet · cors · request-id · body limit · rate-limit · zod     │
│  routes: POST /api/chat · GET /api/capabilities · /healthz /readyz    │
└────────────────────┬─────────────────────────────────────────────────┘
                     │ container(config) — no singletons
                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│ AGENT LAYER — one ToolLoopAgent                                       │
│   instructions: weather-only scope + today's date/timezone            │
│   tools: { web_search }              stopWhen: stepCountIs(maxSteps)  │
│   timeout · maxOutputTokens · sendSources: true                       │
└────────────────────┬─────────────────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│ SEARCH TOOL SLOT — SearchToolFactory (one interface, two adapters)    │
│                                                                      │
│  A. native  (default, 0 deps, 0 extra keys)                          │
│       openai:    openai.tools.webSearch({...})                       │
│       anthropic: anthropic.tools.webSearch_<version>({...})          │
│       → provider-executed; we define no execute()                    │
│                                                                      │
│  B. external (opt-in, portable, offline-testable)                    │
│       our tool({ inputSchema: {query}, execute })                     │
│       → SearchClient port → Exa | Tavily | fake                      │
└────────────────────┬─────────────────────────────────────────────────┘
                     ▼
        the open web (via the model provider, or via a search API)

┌──────────────────────────────────────────────────────────────────────┐
│ PLATFORM PORTS: LoggerPort · MetricsPort · Clock                      │
│                 CachePort — only used by adapter B                    │
└──────────────────────────────────────────────────────────────────────┘
```

Five layers instead of eight. No weather domain, no provider adapters, no geocoding.

---

## 2. Client / Server Responsibility Split

**Client**
- Chat transcript, prompt input, stop/retry, streaming indicator, in-progress "searching…" affordance.
- Citation list rendered from **`source-url` parts** (provider-agnostic — see §9).
- Conversation history (source of truth; sent each request).
- One Query call: `/api/capabilities` → model picker + suggestion chips. Nothing hardcoded.

**Server**
- All secrets: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `SEARCH_API_KEY` in adapter-B mode.
- Alias → model resolution with an allowlist; scope instructions; search-tool selection.
- Budgets: steps, searches, output tokens, wall clock, request size.
- Validation, rate limiting, error masking, logging.

**Non-responsibilities:** no database, no session store, no auth, no weather API, no server-side history.

---

## 3. Agent & Tool Flow

### One `ToolLoopAgent`. One tool.

With a single tool there is nothing to orchestrate — `toolChoice: 'auto'` plus a step cap is the entire control structure. No `prepareStep`, no `activeTools`, no agent registry. Those were justified by four tools; they are dead weight with one.

```text
User: "Do I need an umbrella in Lisbon tomorrow?"

step 1  model → web_search  (query shaped by instructions:
                             "Lisbon weather forecast <tomorrow's date>")
        ← provider-executed: results + sources
step 2  model → (optional) one refining search, if step 1 was thin
step 3  model → text answer, streamed, with inline citations
stop    natural stop on a text-only step; stepCountIs(maxSteps) is the backstop
```

### The three things the instructions must enforce

This is where the design work moved. With one blunt tool, prompt + budget *are* the architecture.

1. **Scope lock.** Weather, forecasts, and directly weather-dependent advice ("umbrella?", "jacket?") only. Anything else → a short, fixed refusal + redirect. Declining is cheap; doing it consistently is the product boundary.
2. **Today's date, timezone, and locale are injected** into the instructions every request. Without them the model searches for stale dates and "tomorrow" is meaningless. This is the single highest-value line in the prompt.
3. **Query shaping + honesty rules.** Always include the location and an explicit date in the search query; prefer results whose timestamp is visible; **state the observation time and source in the answer**; if search returns nothing usable, say so rather than inventing numbers. Never state a number that did not appear in a result.

### Scope enforcement, layered (defense in depth, cheap first)

| Layer | Mechanism | Cost |
|---|---|---|
| 1 | Instruction scope lock + fixed refusal text | free |
| 2 | `stopWhen: stepCountIs(config.agent.maxSteps)` + `maxSearches` (`maxUses` where the provider supports it) | free |
| 3 | `allowedDomains` from config (weather sites) where the provider supports it | free, improves quality |
| 4 | *(deferred)* cheap classifier pre-pass to reject off-topic before any paid call | one extra call |

Layer 4 is deliberately deferred: instructions handle it, and a classifier doubles per-request cost for a case that rate limiting already bounds.

### Why not zero tools

A model without search cannot know today's weather — it would answer from training data, confidently and wrongly. Search is the whole product. That also means: **if search fails, the correct behavior is to say so**, never to fall back to the model's own guess. That rule belongs in the instructions and in the eval set.

---

## 4. Folder / Module Structure

### Server

```text
server/src/
  server.ts                     # NEW: bootstrap → listen → graceful shutdown
  app.ts                        # createApp(container), no listen (supertest-friendly)
  container.ts                  # buildContainer(config) — the only wiring site

  config/
    config.schema.ts            # zod over process.env
    config.ts                   # loadConfig(): AppConfig — FAIL FAST
    config.types.ts
    # replaces src/config/env.ts

  http/
    middleware/{request-id,security,rate-limit,validate,error-handler,access-log}.ts
    routes/{index,chat.route,capabilities.route,health.route}.ts
    contracts/chat.contract.ts  # zod ChatRequest
    stream/chat-stream.ts       # pipeAgentUIStreamToResponse + abort + header hygiene

  ai/
    provider/
      provider-registry.ts      # createProviderRegistry from credentialed providers only
      model-resolver.ts         # alias → provider:model → LanguageModel (+ allowlist)
      model-middleware.ts       # wrapLanguageModel / defaultSettingsMiddleware
    agent/
      agent.factory.ts          # createWeatherAgent(deps, req): ToolLoopAgent
      instructions.ts           # scope lock + date/tz/locale injection + honesty rules
      policies.ts               # stopWhen, timeouts, token caps from config
      agent.types.ts            # WeatherAgent, WeatherUIMessage
    search/
      search-tool.factory.ts    # picks native | external per config + provider
      native-search.tool.ts     # openai.tools.webSearch / anthropic.tools.webSearch_*
      external-search.tool.ts   # tool({inputSchema:{query}, execute}) → SearchClient
      search-client.port.ts     # SearchClient interface
      clients/{exa,tavily,fake}.client.ts   # only built if adapter B is enabled

  platform/
    logging/{logger.port,console-logger}.ts
    metrics/{metrics.port,noop-metrics}.ts
    cache/{cache.port,memory-cache}.ts      # adapter B only
    errors/{app-error,to-http}.ts
    telemetry/telemetry.ts
    clock.ts
```

Deleted: `src/weather/**` (types, interface, factory, all three providers), `src/config/env.ts`.

### Client

```text
client/
  app/{layout.tsx, page.tsx, providers.tsx}
  components/
    chat/{chat-panel,message-list,message-item,prompt-input,searching-indicator,
          sources-list,suggestions,model-picker,chat-status}.tsx
    ui/                          # shadcn additions (§12)
  lib/
    api/{http,endpoints}.ts
    chat/{transport,use-weather-chat}.ts
    queries/{query-keys,capabilities.query}.ts
    contracts/chat.ts            # WeatherUIMessage type
  hooks/use-debounced-value.ts   # only if the input needs it
```

Deleted vs previous plan: every `components/weather/*` card, `lib/queries/{weather,geocode}`, `lib/format/temperature`, `hooks/use-units`. `sources-list.tsx` is the one genuinely new component.

---

## 5. Configuration Strategy

Same discipline, far smaller surface: one zod schema, one load, **fail fast**, injected as a value.

```ts
export function loadConfig(env = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new ConfigError(formatIssues(parsed.error)); // never silent defaults
  return toAppConfig(parsed.data);
}
```

```ts
interface AppConfig {
  env: 'development' | 'test' | 'production';
  http: { port; basePath; trustProxy; corsOrigins; bodyLimitBytes; requestTimeoutMs };
  ai: {
    providers: Record<string, ProviderConfig>;      // only credentialed ones
    modelAliases: Record<string, ModelSpec>;        // alias → {provider, model, settings}
    defaultAlias: string;
    clientSelectableAliases: readonly string[];
    agent: { maxSteps; maxSearches; totalTimeoutMs; stepTimeoutMs;
             maxOutputTokens; historyWindowMessages; maxInputChars };
  };
  search: {
    mode: 'native' | 'external';
    native: { toolIdByProvider: Record<string, string>;   // e.g. anthropic → "webSearch_<version>"
              maxUses?: number; allowedDomains?: string[]; blockedDomains?: string[];
              userLocation?: { country?; region?; city?; timezone? } };
    external?: { clientId: string; apiKey: string; baseUrl?: string;
                 maxResults: number; timeoutMs: number; cacheTtlMs: number };
  };
  rateLimit: Record<'chat' | 'read', { windowMs: number; max: number }>;
  observability: { logLevel; telemetryEnabled; serviceName };
  features: Record<string, boolean>;
}
```

**The provider-specific web-search tool id lives in config, not code.** `anthropic.tools` exposes `webSearch_20250305`, `webSearch_20260209`, `webSearch_20260318`; OpenAI exposes `webSearch` (and legacy `webSearchPreview`). Pinning the dated identifier in `SEARCH_NATIVE_TOOL_IDS` means adopting a newer version is an env change — this is exactly the kind of value that must not be hardcoded.

Env surface (whole thing):

```text
NODE_ENV  PORT  API_BASE_PATH  CORS_ORIGINS  TRUST_PROXY  BODY_LIMIT_BYTES  REQUEST_TIMEOUT_MS
OPENAI_API_KEY  OPENAI_BASE_URL  ANTHROPIC_API_KEY  ANTHROPIC_BASE_URL
AI_MODEL_ALIASES            # JSON {"default":"<provider>:<model>","fast":"..."}
AI_DEFAULT_MODEL_ALIAS  AI_CLIENT_SELECTABLE_ALIASES
AGENT_MAX_STEPS  AGENT_MAX_SEARCHES  AGENT_TOTAL_TIMEOUT_MS  AGENT_STEP_TIMEOUT_MS
AGENT_MAX_OUTPUT_TOKENS  AGENT_HISTORY_WINDOW  AGENT_MAX_INPUT_CHARS
SEARCH_MODE                 # native | external
SEARCH_NATIVE_TOOL_IDS      # JSON {"openai":"webSearch","anthropic":"webSearch_<version>"}
SEARCH_MAX_USES  SEARCH_ALLOWED_DOMAINS  SEARCH_BLOCKED_DOMAINS  SEARCH_USER_LOCATION
SEARCH_CLIENT  SEARCH_API_KEY  SEARCH_BASE_URL  SEARCH_MAX_RESULTS  SEARCH_TIMEOUT_MS  SEARCH_CACHE_TTL_MS
RATE_LIMIT_CHAT_WINDOW_MS  RATE_LIMIT_CHAT_MAX  RATE_LIMIT_READ_WINDOW_MS  RATE_LIMIT_READ_MAX
LOG_LEVEL  TELEMETRY_ENABLED  SERVICE_NAME  FEATURE_FLAGS
NEXT_PUBLIC_API_BASE_URL    # client
```

No model name, provider name, URL, tool version, timeout, or limit appears outside `config/` and the env file.

---

## 6. OpenAI / Anthropic Provider Strategy

Unchanged from the previous plan — this part was already right and the scope cut doesn't touch it.

```ts
export function createLlmRegistry(cfg: AppConfig['ai'], deps: { fetch?: FetchFunction }) {
  const providers: Record<string, ProviderV4> = {};
  if (cfg.providers.openai)    providers.openai    = createOpenAI({ apiKey: …, baseURL: …, fetch: deps.fetch });
  if (cfg.providers.anthropic) providers.anthropic = createAnthropic({ apiKey: …, baseURL: …, fetch: deps.fetch });
  return createProviderRegistry(providers, { separator: ':' });
}

export interface ModelResolver {
  resolve(alias?: string): { model: LanguageModel; spec: ModelSpec };
  listSelectable(): readonly PublicModelInfo[];
}
```

- Aliases cross the wire, never model IDs. Server enforces the allowlist.
- Providers register only if credentialed; a missing key means absent from `/api/capabilities` and rejected if requested (`MODEL_UNAVAILABLE`, 422) — never a silent substitution.
- Per-alias `providerOptions` (reasoning effort, thinking budget) declared in config, applied via `defaultSettingsMiddleware`. No `if (provider === …)` in app code.
- Injectable `fetch` keeps both adapters observable and testable.

**One new coupling introduced by this design:** in `native` search mode, the tool is provider-specific, so `resolve(alias)` must return the provider id and `SearchToolFactory` selects the matching native tool. That's a 3-line lookup in `search-tool.factory.ts` and the *only* place provider identity leaks past the registry. If that coupling ever becomes a problem, switching `SEARCH_MODE=external` removes it entirely — which is the main reason adapter B exists.

---

## 7. Search Strategy (replaces "Weather Provider Strategy")

```ts
export interface SearchToolFactory {
  create(ctx: { providerId: string }): ToolSet;   // always exactly one entry: web_search
}

// adapter B only
export interface SearchClient {
  readonly id: string;
  search(q: { query: string; maxResults: number }, ctx: CallCtx): Promise<readonly SearchHit[]>;
}
export interface SearchHit { title: string; url: string; snippet: string; publishedAt?: string }
```

### Adapter A — native, provider-executed (default)

```ts
// openai
openai.tools.webSearch({ /* filters, userLocation from config */ })
// anthropic
anthropic.tools[cfg.native.toolIdByProvider.anthropic]({
  maxUses: cfg.native.maxUses,
  allowedDomains: cfg.native.allowedDomains,
  userLocation: cfg.native.userLocation,
})
```

- **Zero new dependencies, zero extra API keys, no HTTP client of ours.** The provider runs the search and cites it.
- `userLocation` from config gives geographic search bias — a free, config-driven substitute for the geocoding layer we deleted.
- Output shapes differ by provider (OpenAI: `{action, sources[]}`; Anthropic: `web_search_result[]` with `url/title/pageAge/encryptedContent`) — so **the UI must not read tool output directly**. It reads normalized source parts instead (§9). This is the pivotal detail that makes one UI work across both providers.
- Anthropic results carry `encryptedContent`, which must be **passed back unmodified** on later turns and **never rendered**. Any message-pruning or sanitizing step has to preserve it.
- Honest limitation: not offline-testable. Tests in native mode use `MockLanguageModelV4` to script the *tool part* stream rather than exercising real search.

### Adapter B — external, portable (opt-in via `SEARCH_MODE=external`)

- One first-party `tool({ inputSchema: z.object({ query: z.string() }), execute })` delegating to a `SearchClient` (Exa, Tavily — both in the AI SDK Tools Registry — or `fake`).
- Identical input/output on every model provider; fully deterministic tests via `FakeSearchClient`; results cacheable by normalized query (`CachePort`, TTL from config); our own timeout/retry/redaction.
- Costs: one dependency, one more key, one more vendor, and we own result quality and rate limits.

**Default is A. B exists because it's the honest answer to "provider-agnostic" and "testable".** Switching is one env var; the agent, routes, and UI are untouched either way.

### Registry check

Re-checked the AI SDK Tools Registry: 14 entries, still no weather or geocoding tool. Its search entries (Exa, Tavily, Perplexity, Parallel, Firecrawl) are exactly the adapter-B candidates, so this design *uses* the registry where it actually has something to offer, rather than reinventing a search client.

---

## 8. State Management Strategy

> **Streaming → AI SDK. Server state → TanStack Query. Nothing crosses.**

**AI SDK owns** `useChat({ transport: new DefaultChatTransport({ api, prepareSendMessagesRequest }) })` — messages, status, deltas, tool/search parts, source parts, `stop()`, `regenerate()`. Never wrapped in Query: a stream has no cache key, and retry would re-run a paid generation.

`prepareSendMessagesRequest` carries `{ messages, modelAlias, locale, timezone }`. Timezone comes from `Intl.DateTimeFormat().resolvedOptions().timeZone` — needed for "tomorrow" to mean anything.

**TanStack Query owns exactly one query:** `['capabilities']`, `staleTime: Infinity` → model picker + suggestion chips.

Plainly: with the weather REST endpoints gone, Query's role here is small. It stays because that one query is genuinely server state with a cache lifetime, and because it keeps hardcoded model/suggestion lists out of the client. It is **not** stretched to cover chat.

No Redux/Zustand/Jotai. Model-alias preference is one small context + `localStorage`.

---

## 9. Streaming Strategy

- **Transport:** AI SDK UI Message Stream over SSE.
- **Server:** `pipeAgentUIStreamToResponse({ response: res, agent, uiMessages, abortSignal, timeout, sendSources: true, messageMetadata, onError, onFinish })`.
- **`sendSources: true` is load-bearing.** It emits normalized `source-url` parts (`{ type, sourceId, url, title?, providerMetadata? }`), so the citation UI is identical for OpenAI and Anthropic despite their different native tool output. Without it we would be parsing two provider-specific shapes in React.
- **Search progress UX:** the search tool part transitions through input-available → output-available; the client shows "Searching the web…" on that transition. With provider-executed tools the part is flagged `providerExecuted` — the UI renders a status chip, not raw output.
- **Express specifics:** no `compression()` on `/api/chat`; `app.set('trust proxy', cfg.http.trustProxy)`; CORS must allow the route and expose the stream headers; `server.requestTimeout` ≥ `agent.totalTimeoutMs`.
- **Abort:** `req.on('close')` → `controller.abort()` → agent → (adapter B) search fetch. Logged as `aborted`, not an error.
- **Metadata:** `{ modelAlias, providerId, searchCount, durationMs, usage }` for provenance and telemetry.
- **Errors mid-stream:** masked via `onError` into `{ code, message }`; transcript keeps what streamed, offers inline retry.
- **Typed client:** `type WeatherUIMessage = InferAgentUIMessage<WeatherAgent, ChatMessageMetadata>` → exhaustive `switch` over parts.
- **Not in v1:** resumable streams (needs durable storage → a database).

---

## 10. Errors, Caching, Rate Limiting

### Errors — smaller taxonomy

```ts
type ErrorCode =
  | 'VALIDATION_ERROR' | 'MODEL_UNAVAILABLE' | 'SEARCH_UNAVAILABLE'
  | 'RATE_LIMITED' | 'UPSTREAM_TIMEOUT' | 'AGENT_LIMIT_EXCEEDED'
  | 'REQUEST_ABORTED' | 'INTERNAL_ERROR';
```

Gone with the weather layer: `LOCATION_NOT_FOUND`, `LOCATION_AMBIGUOUS`, `PROVIDER_CONTRACT_ERROR`.

- **Search returning nothing is not an error** — it's a normal outcome the model must report ("I couldn't find current data for X"). In adapter B that's an empty-but-`ok` tool result. This rule is what prevents the model from filling the gap from training data.
- Route-level failures → JSON `{ error: { code, message, requestId } }`. Mid-stream → masked error part. No provider names, URLs, keys, or stack traces leave the server; full detail goes to logs under `requestId`, which is echoed to the client.

### Caching — mostly absent, deliberately

| Mode | Caching |
|---|---|
| `native` | **none.** The search happens inside the provider call; there is nothing of ours to cache, and caching whole LLM answers would serve stale weather. |
| `external` | `CachePort` memory TTL + single-flight on normalized search queries, short TTL from config. |

No LLM response cache in either mode — weather answers go stale in minutes, and caching them is a correctness bug dressed as an optimization.

### Rate limiting — now the primary cost control

There is no auth and every chat request may trigger paid searches, so these are the only real defenses:

- `express-rate-limit@7`, two buckets from config: tight on `/api/chat`, loose on the GET routes. Standard headers on. IP key via `trust proxy`; a client `x-session-id` may only tighten, never loosen.
- `bodyLimitBytes` + `AGENT_MAX_INPUT_CHARS` + `AGENT_HISTORY_WINDOW` (`pruneMessages`) — mandatory, because the client controls history size.
- `stopWhen: stepCountIs(maxSteps)` + `maxSearches` + `maxOutputTokens` + `totalTimeoutMs`/`stepTimeoutMs`.
- Pruning must preserve provider-required fields on tool parts (Anthropic's `encryptedContent`) — a naive prune breaks multi-turn search.

---

## 11. Key Interfaces & Contracts

```ts
// agent
export interface AgentDeps { modelResolver: ModelResolver; searchTools: SearchToolFactory;
                             config: AppConfig['ai']; logger: Logger; clock: Clock }
export interface AgentRequest { modelAlias?: string; locale: string; timezone?: string }
export function createWeatherAgent(deps: AgentDeps, req: AgentRequest): WeatherAgent;
export type WeatherAgent = ToolLoopAgent</* … */>;
export type WeatherUIMessage = InferAgentUIMessage<WeatherAgent, ChatMessageMetadata>;

// search
export interface SearchToolFactory { create(ctx: { providerId: string }): ToolSet }
export interface SearchClient { readonly id: string;
  search(q: { query: string; maxResults: number }, ctx: CallCtx): Promise<readonly SearchHit[]> }

// platform
export interface Logger { child(b: Record<string, unknown>): Logger; info(msg, meta?): void /* … */ }
export interface Metrics { increment(n, tags?): void; timing(n, ms, tags?): void }
export interface Clock { now(): Date }
export interface Cache { getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> }
```

### HTTP contracts (three endpoints)

```text
POST /api/chat
  body  { messages: UIMessage[], modelAlias?: string, locale?: string, timezone?: string }
  200   text/event-stream — UI message stream (text · search tool parts · source-url parts)
  4xx   { error: { code, message, requestId, fields? } }

GET /api/capabilities
  200   { models:[{alias,label,providerId}], search:{ mode, maxSearches },
          limits:{ maxSteps, maxInputChars }, suggestions:[…], features:{…} }

GET /healthz  → { status:'ok' }
GET /readyz   → { status, providers:{…}, search:{ mode, ok } }
```

`GET /api/weather` and `GET /api/geocode` are gone — there is no structured weather source to serve.

---

## 12. Dependency Changes

**Server, `SEARCH_MODE=native` (default): nothing new.** `ai@7`, `@ai-sdk/openai@4`, `@ai-sdk/anthropic@4`, `zod`, `express`, `cors`, `helmet`, `express-rate-limit`, `dotenv`, `vitest`, `tsx` are all installed and sufficient.

**Server, `SEARCH_MODE=external`:** one search package (Exa or Tavily from the registry, or a plain `fetch` client against their REST API — a `SearchClient` is ~40 lines, so a dependency is optional even here).

Deferred as before: `pino`+`pino-http` (phase 4), `supertest` (phase 4), `@opentelemetry/*` (phase 5). **Avoid `compression` on `/api/chat`.**

**Client:** shadcn components — `input`, `card`, `scroll-area`, `separator`, `badge`, `skeleton`, `tooltip`, `select`, `avatar`, plus `sonner` or `alert`. Fewer than before (no cards, no toggle-group, no dialog). Add `@tanstack/react-query-devtools` (dev). No markdown renderer until confirmed needed, and sanitized if added. `ai-elements` still deferred: this repo's shadcn `base-nova` + Base UI + `cn`-package setup makes a registry drop-in risky; trial it on the tool/search-status component only.

---

## 13. Trade-offs & Key Decisions

| # | Decision | Rejected | Reasoning |
|---|---|---|---|
| 1 | One tool (`web_search`), one `ToolLoopAgent` | 4 tools + weather API layer | The ask. Removes ~15 server modules, the whole weather domain, and 2 REST endpoints. Control structure collapses to `toolChoice:'auto'` + a step cap. |
| 2 | **Accept snippet-grade accuracy** | structured weather API | The honest cost of this scope: no guaranteed numbers, no forecast arrays, no unit conversion, freshness only as good as the indexed page. Mitigated by instructions that force citation + observation time and forbid unsourced numbers. **This is the main thing being traded away.** |
| 3 | Native provider-executed search as default | external search API first | Zero deps, zero extra keys, zero HTTP code, provider does the citing. |
| 4 | `SearchToolFactory` with a second (external) adapter | native only | Native is provider-specific in tool id, output shape, and behavior. Without adapter B, "provider-agnostic" and "offline-testable" would both be false. Cost: one small interface + two files. |
| 5 | **Normalize citations via `sendSources` / `source-url` parts** | parse each provider's tool output in React | OpenAI returns `{action, sources[]}`, Anthropic returns `web_search_result[]`. Source parts give one shape for both. Without this, the UI forks per provider. |
| 6 | Native tool **version ids in config** | hardcode `webSearch_20260318` | Anthropic ships dated tool versions; pinning in env means upgrading is a restart, not a code change. |
| 7 | Scope lock in instructions, not a classifier | pre-pass classifier | Free vs doubling per-request cost; rate limits already bound abuse. Classifier is a documented later option. |
| 8 | Inject date + timezone every request | rely on the model | Without it, "tomorrow" is undefined and searches target stale dates. Cheapest high-impact line in the prompt. |
| 9 | **No caching in native mode**; no LLM answer cache in either | cache answers | Cached weather answers are wrong answers. Search-result caching only exists where we own the search. |
| 10 | Empty search results are a reportable outcome, not an error | fall back to model knowledge | A confident un-sourced answer is the worst failure mode this product has. |
| 11 | TanStack Query keeps only `['capabilities']` | force it onto chat, or drop it | Honest small role, and it keeps model/suggestion lists out of client code. Never wrapped around a stream. |
| 12 | Fail-fast config, everything injected, no singletons | current `env.ts` silent defaults + import-time provider singleton | A typo'd prod var should refuse to boot; and `buildContainer(config)` is what makes the agent testable. |
| 13 | Delete `src/weather/**` | keep it unused "just in case" | Dead code that implies a data path the system no longer has. The previous plan documents it if it's ever wanted back. |
| 14 | Streaming prose + citations; no typed weather card in v1 | `Output` object extraction into a card | A typed card built by extracting numbers from snippets adds a hallucination surface. Offered as a phase-3 option with that caveat stated. |
| 15 | Rate limit + budgets are the only abuse control | auth | No auth in scope. So these must be real, not decorative — every paid search is reachable by an anonymous request. |

---

## 14. Implementation Phases

### Phase 0 — Foundation
1. `config/{config.schema,config,config.types}.ts` (fail fast); delete `config/env.ts`; commit `.env.example`.
2. `platform/`: `AppError` + `to-http`, `LoggerPort` + console adapter, `MetricsPort` + noop, `Clock`. (`CachePort` only if adapter B is planned.)
3. `container.ts`, `app.ts` (no `listen`), **`server.ts`** — fixes the missing entry point.
4. Edge middleware: request-id, helmet, CORS, body limit, access log, zod `validate`, error handler.
5. `GET /healthz`, `/readyz`.
6. **Delete `src/weather/**`.**
7. Vitest: config parse (valid/invalid), error mapping.

**Done when:** `pnpm dev` boots, `/healthz` answers, a bad env var refuses to boot with a readable message.

### Phase 1 — Agent + search + streaming
1. `provider-registry.ts`, `model-resolver.ts`, `model-middleware.ts`.
2. `search/`: `search-client.port.ts`, `native-search.tool.ts`, `search-tool.factory.ts` (+ `external-search.tool.ts` and `fake.client.ts` — the fake is worth building immediately for tests even if `native` is the runtime default).
3. `agent/instructions.ts` — scope lock, date/timezone/locale injection, query shaping, citation + no-unsourced-numbers rules; `policies.ts`; `agent.factory.ts`.
4. `POST /api/chat`: validate → prune (preserving provider tool fields) → resolve model → build agent → `pipeAgentUIStreamToResponse` with `sendSources: true`, abort wiring, masked `onError`, usage logging.
5. `GET /api/capabilities`.
6. Tests with `MockLanguageModelV4`: step cap, abort propagation, error masking, off-topic refusal, "no results → say so" behavior, and adapter-B search via `FakeSearchClient`.

**Done when:** `curl -N /api/chat` streams a cited weather answer; step cap, refusal, and abort are provably enforced.

### Phase 2 — Frontend
1. `app/providers.tsx`, real `layout.tsx` metadata, replace the placeholder `app/page.tsx`.
2. `lib/api/{http,endpoints}.ts`, `lib/queries/capabilities.query.ts`.
3. Add the shadcn components from §12.
4. `lib/chat/{transport,use-weather-chat}.ts` (sends locale + timezone); `components/chat/*` with an exhaustive `switch` over parts.
5. `sources-list.tsx` (from `source-url` parts) + `searching-indicator.tsx`.
6. Model picker and suggestion chips from `/api/capabilities`.
7. A11y/states: live region for streaming text, visible focus, keyboard-only flow, `prefers-reduced-motion`, empty/loading/error/aborted/refused states, mobile layout.

**Done when:** a weather question streams a cited answer with a visible search step; an off-topic question is politely refused; no hardcoded model or suggestion lists in the client.

### Phase 3 — Hardening
1. Rate-limit buckets from config; `trust proxy`; verify SSE isn't compressed/buffered.
2. `pino` behind `LoggerPort`; structured logs per request: searches, duration, tokens, model alias, requestId.
3. AI SDK `telemetry` (config-gated); metrics: searches/request, refusal rate, latency, error rate.
4. `supertest` tests incl. a rate-limit trip and an oversized-history rejection.
5. **Eval set** (~20 questions, run against `MockLanguageModelV4` + `FakeSearchClient`): current conditions, forecast, "umbrella?", ambiguous city, nonexistent city, no-results, off-topic refusal, prompt-injection attempt from search content.
6. Security pass: no secret in any response/log/URL; CORS locked; `readyz` leaks nothing; search content treated as **untrusted data** — instructions must state that page text cannot issue commands.

### Phase 4 — Optional extensions (each additive)
- `SEARCH_MODE=external` in production for cross-provider consistency + result caching.
- Typed weather summary via `Output` for a compact card, **only** if evals show extraction is reliable.
- Classifier pre-pass if off-topic traffic proves costly.
- Redis `CachePort`/`RateLimitPort` for multi-instance deploys.
- Superagent (registry) as an injection/PII guard if injection attempts show up in logs.
- Structured weather API tool — reintroducing the previous plan's layer *alongside* search, if accuracy complaints justify it. The `ToolSet` boundary makes that additive.

---

## Plan Ready for Approval

**What this designs:** `Next.js UI → useChat (stream) / TanStack Query (capabilities only) → Express → one ToolLoopAgent → one web_search tool → the open web`. Five layers, three endpoints, one tool.

**Load-bearing decisions:**

1. **One tool, one agent.** No weather API, no geocoding, no units domain, no provider fallback. `src/weather/**` is deleted. Control is `toolChoice:'auto'` + `stepCountIs(maxSteps)` — `prepareStep`/`activeTools`/agent registries were justified by four tools, not one.
2. **Native provider-executed search is the default** (`openai.tools.webSearch`, `anthropic.tools.webSearch_*`, both verified present in the installed packages) — zero new dependencies and no second API key.
3. **`sendSources: true` + `source-url` parts normalize citations**, so one UI serves both providers despite their different native tool output shapes. Without this the client would fork per provider.
4. **A second `external` search adapter** behind `SearchToolFactory` + `SearchClient` (Exa/Tavily/fake) keeps the two stated goals true — provider-agnostic behavior and offline-deterministic tests. One env var switches modes; agent, routes, and UI don't change.
5. **Prompt + budgets are the architecture now:** weather-only scope lock, injected date/timezone/locale, forced citations, and a hard rule that missing search results are reported — never filled in from model knowledge.
6. **Native web-search tool version ids live in config**, because Anthropic ships dated identifiers and those must not be hardcoded.
7. **No caching in native mode**, and no LLM answer cache anywhere — cached weather is wrong weather. Rate limits + step/search/token/size budgets are the real controls, since there is no auth.

**What this gives up, plainly:** snippet-grade accuracy. No guaranteed numbers, no forecast arrays, no unit conversion, freshness bounded by what search has indexed. Mitigated by citation rules, not eliminated. If that proves unacceptable, phase 4 adds a structured weather tool alongside search without touching the agent.

**Dependencies:** none for the default mode. Client adds ~9 shadcn components + Query devtools.

**Phasing:** 0 foundation (+ delete weather layer) → 1 agent + search + streaming → 2 frontend → 3 hardening + evals → 4 optional extensions.

**Nothing has been modified or installed.** Awaiting approval before implementing.
