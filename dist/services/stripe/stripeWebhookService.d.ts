import type Stripe from 'stripe';
import type { Application } from 'express';
/**
 * Idempotent Stripe webhook handling (Stripe `event.id` dedupe in DB).
 * Order inside DB transaction: advisory lock → invoice → booking.
 * Notifications run after commit via job queue.
 */
export declare function processStripeWebhookEvent(event: Stripe.Event, app: Application): Promise<void>;
export declare function logStripeWebhookError(err: unknown): void;
