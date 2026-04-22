import type Stripe from 'stripe';
import type { Application } from 'express';
import { prisma } from '../../prisma/client';
import { logger } from '../../utils/logger';
import * as adminSocketService from '../automation/adminSocketService';
import { enqueueJob } from '../jobs/jobQueue';
import { NotificationType } from '@prisma/client';
import {
  invalidateCompatBookings,
  invalidateCompatDashboard,
  invalidateCompatInvoices,
} from '../cache/compatCache';

type PaidNotify = {
  userId: string;
  invoiceNumber: string;
  invoiceId: string;
  amount: number;
};

/**
 * Idempotent Stripe webhook handling (Stripe `event.id` dedupe in DB).
 * Order inside DB transaction: advisory lock → invoice → booking.
 * Notifications run after commit via job queue.
 */
export async function processStripeWebhookEvent(event: Stripe.Event, app: Application): Promise<void> {
  const inserted = await prisma.stripeWebhookEvent.createMany({
    data: [{ id: event.id, type: event.type }],
    skipDuplicates: true,
  });

  if (inserted.count === 0) {
    return;
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const invoiceId = paymentIntent.metadata?.invoice_id;
    if (!invoiceId) {
      adminSocketService.emitAdminDashboardRefresh(app);
      return;
    }

    const notify = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(abs(hashtext($1::text))::bigint)',
          invoiceId
        );

        const inv = await tx.invoice.findUnique({
          where: { id: invoiceId },
          select: {
            id: true,
            status: true,
            userId: true,
            invoiceNumber: true,
            bookingId: true,
          },
        });

        if (!inv || inv.status === 'PAID') {
          return undefined;
        }

        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            stripePaymentIntentId: paymentIntent.id,
          },
        });

        await tx.booking.update({
          where: { id: inv.bookingId },
          data: { paymentStatus: 'PAID' },
        });

        const amount = (paymentIntent.amount_received ?? paymentIntent.amount) / 100;
        return {
          userId: inv.userId,
          invoiceNumber: inv.invoiceNumber,
          invoiceId: inv.id,
          amount,
        } satisfies PaidNotify;
      },
      { timeout: 12_000 }
    );

    if (notify) {
      enqueueJob({
        type: 'SEND_NOTIFICATION',
        payload: {
          userId: notify.userId,
          type: NotificationType.PAYMENT_RECEIVED,
          title: 'Payment Received',
          message: `Payment for invoice ${notify.invoiceNumber} has been received`,
          data: { invoiceId: notify.invoiceId, amount: notify.amount },
        },
      });
    }

    void invalidateCompatInvoices();
    void invalidateCompatBookings();
    void invalidateCompatDashboard();

    adminSocketService.emitAdminDashboardRefresh(app);
    return;
  }

  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const invoiceId = paymentIntent.metadata?.invoice_id;
    const userId = paymentIntent.metadata?.userId ?? paymentIntent.metadata?.user_id;
    if (userId) {
      enqueueJob({
        type: 'SEND_NOTIFICATION',
        payload: {
          userId,
          type: NotificationType.PAYMENT_FAILED,
          title: 'Payment Failed',
          message: 'Your payment could not be processed. Please try again.',
          data: { invoiceId: invoiceId ?? undefined },
        },
      });
    }
    adminSocketService.emitAdminDashboardRefresh(app);
  }
}

export function logStripeWebhookError(err: unknown): void {
  logger.error('Stripe webhook', err);
}
