import { describe, expect, it } from "vitest";
import type { RateLimitConfig } from "../../config/config.types.js";
import {
  addressKey,
  addressLimiterOptions,
  createRateLimiters,
  sessionId,
  sessionLimiterOptions,
  sessionScopedKey,
  type KeyableRequest,
} from "./rate-limit.js";

const config: RateLimitConfig = {
  chat: { windowMs: 60000, max: 20 },
  read: { windowMs: 30000, max: 120 },
};

function request(options: {
  ip?: string;
  remoteAddress?: string;
  headers?: Readonly<Record<string, string>>;
}): KeyableRequest {
  const headers = options.headers ?? {};
  return {
    ip: options.ip,
    socket: { remoteAddress: options.remoteAddress },
    header: (name: string): string | undefined => headers[name.toLowerCase()],
  };
}

describe("rate limit configuration", () => {
  it("takes each bucket's window and maximum from config", () => {
    const chat = addressLimiterOptions(config.chat);
    const read = addressLimiterOptions(config.read);

    expect(chat.windowMs).toBe(config.chat.windowMs);
    expect(chat.limit).toBe(config.chat.max);
    expect(read.windowMs).toBe(config.read.windowMs);
    expect(read.limit).toBe(config.read.max);
  });

  it("keeps the chat bucket tighter than the read bucket", () => {
    expect(config.chat.max).toBeLessThan(config.read.max);
  });

  it("publishes the standard headers from the authoritative limiter only", () => {
    expect(addressLimiterOptions(config.chat).standardHeaders).toBe("draft-7");
    expect(addressLimiterOptions(config.chat).legacyHeaders).toBe(false);
    expect(sessionLimiterOptions(config.chat).standardHeaders).toBe(false);
  });

  it("builds two limiters per bucket", () => {
    const limiters = createRateLimiters(config);

    expect(limiters.chat).toHaveLength(2);
    expect(limiters.read).toHaveLength(2);
    for (const limiter of [...limiters.chat, ...limiters.read]) {
      expect(typeof limiter).toBe("function");
    }
  });
});

describe("rate limit keys", () => {
  it("keys on the client address", () => {
    expect(addressKey(request({ ip: "203.0.113.7" }))).toBe("addr:203.0.113.7");
  });

  it("falls back to the socket address, then to a constant", () => {
    expect(addressKey(request({ remoteAddress: "198.51.100.2" }))).toBe("addr:198.51.100.2");
    expect(addressKey(request({}))).toBe("addr:unknown");
  });

  it("ignores the session header when keying on the address", () => {
    const headers = { "x-session-id": "session-abcdef" };
    expect(addressKey(request({ ip: "203.0.113.7", headers }))).toBe(
      addressKey(request({ ip: "203.0.113.7" })),
    );
  });

  it("cannot be loosened by rotating the session header", () => {
    const first = request({ ip: "203.0.113.7", headers: { "x-session-id": "session-000001" } });
    const second = request({ ip: "203.0.113.7", headers: { "x-session-id": "session-999999" } });

    // The authoritative key is identical, so both requests share one quota...
    expect(addressKey(first)).toBe(addressKey(second));
    // ...while the narrower key still contains the address.
    expect(sessionScopedKey(first)).not.toBe(sessionScopedKey(second));
    expect(sessionScopedKey(first).startsWith(addressKey(first))).toBe(true);
    expect(sessionScopedKey(second).startsWith(addressKey(second))).toBe(true);
  });

  it("only accepts a sane session id", () => {
    expect(sessionId(request({ headers: { "x-session-id": "session-abcdef" } }))).toBe(
      "session-abcdef",
    );
    expect(sessionId(request({ headers: { "x-session-id": "short" } }))).toBeUndefined();
    expect(sessionId(request({ headers: { "x-session-id": "a".repeat(200) } }))).toBeUndefined();
    expect(sessionId(request({ headers: { "x-session-id": "has space" } }))).toBeUndefined();
    expect(sessionId(request({}))).toBeUndefined();
  });

  it("skips the narrower limiter when no session id is supplied", () => {
    const skip = sessionLimiterOptions(config.chat).skip;
    expect(skip).toBeTypeOf("function");
  });

  it("collapses a missing session id into one bucket rather than a fresh one", () => {
    expect(sessionScopedKey(request({ ip: "203.0.113.7" }))).toBe("addr:203.0.113.7|session:none");
  });
});
