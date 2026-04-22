export type ReminderState = 'pending' | 'sent' | 'overdue' | 'cancelled';
export type CompatReminderRecord = {
    id: string;
    invoiceId: string;
    status: ReminderState;
    reminderLevel?: number;
    feeAmount?: number;
    message?: string;
    createdAt: string;
    updatedAt?: string;
};
/**
 * Create a reminder row. New rows default to `pending` unless body.status is a valid explicit initial state.
 */
export declare function createReminderFromBody(body: Record<string, unknown>): Promise<CompatReminderRecord>;
/**
 * Apply a state transition and optional field patches. All status changes must satisfy the state machine.
 */
export declare function transitionReminder(id: string, body: Record<string, unknown>): Promise<CompatReminderRecord>;
export declare function deleteReminderRecord(id: string): Promise<void>;
//# sourceMappingURL=reminderDomainService.d.ts.map