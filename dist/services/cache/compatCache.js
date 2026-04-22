"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compatCachePatterns = void 0;
exports.compatGetJson = compatGetJson;
exports.compatSetJson = compatSetJson;
exports.invalidateCompatCustomers = invalidateCompatCustomers;
exports.invalidateCompatBookings = invalidateCompatBookings;
exports.invalidateCompatInvoices = invalidateCompatInvoices;
exports.invalidateCompatDashboard = invalidateCompatDashboard;
exports.compatCacheKey = compatCacheKey;
const redisCache_1 = require("./redisCache");
const logger_1 = require("../../utils/logger");
const PREFIX = 'compat:v1:';
exports.compatCachePatterns = {
    customers: `${PREFIX}customers:*`,
    bookings: `${PREFIX}bookings:*`,
    invoices: `${PREFIX}invoices:*`,
    dashboard: `${PREFIX}dashboard:*`,
};
function ttlSec(kind) {
    if (kind === 'short')
        return 30;
    if (kind === 'medium')
        return 60;
    return 120;
}
async function compatGetJson(key, kind) {
    try {
        const raw = await (0, redisCache_1.getCache)(key);
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch (e) {
        logger_1.logger.warn('compat cache get parse', e);
        return null;
    }
}
async function compatSetJson(key, value, kind) {
    try {
        await (0, redisCache_1.setCache)(key, JSON.stringify(value), ttlSec(kind));
    }
    catch (e) {
        logger_1.logger.warn('compat cache set', e);
    }
}
async function invalidateCompatCustomers() {
    await (0, redisCache_1.invalidatePattern)(`${PREFIX}customers:*`);
}
async function invalidateCompatBookings() {
    await (0, redisCache_1.invalidatePattern)(`${PREFIX}bookings:*`);
}
async function invalidateCompatInvoices() {
    await (0, redisCache_1.invalidatePattern)(`${PREFIX}invoices:*`);
}
async function invalidateCompatDashboard() {
    await (0, redisCache_1.invalidatePattern)(`${PREFIX}dashboard:*`);
}
function compatCacheKey(segment, query) {
    const stable = JSON.stringify(query);
    return `${PREFIX}${segment}:${Buffer.from(stable).toString('base64url')}`;
}
//# sourceMappingURL=compatCache.js.map