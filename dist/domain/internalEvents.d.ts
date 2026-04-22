/**
 * In-process domain events (sync). No external broker.
 * Controllers must not emit; domain services emit after successful mutations.
 */
export type DomainEvent = {
    type: 'booking.created';
    payload: {
        bookingId: string;
        userId: string;
    };
} | {
    type: 'booking.updated';
    payload: {
        bookingId: string;
    };
} | {
    type: 'booking.deleted';
    payload: {
        bookingId: string;
    };
} | {
    type: 'booking.completed';
    payload: {
        bookingId: string;
        userId: string;
    };
} | {
    type: 'invoice.created';
    payload: {
        invoiceId: string;
        bookingId?: string | null;
    };
} | {
    type: 'invoice.updated';
    payload: {
        invoiceId: string;
    };
} | {
    type: 'invoice.deleted';
    payload: {
        invoiceId: string;
    };
} | {
    type: 'payment.recorded';
    payload: {
        paymentId: string;
        invoiceId: string;
        amount: number;
    };
} | {
    type: 'payment.succeeded';
    payload: {
        paymentId: string;
        invoiceId: string;
        amount: number;
    };
} | {
    type: 'message.created';
    payload: {
        messageId: string;
        bookingId: string | null;
        conversationId: string | null;
    };
};
export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;
export declare function subscribeDomainEvents(handler: DomainEventHandler): void;
export declare function emitDomainEvent(event: DomainEvent): Promise<void>;
