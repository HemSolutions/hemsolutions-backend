"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripe = void 0;
exports.createPaymentIntent = createPaymentIntent;
exports.retrievePaymentIntent = retrievePaymentIntent;
exports.createRefund = createRefund;
exports.constructWebhookEvent = constructWebhookEvent;
const stripe_1 = __importDefault(require("stripe"));
const config_1 = require("../config");
const stripe = new stripe_1.default(config_1.config.stripe.secretKey, {
    apiVersion: '2023-10-16'
});
exports.stripe = stripe;
async function createPaymentIntent(amount, currency = 'sek', metadata) {
    return stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        automatic_payment_methods: { enabled: true },
        metadata
    });
}
async function retrievePaymentIntent(paymentIntentId) {
    return stripe.paymentIntents.retrieve(paymentIntentId);
}
async function createRefund(paymentIntentId, amount) {
    return stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined
    });
}
function constructWebhookEvent(payload, signature) {
    return stripe.webhooks.constructEvent(payload, signature, config_1.config.stripe.webhookSecret);
}
//# sourceMappingURL=stripe.js.map