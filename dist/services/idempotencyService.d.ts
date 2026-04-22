/** @throws Error when header missing or blank */
export declare function requireIdempotencyKey(key: string | undefined): string;
/**
 * Runs `mutate` once per key within TTL; subsequent calls return the cached result (same JSON body as first success).
 */
export declare function withPaymentIdempotency<T>(key: string, mutate: () => Promise<T>, ttlMs?: number): Promise<T>;
//# sourceMappingURL=idempotencyService.d.ts.map