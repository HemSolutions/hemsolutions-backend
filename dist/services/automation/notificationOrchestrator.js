"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationTypeForBookingStatus = notificationTypeForBookingStatus;
exports.afterBookingCreated = afterBookingCreated;
exports.afterBookingCancelled = afterBookingCancelled;
exports.afterWorkerAssigned = afterWorkerAssigned;
exports.afterBookingStatusChange = afterBookingStatusChange;
exports.afterInvoicePaid = afterInvoicePaid;
exports.afterPaymentFailed = afterPaymentFailed;
exports.afterMessageSent = afterMessageSent;
const client_1 = require("@prisma/client");
const client_2 = require("../../prisma/client");
const jobQueue_1 = require("../jobs/jobQueue");
/**
 * Maps booking lifecycle status to a Prisma notification enum value.
 */
function notificationTypeForBookingStatus(status) {
    switch (status) {
        case 'COMPLETED':
            return client_1.NotificationType.BOOKING_COMPLETED;
        case 'CANCELLED':
            return client_1.NotificationType.BOOKING_CANCELLED;
        case 'CONFIRMED':
            return client_1.NotificationType.BOOKING_CONFIRMED;
        case 'ASSIGNED':
            return client_1.NotificationType.BOOKING_ASSIGNED;
        case 'PENDING':
            return client_1.NotificationType.BOOKING_CREATED;
        case 'IN_PROGRESS':
            return client_1.NotificationType.BOOKING_ASSIGNED;
        default:
            return client_1.NotificationType.SYSTEM_ANNOUNCEMENT;
    }
}
/** Booking placed / confirmed — customer-facing confirmation. */
async function afterBookingCreated(params) {
    (0, jobQueue_1.enqueueJob)({
        type: 'SEND_NOTIFICATION',
        payload: {
            userId: params.userId,
            type: client_1.NotificationType.BOOKING_CONFIRMED,
            title: 'Booking confirmed',
            message: `Your ${params.service.name} has been scheduled for ${params.scheduledDate} at ${params.scheduledTime}`,
            data: { bookingId: params.bookingId },
        },
    });
}
async function afterBookingCancelled(params) {
    const serviceName = params.booking.service?.name ?? 'booking';
    (0, jobQueue_1.enqueueJob)({
        type: 'SEND_NOTIFICATION',
        payload: {
            userId: params.userId,
            type: client_1.NotificationType.BOOKING_CANCELLED,
            title: 'Booking Cancelled',
            message: `Your ${serviceName} booking has been cancelled`,
            data: { bookingId: params.booking.id },
        },
    });
}
/** Worker assignment — surfaced as a system announcement to the customer. */
async function afterWorkerAssigned(params) {
    (0, jobQueue_1.enqueueJob)({
        type: 'SEND_NOTIFICATION',
        payload: {
            userId: params.userId,
            type: client_1.NotificationType.SYSTEM_ANNOUNCEMENT,
            title: 'Cleaner assigned',
            message: `${params.worker.firstName} ${params.worker.lastName} has been assigned to your ${params.serviceName}`,
            data: { bookingId: params.bookingId, workerId: params.worker.id },
        },
    });
}
/**
 * Booking status transitions (COMPLETED, CONFIRMED, etc.).
 * Pass `notificationType` to preserve exact behaviour from callers; otherwise it is derived from `status`.
 */
async function afterBookingStatusChange(params) {
    const type = params.notificationType ?? notificationTypeForBookingStatus(params.status);
    (0, jobQueue_1.enqueueJob)({
        type: 'SEND_NOTIFICATION',
        payload: {
            userId: params.userId,
            type,
            title: params.status.replace(/_/g, ' '),
            message: params.message,
            data: { bookingId: params.bookingId },
        },
    });
}
async function afterInvoicePaid(params) {
    (0, jobQueue_1.enqueueJob)({
        type: 'SEND_NOTIFICATION',
        payload: {
            userId: params.userId,
            type: client_1.NotificationType.PAYMENT_RECEIVED,
            title: 'Payment Received',
            message: `Payment for invoice ${params.invoiceNumber} has been received`,
            data: { invoiceId: params.invoiceId, amount: params.amount },
        },
    });
}
async function afterPaymentFailed(params) {
    (0, jobQueue_1.enqueueJob)({
        type: 'SEND_NOTIFICATION',
        payload: {
            userId: params.userId,
            type: client_1.NotificationType.PAYMENT_FAILED,
            title: 'Payment Failed',
            message: 'Your payment could not be processed. Please try again.',
            data: { invoiceId: params.invoiceId },
        },
    });
}
/**
 * Notifies the booking customer when someone else (e.g. staff) sent a message on the thread.
 * If `recipientUserId` is provided, it wins. Otherwise resolves from booking when possible.
 */
async function afterMessageSent(params) {
    let recipientUserId = params.recipientUserId;
    if (!recipientUserId && params.message.bookingId) {
        const booking = await client_2.prisma.booking.findUnique({
            where: { id: params.message.bookingId },
            select: { userId: true },
        });
        if (booking && params.message.senderId !== booking.userId) {
            recipientUserId = booking.userId;
        }
    }
    if (!recipientUserId && params.message.conversationId) {
        const m = /^booking:(.+)$/i.exec(params.message.conversationId);
        if (m?.[1]) {
            const booking = await client_2.prisma.booking.findUnique({
                where: { id: m[1] },
                select: { userId: true },
            });
            if (booking && params.message.senderId !== booking.userId) {
                recipientUserId = booking.userId;
            }
        }
    }
    if (!recipientUserId) {
        return;
    }
    (0, jobQueue_1.enqueueJob)({
        type: 'SEND_NOTIFICATION',
        payload: {
            userId: recipientUserId,
            type: client_1.NotificationType.MESSAGE_RECEIVED,
            title: 'New message',
            message: params.message.content.slice(0, 200),
            data: { messageId: params.message.id, bookingId: params.message.bookingId },
        },
    });
}
//# sourceMappingURL=notificationOrchestrator.js.map