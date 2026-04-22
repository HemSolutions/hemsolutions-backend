export interface Cache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
}

class MemoryCache implements Cache {
  private readonly store = new Map<string, { value: unknown; expiresAt?: number }>();

  async get(key: string): Promise<unknown> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt && hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const expiresAt = ttl ? Date.now() + ttl * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }
}

export const cache: Cache = new MemoryCache();
export const cacheStatus = 'memory';
