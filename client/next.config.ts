import type { NextConfig } from "next";

/**
 * The client talks to the agent API directly, using the origin configured in
 * `NEXT_PUBLIC_API_BASE_URL` (see `lib/api/http.ts`).
 *
 * There is deliberately no dev rewrite/proxy: routing `POST /api/chat` through
 * Next would put an extra buffering hop between the agent's `text/event-stream`
 * response and `useChat`, and it would reintroduce a hardcoded origin here.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
