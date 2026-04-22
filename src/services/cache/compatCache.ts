import { getCache, setCache, invalidatePattern } from './redisCache';
import { logger } from '../../utils/logger';

const PREFIX = 'compat:v1:';

export const compatCachePatterns = {
  customers: `${PREFIX}customers:*`,
  bookings: `${PREFIX}bookings:*`,
  invoices: `${PREFIX}invoices:*`,
  dashboard: `${PREFIX}dashboard:*`,
} as const;

function ttlSec(kind: 'short' | 'medium' | 'long'): number {
  if (kind === 'short') return 30;
  if (kind === 'medium') return 60;
  return 120;
}

export async function compatGetJson<T>(key: string, kind: 'short' | 'medium' | 'long'): Promise<T | null> {
  try {
    const raw = await getCache(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (e) {
    logger.warn('compat cache get parse', e);
    return null;
  }
}

export async function compatSetJson(key: string, value: unknown, kind: 'short' | 'medium' | 'long'): Promise<void> {
  try {
    await setCache(key, JSON.stringify(value), ttlSec(kind));
  } catch (e) {
    logger.warn('compat cache set', e);
  }
}

export async function invalidateCompatCustomers(): Promise<void> {
  await invalidatePattern(`${PREFIX}customers:*`);
}

export async function invalidateCompatBookings(): Promise<void> {
  await invalidatePattern(`${PREFIX}bookings:*`);
}

export async function invalidateCompatInvoices(): Promise<void> {
  await invalidatePattern(`${PREFIX}invoices:*`);
}

export async function invalidateCompatDashboard(): Promise<void> {
  await invalidatePattern(`${PREFIX}dashboard:*`);
}

export function compatCacheKey(segment: string, query: Record<string, unknown>): string {
  const stable = JSON.stringify(query);
  return `${PREFIX}${segment}:${Buffer.from(stable).toString('base64url')}`;
}
