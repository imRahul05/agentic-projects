# Weather Agent — client

Next.js 16 (App Router) chat UI for the weather agent. One page, one stream, one
cached query.

## Setup

```bash
cp .env.example .env.local   # then point NEXT_PUBLIC_API_BASE_URL at the API
pnpm install
pnpm dev
```

`NEXT_PUBLIC_API_BASE_URL` is required and has no fallback — the app surfaces a
configuration error rather than guessing an origin. It is inlined at build time,
so a change needs a rebuild.

Start the Express API in `../server` first; the client calls it directly (no dev
proxy, so the SSE stream is not buffered by Next).

## Layout

| Path | Role |
| --- | --- |
| `app/` | Server shell: metadata, fonts, theme bootstrap, `Providers`. |
| `components/chat/` | The whole chat experience. `chat-panel.tsx` is the one client boundary. |
| `components/ui/` | shadcn `base-nova` primitives on Base UI. |
| `lib/api/` | `http.ts` (typed fetch + `ApiError`), `endpoints.ts` (every path). |
| `lib/chat/` | `useChat` transport and the `useWeatherChat` hook. |
| `lib/contracts/` | Client mirrors of the server's message and capabilities shapes. |
| `lib/queries/` | TanStack Query — capabilities only. The stream is owned by `useChat`. |

## Conventions

- Tailwind v4, CSS-first. Tokens live in `app/globals.css`; there is no
  `tailwind.config`.
- `cn` comes from the `cn` package, variants from `class-variance-authority`.
- Imports use the `@/*` alias and carry no file extension.
- Nothing in the UI hardcodes a model name, a suggested prompt, a limit or an
  origin — all of it comes from `/api/capabilities` or the environment.

## Checks

```bash
npx tsc --noEmit
npx next build
npx eslint .
```
