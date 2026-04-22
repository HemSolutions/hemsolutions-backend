"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeJob = executeJob;
const notificationService_1 = require("../notificationService");
const email_1 = require("../../utils/email");
const logger_1 = require("../../utils/logger");
const compatSmsJobRunner_1 = require("../compat/compatSmsJobRunner");
const client_1 = require("../../prisma/client");
const appCompatJsonStore_1 = require("../compat/appCompatJsonStore");
function compatInvoiceUrl(invoiceId) {
    const base = process.env.FRONTEND_URL || 'https://app.hemsolutions.se';
    return `${base.replace(/\/$/, '')}/invoices/${invoiceId}`;
}
async function executeJob(job) {
    switch (job.type) {
        case 'SEND_NOTIFICATION':
            await (0, notificationService_1.createNotification)(job.payload);
            return;
        case 'SEND_EMAIL':
            await (0, email_1.sendEmail)(job.payload);
            return;
        case 'SEND_SMS':
            await (0, compatSmsJobRunner_1.processCompatSmsSend)(job.payload);
            return;
        case 'SEND_INVOICE_EMAIL': {
            const invoice = await client_1.prisma.invoice.findUnique({
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
                logger_1.logger.warn('Invoice email skipped - recipient missing', { invoiceId: job.payload.invoiceId });
                return;
            }
            await (0, email_1.sendEmail)({
                to: invoice.user.email,
                subject: job.payload.subject ?? `Invoice ${invoice.invoiceNumber}`,
                text: `Invoice ${invoice.invoiceNumber} for ${invoice.total.toFixed(2)} SEK is available.`,
                html: (0, email_1.getInvoiceEmailTemplate)({
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
            const invoice = await client_1.prisma.invoice.findUnique({
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
                logger_1.logger.warn('Reminder email skipped - recipient missing', {
                    invoiceId: job.payload.invoiceId,
                    reminderId: job.payload.reminderId,
                });
                return;
            }
            let reminderMessage;
            const reminderStore = await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.reminders);
            reminderMessage = reminderStore?.records.find((r) => r.id === job.payload.reminderId)?.message;
            const dueDate = invoice.dueDate.toISOString().slice(0, 10);
            const reminderText = `Reminder: invoice ${invoice.invoiceNumber} (${invoice.total.toFixed(2)} SEK) is due ${dueDate}.`;
            const channel = (job.payload.channel ?? 'email').toLowerCase();
            if (channel === 'sms' && invoice.user.phone) {
                await (0, compatSmsJobRunner_1.processCompatSmsSend)({
                    to: invoice.user.phone,
                    rawTo: invoice.user.phone,
                    message: reminderText,
                    targetUserId: invoice.user.id,
                });
                return;
            }
            if (!invoice.user.email) {
                logger_1.logger.warn('Reminder email skipped - no email on recipient', {
                    invoiceId: job.payload.invoiceId,
                    reminderId: job.payload.reminderId,
                });
                return;
            }
            await (0, email_1.sendEmail)({
                to: invoice.user.email,
                subject: `Reminder: invoice ${invoice.invoiceNumber} is due`,
                text: reminderText,
                html: (0, email_1.getReminderEmailTemplate)({
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
//# sourceMappingURL=jobHandlers.js.map