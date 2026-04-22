"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCache = getCache;
exports.setCache = setCache;
exports.invalidatePattern = invalidatePattern;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../../config");
const logger_1 = require("../../utils/logger");
let client = null;
let disabled = false;
function getClient() {
    if (disabled)
        return null;
    if (client)
        return client;
    const url = process.env.REDIS_URL ?? config_1.config.redis.url;
    if (process.env.REDIS_DISABLED === '1' || !url) {
        disabled = true;
        return null;
    }
    try {
        const c = new ioredis_1.default(url, {
            maxRetriesPerRequest: 1,
            lazyConnect: true,
            enableOfflineQueue: false,
        });
        c.on('error', (e) => {
            logger_1.logger.warn('Redis error; cache disabled until restart', e);
        });
        client = c;
        return c;
    }
    catch (e) {
        logger_1.logger.warn('Redis init failed; using in-memory cache only', e);
        disabled = true;
        return null;
    }
}
const memory = new Map();
function memGet(key) {
    const row = memory.get(key);
    if (!row)
        return null;
    if (Date.now() > row.exp) {
        memory.delete(key);
        return null;
    }
    return row.v;
}
function memSet(key, value, ttlSec) {
    memory.set(key, { v: value, exp: Date.now() + ttlSec * 1000 });
}
function memInvalidatePrefix(prefix) {
    for (const k of memory.keys()) {
        if (k.startsWith(prefix))
            memory.delete(k);
    }
}
async function getCache(key) {
    const c = getClient();
    if (!c)
        return memGet(key);
    try {
        await c.connect().catch(() => undefined);
        return c.get(key);
    }
    catch {
        return memGet(key);
    }
}
async function setCache(key, value, ttlSec) {
    const c = getClient();
    if (!c) {
        memSet(key, value, ttlSec);
        return;
    }
    try {
        await c.connect().catch(() => undefined);
        await c.set(key, value, 'EX', ttlSec);
    }
    catch {
        memSet(key, value, ttlSec);
    }
}
async function invalidatePattern(pattern) {
    memInvalidatePrefix(pattern.replace(/\*$/, ''));
    const c = getClient();
    if (!c)
        return;
    try {
        await c.connect().catch(() => undefined);
        let cursor = '0';
        do {
            const [next, keys] = await c.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = next;
            if (keys.length)
                await c.del(...keys);
        } while (cursor !== '0');
    }
    catch {
        /* noop */
    }
}
//# sourceMappingURL=redisCache.js.map