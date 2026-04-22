import type { NotificationType } from '@prisma/client';
export type NotificationJobPayload = {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
};
export type EmailJobPayload = {
    to: string;
    subject: string;
    text?: string;
    html: string;
};
export type SmsJobPayload = {
    to: string;
    message: string;
    targetUserId?: string;
    rawTo: string;
};
export type InvoiceEmailJobPayload = {
    userId: string;
    invoiceId: string;
    subject?: string;
};
export type ReminderJobPayload = {
    reminderId: string;
    invoiceId: string;
    channel?: string;
};
export type JobPayload = {
    type: 'SEND_NOTIFICATION';
    payload: NotificationJobPayload;
} | {
    type: 'SEND_EMAIL';
    payload: EmailJobPayload;
} | {
    type: 'SEND_SMS';
    payload: SmsJobPayload;
} | {
    type: 'SEND_INVOICE_EMAIL';
    payload: InvoiceEmailJobPayload;
} | {
    type: 'SEND_REMINDER';
    payload: ReminderJobPayload;
};
export type QueuedJob = JobPayload & {
    attempts: number;
    id: string;
};
