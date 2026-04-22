import type { SmsJobPayload } from '../jobs/jobTypes';
type SmsLogEntry = {
    id: string;
    to: string;
    message: string;
    status: 'sent' | 'failed' | 'simulated';
    provider: string;
    external_id?: string;
    error?: string;
    target_user_id?: string;
    created_at: string;
};
/** SMS side-effects executed only from the job worker (not from HTTP controllers). */
export declare function processCompatSmsSend(payload: SmsJobPayload): Promise<void>;
export declare function readLatestSmsEntryForResponse(to: string, message: string): Promise<SmsLogEntry | null>;
export {};
//# sourceMappingURL=compatSmsJobRunner.d.ts.map