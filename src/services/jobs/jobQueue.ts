import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import type { JobPayload, QueuedJob } from './jobTypes';
import { executeJob } from './jobHandlers';

const REDIS_KEY = 'hemsolutions:jobs:v1';
const MAX_ATTEMPTS = 3;

const memoryQueue: QueuedJob[] = [];
let redisJobs: Redis | null = null;

const completionWaiters = new Map<
  string,
  { resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
>();

function getRedisJobs(): Redis | null {
  if (process.env.REDIS_DISABLED === '1' || process.env.JOBS_REDIS_DISABLED === '1') return null;
  const url = process.env.REDIS_URL ?? config.redis.url;
  if (!url) return null;
  try {
    if (!redisJobs) {
      redisJobs = new Redis(url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
    }
    return redisJobs;
  } catch {
    return null;
  }
}

function notifyCompletion(jobId: string, ok: boolean, err?: Error): void {
  const w = completionWaiters.get(jobId);
  if (!w) return;
  clearTimeout(w.timer);
  completionWaiters.delete(jobId);
  if (ok) w.resolve();
  else w.reject(err ?? new Error('Job failed'));
}

export function enqueueJob(job: JobPayload): string {
  const id = randomUUID();
  const qj: QueuedJob = { ...job, id, attempts: 0 } as QueuedJob;
  const r = getRedisJobs();
  if (r) {
    r.lpush(REDIS_KEY, JSON.stringify(qj)).catch(() => memoryQueue.push(qj));
  } else {
    memoryQueue.push(qj);
  }
  return id;
}

/**
 * Enqueue then block until the job finishes (memory queue only — used for compat SMS API contract).
 */
export async function enqueueAndAwait(job: JobPayload, timeoutMs = 15_000): Promise<void> {
  const id = randomUUID();
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      completionWaiters.delete(id);
      reject(new Error('Job wait timeout'));
    }, timeoutMs);
    completionWaiters.set(id, { resolve: () => resolve(), reject, timer });
  });
  const qj: QueuedJob = { ...job, id, attempts: 0 } as QueuedJob;
  memoryQueue.push(qj);
  await done;
}

async function runOne(job: QueuedJob): Promise<void> {
  try {
    await executeJob(job);
    notifyCompletion(job.id, true);
  } catch (e) {
    job.attempts += 1;
    if (job.attempts < MAX_ATTEMPTS) {
      logger.warn(`Job retry ${job.attempts}/${MAX_ATTEMPTS}`, { type: job.type, id: job.id });
      memoryQueue.push(job);
      return;
    }
    logger.error('Job failed permanently', e);
    notifyCompletion(job.id, false, e instanceof Error ? e : new Error(String(e)));
  }
}

async function popFromRedis(): Promise<QueuedJob | null> {
  const r = getRedisJobs();
  if (!r) return null;
  try {
    await r.connect().catch(() => undefined);
    const raw = await r.rpop(REDIS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as QueuedJob;
  } catch {
    return null;
  }
}

let workerStarted = false;

export function startBackgroundJobWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  setInterval(() => {
    void (async () => {
      const job = memoryQueue.shift() ?? (await popFromRedis());
      if (!job) return;
      await runOne(job);
    })();
  }, 200);
}

export async function drainJobsForTests(max = 50): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    const job = memoryQueue.shift() ?? (await popFromRedis());
    if (!job) return;
    await runOne(job);
  }
}
