import type { QueuedJob } from './jobTypes';
import { createNotification } from '../notificationService';
import {
  getInvoiceEmailTemplate,
  getReminderEmailTemplate,
  sendEmail,
} from '../../utils/email';
import { logger } from '../../utils/logger';
import { processCompatSmsSend } from '../compat/compatSmsJobRunner';
import { prisma } from '../../prisma/client';
import { KEYS, readJsonStore } from '../compat/appCompatJsonStore';

type ReminderStore = {
  records: Array<{ id: string; message?: string }>;
};

function compatInvoiceUrl(invoiceId: string): string {
  const base = process.env.FRONTEND_URL || 'https://app.hemsolutions.se';
  return `${base.replace(/\/$/, '')}/invoices/${invoiceId}`;
}

export async function executeJob(job: QueuedJob): Promise<void> {
  switch (job.type) {
    case 'SEND_NOTIFICATION':
      await createNotification(job.payload);
      return;
    case 'SEND_EMAIL':
      await sendEmail(job.payload);
      return;
    case 'SEND_SMS':
      await processCompatSmsSend(job.payload);
      return;
    case 'SEND_INVOICE_EMAIL': {
      const invoice = await prisma.invoice.findUnique({
        where: { id: job.payload.invoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          dueDate: true,
          status: true,
          user: { select: { email: true, firstName: true } },
        },
      });
      if (!invoice?.user?.email) {
        logger.warn('Invoice email skipped - recipient missing', { invoiceId: job.payload.invoiceId });
        return;
      }
      await sendEmail({
        to: invoice.user.email,
        subject: job.payload.subject ?? `Invoice ${invoice.invoiceNumber}`,
        text: `Invoice ${invoice.invoiceNumber} for ${invoice.total.toFixed(2)} SEK is available.`,
        html: getInvoiceEmailTemplate({
          customerName: invoice.user.firstName,
          invoiceNumber: invoice.invoiceNumber,
          dueDate: invoice.dueDate,
          total: invoice.total,
          status: invoice.status,
          paymentUrl: compatInvoiceUrl(invoice.id),
        }),
      });
      return;
    }
    case 'SEND_REMINDER': {
      const invoice = await prisma.invoice.findUnique({
        where: { id: job.payload.invoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          dueDate: true,
          user: { select: { email: true, firstName: true, phone: true, id: true } },
        },
      });
      if (!invoice?.user) {
        logger.warn('Reminder email skipped - recipient missing', {
          invoiceId: job.payload.invoiceId,
          reminderId: job.payload.reminderId,
        });
        return;
      }

      let reminderMessage: string | undefined;
      const reminderStore = await readJsonStore<ReminderStore>(KEYS.reminders);
      reminderMessage = reminderStore?.records.find((r) => r.id === job.payload.reminderId)?.message;

      const dueDate = invoice.dueDate.toISOString().slice(0, 10);
      const reminderText = `Reminder: invoice ${invoice.invoiceNumber} (${invoice.total.toFixed(2)} SEK) is due ${dueDate}.`;
      const channel = (job.payload.channel ?? 'email').toLowerCase();

      if (channel === 'sms' && invoice.user.phone) {
        await processCompatSmsSend({
          to: invoice.user.phone,
          rawTo: invoice.user.phone,
          message: reminderText,
          targetUserId: invoice.user.id,
        });
        return;
      }

      if (!invoice.user.email) {
        logger.warn('Reminder email skipped - no email on recipient', {
          invoiceId: job.payload.invoiceId,
          reminderId: job.payload.reminderId,
        });
        return;
      }

      await sendEmail({
        to: invoice.user.email,
        subject: `Reminder: invoice ${invoice.invoiceNumber} is due`,
        text: reminderText,
        html: getReminderEmailTemplate({
          customerName: invoice.user.firstName,
          invoiceNumber: invoice.invoiceNumber,
          dueDate: invoice.dueDate,
          total: invoice.total,
          message: reminderMessage,
          paymentUrl: compatInvoiceUrl(invoice.id),
        }),
      });
      return;
    }
    default:
      return;
  }
}
