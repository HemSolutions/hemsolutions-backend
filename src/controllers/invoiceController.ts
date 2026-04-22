import { Request, Response } from 'express';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';
import { createPaymentIntent } from '../utils/stripe';
import { PaymentIntentResponse, InvoiceResponse } from '../types';
import { processStripeWebhookEvent, logStripeWebhookError } from '../services/stripe/stripeWebhookService';
import { config } from '../config';
import { logger } from '../utils/logger';

export async function getInvoices(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { status, page = '1', limit = '10' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where: Prisma.InvoiceWhereInput = { userId };
    if (status && typeof status === 'string') {
      const allowed = Object.values(InvoiceStatus) as string[];
      if (allowed.includes(status)) {
        where.status = status as InvoiceStatus;
      }
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
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
      prisma.invoice.count({ where }),
    ]);

    const formatted: InvoiceResponse[] = invoices.map((inv) => ({
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

    paginatedResponse(res, formatted, total, pageNum, limitNum);
  } catch (error) {
    logger.error('Get invoices error', error);
    errorResponse(res, 'Failed to get invoices', 500);
  }
}

export async function getInvoiceById(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const invoice = await prisma.invoice.findFirst({
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
      errorResponse(res, 'Invoice not found', 404);
      return;
    }

    successResponse(res, invoice);
  } catch (error) {
    logger.error('Get invoice error', error);
    errorResponse(res, 'Failed to get invoice', 500);
  }
}

export async function createPaymentIntentForInvoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, userId },
      include: { booking: { include: { service: { select: { name: true } } } } },
    });

    if (!invoice) {
      errorResponse(res, 'Invoice not found', 404);
      return;
    }

    if (invoice.status === 'PAID') {
      errorResponse(res, 'Invoice is already paid', 400);
      return;
    }

    const paymentIntent = await createPaymentIntent(invoice.total, 'sek', {
      invoiceId: String(invoice.id),
      userId: String(userId),
      bookingId: String(invoice.bookingId),
    });

    await prisma.invoice.update({
      where: { id },
      data: { stripePaymentIntentId: paymentIntent.id },
    });

    const response: PaymentIntentResponse = {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
    };

    successResponse(res, response);
  } catch (error) {
    logger.error('Create payment intent error', error);
    errorResponse(res, 'Failed to create payment intent', 500);
  }
}

export async function downloadInvoicePDF(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const invoice = await prisma.invoice.findFirst({
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
      errorResponse(res, 'Invoice not found', 404);
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

    successResponse(res, invoiceData);
  } catch (error) {
    logger.error('Download invoice error', error);
    errorResponse(res, 'Failed to download invoice', 500);
  }
}

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  try {
    const { constructWebhookEvent } = await import('../utils/stripe');
    const sig = req.headers['stripe-signature'] as string;
    const event = constructWebhookEvent(req.body, sig);
    await processStripeWebhookEvent(event, req.app);
    res.status(200).json({ received: true });
  } catch (error) {
    logStripeWebhookError(error);
    if (!config.server.isProduction) {
      res.status(400).send('Webhook processing failed');
      return;
    }
    res.status(400).send('Invalid request');
  }
}
