import Stripe from 'stripe';
import { config } from '../config';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16' as any
});

export { stripe };

export async function createPaymentIntent(
  amount: number, 
  currency: string = 'sek',
  metadata?: Record<string, string>
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency,
    automatic_payment_methods: { enabled: true },
    metadata
  });
}

export async function retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

export async function createRefund(
  paymentIntentId: string, 
  amount?: number
): Promise<Stripe.Refund> {
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amount ? Math.round(amount * 100) : undefined
  });
}

export function constructWebhookEvent(
  payload: string | Buffer, 
  signature: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    config.stripe.webhookSecret
  );
}
