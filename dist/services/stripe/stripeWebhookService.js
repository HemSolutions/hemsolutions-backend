"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processStripeWebhookEvent = processStripeWebhookEvent;
exports.logStripeWebhookError = logStripeWebhookError;
const client_1 = require("../../prisma/client");
const logger_1 = require("../../utils/logger");
const adminSocketService = __importStar(require("../automation/adminSocketService"));
const jobQueue_1 = require("../jobs/jobQueue");
const client_2 = require("@prisma/client");
const compatCache_1 = require("../cache/compatCache");
/**
 * Idempotent Stripe webhook handling (Stripe `event.id` dedupe in DB).
 * Order inside DB transaction: advisory lock → invoice → booking.
 * Notifications run after commit via job queue.
 */
async function processStripeWebhookEvent(event, app) {
    const inserted = await client_1.prisma.stripeWebhookEvent.createMany({
        data: [{ id: event.id, type: event.type }],
        skipDuplicates: true,
    });
    if (inserted.count === 0) {
        return;
    }
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const invoiceId = paymentIntent.metadata?.invoice_id;
        if (!invoiceId) {
            adminSocketService.emitAdminDashboardRefresh(app);
            return;
        }
        const notify = await client_1.prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(abs(hashtext($1::text))::bigint)', invoiceId);
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
            };
        }, { timeout: 12_000 });
        if (notify) {
            (0, jobQueue_1.enqueueJob)({
                type: 'SEND_NOTIFICATION',
                payload: {
                    userId: notify.userId,
                    type: client_2.NotificationType.PAYMENT_RECEIVED,
                    title: 'Payment Received',
                    message: `Payment for invoice ${notify.invoiceNumber} has been received`,
                    data: { invoiceId: notify.invoiceId, amount: notify.amount },
                },
            });
        }
        void (0, compatCache_1.invalidateCompatInvoices)();
        void (0, compatCache_1.invalidateCompatBookings)();
        void (0, compatCache_1.invalidateCompatDashboard)();
        adminSocketService.emitAdminDashboardRefresh(app);
        return;
    }
    if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        const invoiceId = paymentIntent.metadata?.invoice_id;
        const userId = paymentIntent.metadata?.userId ?? paymentIntent.metadata?.user_id;
        if (userId) {
            (0, jobQueue_1.enqueueJob)({
                type: 'SEND_NOTIFICATION',
                payload: {
                    userId,
                    type: client_2.NotificationType.PAYMENT_FAILED,
                    title: 'Payment Failed',
                    message: 'Your payment could not be processed. Please try again.',
                    data: { invoiceId: invoiceId ?? undefined },
                },
            });
        }
        adminSocketService.emitAdminDashboardRefresh(app);
    }
}
function logStripeWebhookError(err) {
    logger_1.logger.error('Stripe webhook', err);
}
//# sourceMappingURL=stripeWebhookService.js.map