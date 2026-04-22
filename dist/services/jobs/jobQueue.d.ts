import type { JobPayload } from './jobTypes';
export declare function enqueueJob(job: JobPayload): string;
/**
 * Enqueue then block until the job finishes (memory queue only — used for compat SMS API contract).
 */
export declare function enqueueAndAwait(job: JobPayload, timeoutMs?: number): Promise<void>;
export declare function startBackgroundJobWorker(): void;
export declare function drainJobsForTests(max?: number): Promise<void>;
//# sourceMappingURL=jobQueue.d.ts.map