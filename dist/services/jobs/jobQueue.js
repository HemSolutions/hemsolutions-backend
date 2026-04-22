"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueJob = enqueueJob;
exports.enqueueAndAwait = enqueueAndAwait;
exports.startBackgroundJobWorker = startBackgroundJobWorker;
exports.drainJobsForTests = drainJobsForTests;
const crypto_1 = require("crypto");
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../../config");
const logger_1 = require("../../utils/logger");
const jobHandlers_1 = require("./jobHandlers");
const REDIS_KEY = 'hemsolutions:jobs:v1';
const MAX_ATTEMPTS = 3;
const memoryQueue = [];
let redisJobs = null;
const completionWaiters = new Map();
function getRedisJobs() {
    if (process.env.REDIS_DISABLED === '1' || process.env.JOBS_REDIS_DISABLED === '1')
        return null;
    const url = process.env.REDIS_URL ?? config_1.config.redis.url;
    if (!url)
        return null;
    try {
        if (!redisJobs) {
            redisJobs = new ioredis_1.default(url, {
                maxRetriesPerRequest: 1,
                lazyConnect: true,
                enableOfflineQueue: false,
            });
        }
        return redisJobs;
    }
    catch {
        return null;
    }
}
function notifyCompletion(jobId, ok, err) {
    const w = completionWaiters.get(jobId);
    if (!w)
        return;
    clearTimeout(w.timer);
    completionWaiters.delete(jobId);
    if (ok)
        w.resolve();
    else
        w.reject(err ?? new Error('Job failed'));
}
function enqueueJob(job) {
    const id = (0, crypto_1.randomUUID)();
    const qj = { ...job, id, attempts: 0 };
    const r = getRedisJobs();
    if (r) {
        r.lpush(REDIS_KEY, JSON.stringify(qj)).catch(() => memoryQueue.push(qj));
    }
    else {
        memoryQueue.push(qj);
    }
    return id;
}
/**
 * Enqueue then block until the job finishes (memory queue only — used for compat SMS API contract).
 */
async function enqueueAndAwait(job, timeoutMs = 15_000) {
    const id = (0, crypto_1.randomUUID)();
    const done = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            completionWaiters.delete(id);
            reject(new Error('Job wait timeout'));
        }, timeoutMs);
        completionWaiters.set(id, { resolve: () => resolve(), reject, timer });
    });
    const qj = { ...job, id, attempts: 0 };
    memoryQueue.push(qj);
    await done;
}
async function runOne(job) {
    try {
        await (0, jobHandlers_1.executeJob)(job);
        notifyCompletion(job.id, true);
    }
    catch (e) {
        job.attempts += 1;
        if (job.attempts < MAX_ATTEMPTS) {
            logger_1.logger.warn(`Job retry ${job.attempts}/${MAX_ATTEMPTS}`, { type: job.type, id: job.id });
            memoryQueue.push(job);
            return;
        }
        logger_1.logger.error('Job failed permanently', e);
        notifyCompletion(job.id, false, e instanceof Error ? e : new Error(String(e)));
    }
}
async function popFromRedis() {
    const r = getRedisJobs();
    if (!r)
        return null;
    try {
        await r.connect().catch(() => undefined);
        const raw = await r.rpop(REDIS_KEY);
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
let workerStarted = false;
function startBackgroundJobWorker() {
    if (workerStarted)
        return;
    workerStarted = true;
    setInterval(() => {
        void (async () => {
            const job = memoryQueue.shift() ?? (await popFromRedis());
            if (!job)
                return;
            await runOne(job);
        })();
    }, 200);
}
async function drainJobsForTests(max = 50) {
    for (let i = 0; i < max; i += 1) {
        const job = memoryQueue.shift() ?? (await popFromRedis());
        if (!job)
            return;
        await runOne(job);
    }
}
//# sourceMappingURL=jobQueue.js.map