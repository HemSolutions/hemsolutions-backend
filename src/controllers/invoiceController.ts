import { Request, Response } from 'express';
import { InvoiceStatus, Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { prisma } from '../prisma/client';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';
import { createPaymentIntent } from '../utils/stripe';
import { PaymentIntentResponse, InvoiceResponse } from '../types';
import { processStripeWebhookEvent, logStripeWebhookError } from '../services/stripe/stripeWebhookService';
import { config } from '../config';
import { logger } from '../utils/logger';
import { enqueueJob } from '../services/jobs/jobQueue';
import QRCode from 'qrcode';
import { KEYS, readJsonStore } from '../services/compat/appCompatJsonStore';

type CompatSettingsBundle = {
  company?: Record<string, unknown>;
  invoice?: Record<string, unknown>;
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoneySe(value: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDateSe(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toKebabCaseReference(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export async function getInvoices(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { status, page = '1', limit = '10' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const role = req.user?.role ?? 'CUSTOMER';
    const where: Prisma.InvoiceWhereInput = role === 'ADMIN' || role === 'SUPER_ADMIN' ? {} : { userId };
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
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
          booking: {
            include: {
              service: { select: { id: true, name: true } },
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
      customerId: inv.user.id,
      customerName: `${inv.user.firstName} ${inv.user.lastName}`.trim(),
      customerEmail: inv.user.email,
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
    const role = req.user?.role ?? 'CUSTOMER';
    const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
    const settings = (await readJsonStore<CompatSettingsBundle>(KEYS.settingsBundle)) ?? {};
    const company = settings.company ?? {};
    const invoiceSettings = settings.invoice ?? {};

    const invoice = await prisma.invoice.findFirst({
      where: isAdmin ? { id } : { id, userId },
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

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    const customerName = `${invoice.booking.user.firstName} ${invoice.booking.user.lastName}`.trim() || 'Kund';
    const customerAddress = `${invoice.booking.address.street}, ${invoice.booking.address.zipCode} ${invoice.booking.address.city}`.trim();
    const companyName = asString(company.company_name, 'HemSolutions AB');
    const companyOrg = asString(company.org_number);
    const companyVat = asString(company.vat_number);
    const companyPhone = asString(company.phone);
    const companyEmail = asString(company.email);
    const companyWebsite = asString(company.website);
    const companyBankgiro = asString(company.bankgiro);
    const companyAddress = asString(company.address_line1 || company.address);
    const companyPostalCode = asString(company.postal_code);
    const companyCity = asString(company.city);
    const swishNumber = asString(company.swish_number || invoiceSettings.swish_number);
    const defaultNotes = asString(invoiceSettings.default_notes);
    const defaultFooter = asString(invoiceSettings.default_footer);
    const logoUrl = asString(invoiceSettings.logo_url || company.logo_url);
    const issueDate = invoice.createdAt;
    const dueDate = invoice.dueDate;
    const amountToPay = Number(invoice.total);
    const taxRatePercent = Math.round(Number(invoice.taxRate) * 100);
    const invoiceReference = toKebabCaseReference(`${invoice.invoiceNumber} ${customerName}`);
    const swishUrl = swishNumber
      ? `https://app.swish.nu/1/p/sw/?sw=${encodeURIComponent(swishNumber)}&amt=${encodeURIComponent(
          amountToPay.toFixed(2)
        )}&cur=SEK&msg=${encodeURIComponent(invoiceReference)}`
      : '';
    let qrCodeBuffer: Buffer | null = null;
    if (swishUrl) {
      try {
        qrCodeBuffer = await QRCode.toBuffer(swishUrl, { width: 130, margin: 1 });
      } catch {
        qrCodeBuffer = null;
      }
    }
    let logoBuffer: Buffer | null = null;
    if (logoUrl) {
      try {
        const logoResponse = await fetch(logoUrl);
        if (logoResponse.ok) {
          const arr = await logoResponse.arrayBuffer();
          logoBuffer = Buffer.from(arr);
        }
      } catch {
        logoBuffer = null;
      }
    }

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
      res.send(pdf);
    });

    const left = 50;
    const right = 545;
    const pageWidth = right - left;
    const tableTop = 245;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, left, 45, { fit: [95, 65] });
      } catch {
        // Ignore invalid image and continue rendering PDF.
      }
    }
    doc.font('Helvetica-Bold').fontSize(18).text('Faktura', right - 90, 52, { width: 90, align: 'right' });
    doc.font('Helvetica').fontSize(10);
    doc.text(`Nummer: ${invoice.invoiceNumber}`, right - 190, 74, { width: 190, align: 'right' });
    doc.text(`Datum: ${formatDateSe(issueDate)}`, right - 190, 88, { width: 190, align: 'right' });
    doc.text(`Förfallodatum: ${formatDateSe(dueDate)}`, right - 190, 102, { width: 190, align: 'right' });

    doc.font('Helvetica-Bold').fontSize(11).text('Från', left, 125);
    doc.font('Helvetica').fontSize(10);
    doc.text(companyName, left, 140);
    if (companyAddress) doc.text(companyAddress, left, 154);
    doc.text(`${companyPostalCode} ${companyCity}`.trim(), left, 168);
    if (companyPhone) doc.text(`Tel: ${companyPhone}`, left, 182);
    if (companyEmail) doc.text(`E-post: ${companyEmail}`, left, 196);
    if (companyWebsite) doc.text(companyWebsite, left, 210);

    doc.font('Helvetica-Bold').fontSize(11).text('Till', 300, 125);
    doc.font('Helvetica').fontSize(10);
    doc.text(customerName, 300, 140);
    doc.text(customerAddress, 300, 154, { width: 240 });
    doc.text(invoice.booking.user.email ?? '', 300, 182);

    doc.moveTo(left, tableTop - 8).lineTo(right, tableTop - 8).strokeColor('#d1d5db').stroke();
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Beskrivning', left, tableTop);
    doc.text('Antal', 300, tableTop, { width: 40, align: 'right' });
    doc.text('À-pris', 350, tableTop, { width: 70, align: 'right' });
    doc.text('Moms', 425, tableTop, { width: 45, align: 'right' });
    doc.text('Summa', 475, tableTop, { width: 70, align: 'right' });
    doc.moveTo(left, tableTop + 16).lineTo(right, tableTop + 16).strokeColor('#d1d5db').stroke();

    let y = tableTop + 24;
    doc.font('Helvetica').fontSize(10);
    for (const item of invoice.items) {
      doc.text(item.description, left, y, { width: 240 });
      doc.text(formatMoneySe(Number(item.quantity)), 300, y, { width: 40, align: 'right' });
      doc.text(formatMoneySe(Number(item.unitPrice)), 350, y, { width: 70, align: 'right' });
      doc.text(`${taxRatePercent}%`, 425, y, { width: 45, align: 'right' });
      doc.text(formatMoneySe(Number(item.total)), 475, y, { width: 70, align: 'right' });
      y += 18;
    }

    y += 10;
    const summaryX = 350;
    const summaryW = 195;
    doc.moveTo(summaryX, y - 6).lineTo(summaryX + summaryW, y - 6).strokeColor('#d1d5db').stroke();
    doc.text('Nettobelopp', summaryX, y, { width: 120 });
    doc.text(`${formatMoneySe(Number(invoice.subtotal))} kr`, summaryX, y, { width: summaryW, align: 'right' });
    y += 16;
    doc.text('Moms', summaryX, y, { width: 120 });
    doc.text(`${formatMoneySe(Number(invoice.taxAmount))} kr`, summaryX, y, { width: summaryW, align: 'right' });
    y += 16;
    const deduction = Math.max(0, Number(invoice.subtotal) + Number(invoice.taxAmount) - amountToPay);
    if (deduction > 0) {
      doc.text('Skattereduktion', summaryX, y, { width: 120 });
      doc.text(`-${formatMoneySe(deduction)} kr`, summaryX, y, { width: summaryW, align: 'right' });
      y += 16;
    }
    doc.font('Helvetica-Bold');
    doc.text('Att betala', summaryX, y, { width: 120 });
    doc.text(`${formatMoneySe(amountToPay)} kr`, summaryX, y, { width: summaryW, align: 'right' });
    doc.font('Helvetica');

    y += 34;
    const paymentText = swishNumber
      ? `Betalas till Swish ${swishNumber} (läs av QR-koden)${companyBankgiro ? ` eller Bankgiro ${companyBankgiro}` : ''}, ange fakt.nr som referens`
      : `Betalas med fakturanummer som referens${companyBankgiro ? ` till Bankgiro ${companyBankgiro}` : ''}`;
    doc.text(paymentText, left, y, { width: pageWidth - 150 });
    y += 24;
    if (defaultNotes) {
      doc.fontSize(9).fillColor('#374151').text(defaultNotes, left, y, { width: pageWidth - 150 });
      y += 30;
      doc.fillColor('black').fontSize(10);
    }
    if (defaultFooter) {
      doc.fontSize(9).fillColor('#374151').text(defaultFooter, left, y, { width: pageWidth - 150 });
      doc.fillColor('black').fontSize(10);
    }

    if (qrCodeBuffer) {
      doc.image(qrCodeBuffer, right - 130, 650, { fit: [120, 120] });
      doc.fontSize(8).text('Swish QR', right - 130, 775, { width: 120, align: 'center' });
    }

    doc.fontSize(8).fillColor('#6b7280');
    const footer = [companyName, companyOrg ? `Org.nr: ${companyOrg}` : '', companyVat ? `Momsreg.nr: ${companyVat}` : '']
      .filter(Boolean)
      .join(' | ');
    doc.text(footer, left, 812, { width: pageWidth, align: 'center' });
    doc.fillColor('black');
    doc.end();
  } catch (error) {
    logger.error('Download invoice error', error);
    errorResponse(res, 'Failed to download invoice', 500);
  }
}

export async function createManualInvoice(req: Request, res: Response): Promise<void> {
  try {
    const {
      userId,
      serviceName,
      subtotal,
      taxRate = 0.25,
      dueDate,
      isRut = false,
      rutPercent = 0,
      notes = '',
    } = req.body as {
      userId: string;
      serviceName: string;
      subtotal: number;
      taxRate?: number;
      dueDate: string;
      isRut?: boolean;
      rutPercent?: number;
      notes?: string;
    };

    if (!userId || !serviceName || !subtotal || !dueDate) {
      errorResponse(res, 'userId, serviceName, subtotal and dueDate are required', 400);
      return;
    }

    const placeholderAddress = await prisma.address.findFirst({ where: { userId } });
    if (!placeholderAddress) {
      errorResponse(res, 'Customer must have an address before creating invoice', 400);
      return;
    }
    const genericService = await prisma.service.findFirst({ where: { isActive: true } });
    if (!genericService) {
      errorResponse(res, 'No active service available for manual invoice', 400);
      return;
    }

    const totalBeforeRut = Number(subtotal) * (1 + Number(taxRate));
    const rutDeduction = isRut ? totalBeforeRut * (Number(rutPercent) / 100) : 0;
    const total = totalBeforeRut - rutDeduction;

    const booking = await prisma.booking.create({
      data: {
        userId,
        serviceId: genericService.id,
        addressId: placeholderAddress.id,
        scheduledDate: new Date(),
        scheduledTime: '00:00',
        duration: 60,
        basePrice: Number(subtotal),
        extrasPrice: 0,
        totalPrice: total,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        notes: `Manual invoice booking: ${notes}`.trim(),
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        bookingId: booking.id,
        userId,
        invoiceNumber: `INV-MAN-${Date.now()}`,
        subtotal: Number(subtotal),
        taxRate: Number(taxRate),
        taxAmount: Number(subtotal) * Number(taxRate),
        total,
        dueDate: new Date(dueDate),
        status: 'DRAFT',
        pdfUrl: null,
        items: {
          create: [
            {
              description: `${serviceName}${isRut ? ` (RUT ${rutPercent}%)` : ''}`,
              quantity: 1,
              unitPrice: Number(subtotal),
              total: Number(subtotal),
            },
            ...(rutDeduction > 0
              ? [{
                  description: `RUT deduction ${rutPercent}%`,
                  quantity: 1,
                  unitPrice: -rutDeduction,
                  total: -rutDeduction,
                }]
              : []),
          ],
        },
      },
      include: { items: true },
    });

    successResponse(res, invoice, 'Manual invoice created', 201);
  } catch (error) {
    logger.error('Create manual invoice error', error);
    errorResponse(res, 'Failed to create manual invoice', 500);
  }
}

export async function sendInvoiceEmail(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const invoice = await prisma.invoice.findUnique({ where: { id }, select: { userId: true } });
    if (!invoice) {
      errorResponse(res, 'Invoice not found', 404);
      return;
    }
    await enqueueJob({ type: 'SEND_INVOICE_EMAIL', payload: { invoiceId: id, userId: invoice.userId } });
    successResponse(res, null, 'Invoice email queued');
  } catch (error) {
    logger.error('Send invoice email error', error);
    errorResponse(res, 'Failed to send invoice email', 500);
  }
}

export async function sendInvoiceSms(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { user: { select: { phone: true } } },
    });
    if (!invoice?.user?.phone) {
      errorResponse(res, 'No customer phone for this invoice', 400);
      return;
    }
    await enqueueJob({
      type: 'SEND_SMS',
      payload: {
        to: invoice.user.phone,
        rawTo: invoice.user.phone,
        message: `Invoice ${invoice.invoiceNumber} amount ${invoice.total.toFixed(2)} SEK due ${invoice.dueDate.toISOString().slice(0, 10)}`,
      },
    });
    successResponse(res, null, 'Invoice SMS queued');
  } catch (error) {
    logger.error('Send invoice SMS error', error);
    errorResponse(res, 'Failed to send invoice SMS', 500);
  }
}

export async function sendInvoiceReminder(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { channel = 'email' } = req.body as { channel?: 'email' | 'sms' };
    await enqueueJob({
      type: 'SEND_REMINDER',
      payload: {
        invoiceId: id,
        reminderId: `manual-${Date.now()}`,
        channel,
      },
    });
    successResponse(res, null, `Invoice reminder queued via ${channel}`);
  } catch (error) {
    logger.error('Send invoice reminder error', error);
    errorResponse(res, 'Failed to send invoice reminder', 500);
  }
}

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  try {
    const { constructWebhookEvent } = await import('../utils/stripe.js');
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
