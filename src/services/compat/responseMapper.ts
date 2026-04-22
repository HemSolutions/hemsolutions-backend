import type { Response } from 'express';

/**
 * Single choke-point for `/api/compat` JSON bodies.
 * Ensures Dates (and other non-JSON values) serialize like PHP-facing clients expect.
 */
export function serializeCompatValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (Array.isArray(value)) {
    return value.map(serializeCompatValue);
  }
  if (value !== null && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serializeCompatValue(v)])
    );
  }
  return value;
}

/**
 * All compat controllers should send JSON only through this helper (directly or via `compatHttp.compatJson`).
 * Domain mappers are responsible for exact PHP field names; this layer handles serialization only.
 */
export function sendCompatResponse(res: Response, body: unknown, status = 200): void {
  res.status(status).type('application/json').json(serializeCompatValue(body));
}
