"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireIdempotencyKey = requireIdempotencyKey;
exports.withPaymentIdempotency = withPaymentIdempotency;
/**
 * Idempotency for mutating API calls (compat payments).
 * - `requireIdempotencyKey` enforces presence for payment POST.
 * - `withPaymentIdempotency` replays the same successful result for the same key within TTL (fail-safe against double charge).
 */
const replay = new Map();
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
function prune(now, ttlMs) {
    for (const [k, v] of replay) {
        if (now - v.at > ttlMs)
            replay.delete(k);
    }
}
/** @throws Error when header missing or blank */
function requireIdempotencyKey(key) {
    if (key == null || typeof key !== 'string' || key.trim() === '') {
        throw new Error('Idempotency-Key header is required');
    }
    return key.trim();
}
/**
 * Runs `mutate` once per key within TTL; subsequent calls return the cached result (same JSON body as first success).
 */
async function withPaymentIdempotency(key, mutate, ttlMs = DEFAULT_TTL_MS) {
    const now = Date.now();
    prune(now, ttlMs);
    const hit = replay.get(key);
    if (hit && now - hit.at <= ttlMs) {
        return hit.result;
    }
    const result = await mutate();
    replay.set(key, { at: Date.now(), result: result });
    return result;
}
//# sourceMappingURL=idempotencyService.js.map