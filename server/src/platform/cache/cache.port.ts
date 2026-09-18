export interface CachePort {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  size(): number;
}
