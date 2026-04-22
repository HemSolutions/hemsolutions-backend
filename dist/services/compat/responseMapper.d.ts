import type { Response } from 'express';
/**
 * Single choke-point for `/api/compat` JSON bodies.
 * Ensures Dates (and other non-JSON values) serialize like PHP-facing clients expect.
 */
export declare function serializeCompatValue(value: unknown): unknown;
/**
 * All compat controllers should send JSON only through this helper (directly or via `compatHttp.compatJson`).
 * Domain mappers are responsible for exact PHP field names; this layer handles serialization only.
 */
export declare function sendCompatResponse(res: Response, body: unknown, status?: number): void;
//# sourceMappingURL=responseMapper.d.ts.map