import { describe, expect, it } from "vitest";
import { MemoryCache } from "./memory-cache.js";
import { Clock } from "../clock.js";

class FakeClock implements Clock {
  constructor(private timeMs: number = 1000) {}

  now(): Date {
    return new Date(this.timeMs);
  }

  nowIso(): string {
    return new Date(this.timeMs).toISOString();
  }

  timestampMs(): number {
    return this.timeMs;
  }

  advance(ms: number): void {
    this.timeMs += ms;
  }
}

describe("MemoryCache", () => {
  it("stores and retrieves cached values within TTL", async () => {
    const clock = new FakeClock();
    const cache = new MemoryCache(10, clock, true);

    await cache.set("key1", { temp: 20 }, 1000);
    const cached = await cache.get<{ temp: number }>("key1");
    expect(cached).toEqual({ temp: 20 });

    // Advance clock past TTL
    clock.advance(1500);
    const expired = await cache.get<{ temp: number }>("key1");
    expect(expired).toBeUndefined();
  });

  it("evicts oldest entries when maxEntries is exceeded", async () => {
    const clock = new FakeClock();
    const cache = new MemoryCache(2, clock, true);

    await cache.set("k1", "val1", 5000);
    clock.advance(10);
    await cache.set("k2", "val2", 5000);
    clock.advance(10);
    await cache.set("k3", "val3", 5000);

    expect(await cache.get("k1")).toBeUndefined();
    expect(await cache.get("k2")).toBe("val2");
    expect(await cache.get("k3")).toBe("val3");
  });

  it("deduplicates concurrent calls using single-flight getOrLoad", async () => {
    const clock = new FakeClock();
    const cache = new MemoryCache(10, clock, true);
    let counter = 0;

    const loader = async () => {
      counter++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return `result-${counter}`;
    };

    const [r1, r2, r3] = await Promise.all([
      cache.getOrLoad("single-flight-key", 5000, loader),
      cache.getOrLoad("single-flight-key", 5000, loader),
      cache.getOrLoad("single-flight-key", 5000, loader),
    ]);

    expect(r1).toBe("result-1");
    expect(r2).toBe("result-1");
    expect(r3).toBe("result-1");
    expect(counter).toBe(1);
  });
});
