import type { Booking, Message, Service, Worker } from '@prisma/client';
import { NotificationType } from '@prisma/client';
/**
 * Maps booking lifecycle status to a Prisma notification enum value.
 */
export declare function notificationTypeForBookingStatus(status: string): NotificationType;
/** Booking placed / confirmed — customer-facing confirmation. */
export declare function afterBookingCreated(params: {
    userId: string;
    bookingId: string;
    service: Service;
    scheduledDate: string;
    scheduledTime: string;
}): Promise<void>;
export declare function afterBookingCancelled(params: {
    userId: string;
    booking: Booking & {
        service?: Service | null;
    };
}): Promise<void>;
/** Worker assignment — surfaced as a system announcement to the customer. */
export declare function afterWorkerAssigned(params: {
    userId: string;
    bookingId: string;
    worker: Worker;
    serviceName: string;
}): Promise<void>;
/**
 * Booking status transitions (COMPLETED, CONFIRMED, etc.).
 * Pass `notificationType` to preserve exact behaviour from callers; otherwise it is derived from `status`.
 */
export declare function afterBookingStatusChange(params: {
    userId: string;
    bookingId: string;
    status: string;
    message: string;
    notificationType?: NotificationType;
}): Promise<void>;
export declare function afterInvoicePaid(params: {
    userId: string;
    invoiceNumber: string;
    invoiceId: string;
    amount?: number;
}): Promise<void>;
export declare function afterPaymentFailed(params: {
    userId: string;
    invoiceId?: string;
}): Promise<void>;
/**
 * Notifies the booking customer when someone else (e.g. staff) sent a message on the thread.
 * If `recipientUserId` is provided, it wins. Otherwise resolves from booking when possible.
 */
export declare function afterMessageSent(params: {
    message: Message;
    recipientUserId?: string;
}): Promise<void>;
//# sourceMappingURL=notificationOrchestrator.d.ts.map