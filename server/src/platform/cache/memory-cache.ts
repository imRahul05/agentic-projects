import { Clock, SystemClock } from "../clock.js";
import { CachePort } from "./cache.port.js";

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
  accessedAt: number;
}

export class MemoryCache implements CachePort {
  private readonly store: Map<string, CacheEntry<object | string | number | boolean>> = new Map();
  private readonly inFlight: Map<string, Promise<object | string | number | boolean>> = new Map();

  constructor(
    private readonly maxEntries: number = 500,
    private readonly clock: Clock = new SystemClock(),
    private readonly enabled: boolean = true
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.enabled) {
      return undefined;
    }

    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    const now = this.clock.timestampMs();
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return undefined;
    }

    entry.accessedAt = now;
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (!this.enabled || ttlMs <= 0) {
      return;
    }

    const now = this.clock.timestampMs();
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      this.evictOldest();
    }

    this.store.set(key, {
      value: value as object | string | number | boolean,
      expiresAt: now + ttlMs,
      accessedAt: now,
    });
  }

  async getOrLoad<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>
  ): Promise<T> {
    if (!this.enabled) {
      return load();
    }

    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const running = this.inFlight.get(key);
    if (running) {
      return running as Promise<T>;
    }

    const promise = (async (): Promise<object | string | number | boolean> => {
      try {
        const result = await load();
        await this.set(key, result, ttlMs);
        return result as object | string | number | boolean;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise as Promise<T>;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
    this.inFlight.clear();
  }

  size(): number {
    return this.store.size;
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestAccess = Number.MAX_SAFE_INTEGER;

    for (const [k, entry] of this.store.entries()) {
      if (entry.accessedAt < oldestAccess) {
        oldestAccess = entry.accessedAt;
        oldestKey = k;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }
}
