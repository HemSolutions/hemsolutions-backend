import type { QueuedJob } from './jobTypes';
export declare function executeJob(job: QueuedJob): Promise<void>;
