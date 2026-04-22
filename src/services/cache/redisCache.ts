import Redis from 'ioredis';
import { config } from '../../config';
import { logger } from '../../utils/logger';

let client: Redis | null = null;
let disabled = false;

function getClient(): Redis | null {
  if (disabled) return null;
  if (client) return client;
  const url = process.env.REDIS_URL ?? config.redis.url;
  if (process.env.REDIS_DISABLED === '1' || !url) {
    disabled = true;
    return null;
  }
  try {
    const c = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    c.on('error', (e) => {
      logger.warn('Redis error; cache disabled until restart', e);
    });
    client = c;
    return c;
  } catch (e) {
    logger.warn('Redis init failed; using in-memory cache only', e);
    disabled = true;
    return null;
  }
}

const memory = new Map<string, { v: string; exp: number }>();

function memGet(key: string): string | null {
  const row = memory.get(key);
  if (!row) return null;
  if (Date.now() > row.exp) {
    memory.delete(key);
    return null;
  }
  return row.v;
}

function memSet(key: string, value: string, ttlSec: number): void {
  memory.set(key, { v: value, exp: Date.now() + ttlSec * 1000 });
}

function memInvalidatePrefix(prefix: string): void {
  for (const k of memory.keys()) {
    if (k.startsWith(prefix)) memory.delete(k);
  }
}

export async function getCache(key: string): Promise<string | null> {
  const c = getClient();
  if (!c) return memGet(key);
  try {
    await c.connect().catch(() => undefined);
    return c.get(key);
  } catch {
    return memGet(key);
  }
}

export async function setCache(key: string, value: string, ttlSec: number): Promise<void> {
  const c = getClient();
  if (!c) {
    memSet(key, value, ttlSec);
    return;
  }
  try {
    await c.connect().catch(() => undefined);
    await c.set(key, value, 'EX', ttlSec);
  } catch {
    memSet(key, value, ttlSec);
  }
}

export async function invalidatePattern(pattern: string): Promise<void> {
  memInvalidatePrefix(pattern.replace(/\*$/, ''));
  const c = getClient();
  if (!c) return;
  try {
    await c.connect().catch(() => undefined);
    let cursor = '0';
    do {
      const [next, keys] = await c.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length) await c.del(...keys);
    } while (cursor !== '0');
  } catch {
    /* noop */
  }
}
