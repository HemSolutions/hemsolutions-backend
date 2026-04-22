"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeCompatValue = serializeCompatValue;
exports.sendCompatResponse = sendCompatResponse;
/**
 * Single choke-point for `/api/compat` JSON bodies.
 * Ensures Dates (and other non-JSON values) serialize like PHP-facing clients expect.
 */
function serializeCompatValue(value) {
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
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeCompatValue(v)]));
    }
    return value;
}
/**
 * All compat controllers should send JSON only through this helper (directly or via `compatHttp.compatJson`).
 * Domain mappers are responsible for exact PHP field names; this layer handles serialization only.
 */
function sendCompatResponse(res, body, status = 200) {
    res.status(status).type('application/json').json(serializeCompatValue(body));
}
//# sourceMappingURL=responseMapper.js.map