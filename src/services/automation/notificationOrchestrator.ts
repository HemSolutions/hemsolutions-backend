import type { Booking, Message, Service, Worker } from '@prisma/client';
import { NotificationType } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { enqueueJob } from '../jobs/jobQueue';

/**
 * Maps booking lifecycle status to a Prisma notification enum value.
 */
export function notificationTypeForBookingStatus(status: string): NotificationType {
  switch (status) {
    case 'COMPLETED':
      return NotificationType.BOOKING_COMPLETED;
    case 'CANCELLED':
      return NotificationType.BOOKING_CANCELLED;
    case 'CONFIRMED':
      return NotificationType.BOOKING_CONFIRMED;
    case 'ASSIGNED':
      return NotificationType.BOOKING_ASSIGNED;
    case 'PENDING':
      return NotificationType.BOOKING_CREATED;
    case 'IN_PROGRESS':
      return NotificationType.BOOKING_ASSIGNED;
    default:
      return NotificationType.SYSTEM_ANNOUNCEMENT;
  }
}

/** Booking placed / confirmed — customer-facing confirmation. */
export async function afterBookingCreated(params: {
  userId: string;
  bookingId: string;
  service: Service;
  scheduledDate: string;
  scheduledTime: string;
}): Promise<void> {
  enqueueJob({
    type: 'SEND_NOTIFICATION',
    payload: {
      userId: params.userId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Booking confirmed',
      message: `Your ${params.service.name} has been scheduled for ${params.scheduledDate} at ${params.scheduledTime}`,
      data: { bookingId: params.bookingId },
    },
  });
}

export async function afterBookingCancelled(params: {
  userId: string;
  booking: Booking & { service?: Service | null };
}): Promise<void> {
  const serviceName = params.booking.service?.name ?? 'booking';
  enqueueJob({
    type: 'SEND_NOTIFICATION',
    payload: {
      userId: params.userId,
      type: NotificationType.BOOKING_CANCELLED,
      title: 'Booking Cancelled',
      message: `Your ${serviceName} booking has been cancelled`,
      data: { bookingId: params.booking.id },
    },
  });
}

/** Worker assignment — surfaced as a system announcement to the customer. */
export async function afterWorkerAssigned(params: {
  userId: string;
  bookingId: string;
  worker: Worker;
  serviceName: string;
}): Promise<void> {
  enqueueJob({
    type: 'SEND_NOTIFICATION',
    payload: {
      userId: params.userId,
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
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
export async function afterBookingStatusChange(params: {
  userId: string;
  bookingId: string;
  status: string;
  message: string;
  notificationType?: NotificationType;
}): Promise<void> {
  const type =
    params.notificationType ?? notificationTypeForBookingStatus(params.status);

  enqueueJob({
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

export async function afterInvoicePaid(params: {
  userId: string;
  invoiceNumber: string;
  invoiceId: string;
  amount?: number;
}): Promise<void> {
  enqueueJob({
    type: 'SEND_NOTIFICATION',
    payload: {
      userId: params.userId,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Payment Received',
      message: `Payment for invoice ${params.invoiceNumber} has been received`,
      data: { invoiceId: params.invoiceId, amount: params.amount },
    },
  });
}

export async function afterPaymentFailed(params: {
  userId: string;
  invoiceId?: string;
}): Promise<void> {
  enqueueJob({
    type: 'SEND_NOTIFICATION',
    payload: {
      userId: params.userId,
      type: NotificationType.PAYMENT_FAILED,
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
export async function afterMessageSent(params: {
  message: Message;
  recipientUserId?: string;
}): Promise<void> {
  let recipientUserId = params.recipientUserId;

  if (!recipientUserId && params.message.bookingId) {
    const booking = await prisma.booking.findUnique({
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
      const booking = await prisma.booking.findUnique({
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

  enqueueJob({
    type: 'SEND_NOTIFICATION',
    payload: {
      userId: recipientUserId,
      type: NotificationType.MESSAGE_RECEIVED,
      title: 'New message',
      message: params.message.content.slice(0, 200),
      data: { messageId: params.message.id, bookingId: params.message.bookingId },
    },
  });
}
