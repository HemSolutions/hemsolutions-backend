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
exports.getInvoices = getInvoices;
exports.getInvoiceById = getInvoiceById;
exports.createPaymentIntentForInvoice = createPaymentIntentForInvoice;
exports.downloadInvoicePDF = downloadInvoicePDF;
exports.handleStripeWebhook = handleStripeWebhook;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const response_1 = require("../utils/response");
const stripe_1 = require("../utils/stripe");
const stripeWebhookService_1 = require("../services/stripe/stripeWebhookService");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
async function getInvoices(req, res) {
    try {
        const userId = req.user.userId;
        const { status, page = '1', limit = '10' } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const where = { userId };
        if (status && typeof status === 'string') {
            const allowed = Object.values(client_1.InvoiceStatus);
            if (allowed.includes(status)) {
                where.status = status;
            }
        }
        const [invoices, total] = await Promise.all([
            client_2.prisma.invoice.findMany({
                where,
                include: {
                    booking: {
                        include: {
                            service: { select: { name: true } },
                        },
                    },
                    items: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
            }),
            client_2.prisma.invoice.count({ where }),
        ]);
        const formatted = invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            bookingId: inv.bookingId,
            status: inv.status,
            subtotal: inv.subtotal,
            taxAmount: inv.taxAmount,
            total: inv.total,
            dueDate: inv.dueDate,
            paidAt: inv.paidAt,
            pdfUrl: inv.pdfUrl,
            serviceName: inv.booking.service.name,
        }));
        (0, response_1.paginatedResponse)(res, formatted, total, pageNum, limitNum);
    }
    catch (error) {
        logger_1.logger.error('Get invoices error', error);
        (0, response_1.errorResponse)(res, 'Failed to get invoices', 500);
    }
}
async function getInvoiceById(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const invoice = await client_2.prisma.invoice.findFirst({
            where: { id, userId },
            include: {
                booking: {
                    include: {
                        service: { select: { id: true, name: true } },
                        address: { select: { street: true, city: true, zipCode: true, country: true } },
                        worker: { select: { firstName: true, lastName: true } },
                    },
                },
                items: true,
            },
        });
        if (!invoice) {
            (0, response_1.errorResponse)(res, 'Invoice not found', 404);
            return;
        }
        (0, response_1.successResponse)(res, invoice);
    }
    catch (error) {
        logger_1.logger.error('Get invoice error', error);
        (0, response_1.errorResponse)(res, 'Failed to get invoice', 500);
    }
}
async function createPaymentIntentForInvoice(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const invoice = await client_2.prisma.invoice.findFirst({
            where: { id, userId },
            include: { booking: { include: { service: { select: { name: true } } } } },
        });
        if (!invoice) {
            (0, response_1.errorResponse)(res, 'Invoice not found', 404);
            return;
        }
        if (invoice.status === 'PAID') {
            (0, response_1.errorResponse)(res, 'Invoice is already paid', 400);
            return;
        }
        const paymentIntent = await (0, stripe_1.createPaymentIntent)(invoice.total, 'sek', {
            invoiceId: String(invoice.id),
            userId: String(userId),
            bookingId: String(invoice.bookingId),
        });
        await client_2.prisma.invoice.update({
            where: { id },
            data: { stripePaymentIntentId: paymentIntent.id },
        });
        const response = {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
        };
        (0, response_1.successResponse)(res, response);
    }
    catch (error) {
        logger_1.logger.error('Create payment intent error', error);
        (0, response_1.errorResponse)(res, 'Failed to create payment intent', 500);
    }
}
async function downloadInvoicePDF(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const invoice = await client_2.prisma.invoice.findFirst({
            where: { id, userId },
            include: {
                booking: {
                    include: {
                        service: { select: { name: true } },
                        address: { select: { street: true, city: true, zipCode: true, country: true } },
                        user: { select: { firstName: true, lastName: true, email: true } },
                    },
                },
                items: true,
            },
        });
        if (!invoice) {
            (0, response_1.errorResponse)(res, 'Invoice not found', 404);
            return;
        }
        const invoiceData = {
            invoiceNumber: invoice.invoiceNumber,
            date: invoice.createdAt,
            dueDate: invoice.dueDate,
            customer: {
                name: `${invoice.booking.user.firstName} ${invoice.booking.user.lastName}`,
                email: invoice.booking.user.email,
                address: invoice.booking.address,
            },
            service: invoice.booking.service.name,
            items: invoice.items,
            subtotal: invoice.subtotal,
            taxRate: invoice.taxRate,
            taxAmount: invoice.taxAmount,
            total: invoice.total,
            status: invoice.status,
            paidAt: invoice.paidAt,
        };
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.json"`);
        (0, response_1.successResponse)(res, invoiceData);
    }
    catch (error) {
        logger_1.logger.error('Download invoice error', error);
        (0, response_1.errorResponse)(res, 'Failed to download invoice', 500);
    }
}
async function handleStripeWebhook(req, res) {
    try {
        const { constructWebhookEvent } = await Promise.resolve().then(() => __importStar(require('../utils/stripe')));
        const sig = req.headers['stripe-signature'];
        const event = constructWebhookEvent(req.body, sig);
        await (0, stripeWebhookService_1.processStripeWebhookEvent)(event, req.app);
        res.status(200).json({ received: true });
    }
    catch (error) {
        (0, stripeWebhookService_1.logStripeWebhookError)(error);
        if (!config_1.config.server.isProduction) {
            res.status(400).send('Webhook processing failed');
            return;
        }
        res.status(400).send('Invalid request');
    }
}
//# sourceMappingURL=invoiceController.js.map