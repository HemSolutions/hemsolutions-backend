import Stripe from 'stripe';
declare const stripe: Stripe;
export { stripe };
export declare function createPaymentIntent(amount: number, currency?: string, metadata?: Record<string, string>): Promise<Stripe.PaymentIntent>;
export declare function retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent>;
export declare function createRefund(paymentIntentId: string, amount?: number): Promise<Stripe.Refund>;
export declare function constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event;
//# sourceMappingURL=stripe.d.ts.map