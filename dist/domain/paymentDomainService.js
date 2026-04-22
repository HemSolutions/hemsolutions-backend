"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordCompatPayment = recordCompatPayment;
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const appCompatJsonStore_1 = require("../services/compat/appCompatJsonStore");
const idempotencyService_1 = require("../services/idempotencyService");
const internalEvents_1 = require("./internalEvents");
const compatCache_1 = require("../services/cache/compatCache");
function parsePaymentStore(raw) {
    if (raw && typeof raw === 'object' && 'records' in raw) {
        const recs = raw.records;
        if (Array.isArray(recs))
            return { records: recs };
    }
    return { records: [] };
}
/**
 * Ledger entry must always reference an invoice; invoice PAID + booking paymentStatus updated in the same DB transaction as the ledger append.
 */
async function recordCompatPayment(body, idempotencyKey) {
    const key = (0, idempotencyService_1.requireIdempotencyKey)(idempotencyKey);
    return (0, idempotencyService_1.withPaymentIdempotency)(key, async () => {
        const invoiceId = String(body.invoice_id ?? '');
        const amount = Number(body.amount ?? 0);
        if (!invoiceId || amount <= 0) {
            throw new Error('invoice_id and positive amount required');
        }
        const { rec, becamePaid } = await client_2.prisma.$transaction(async (tx) => {
            const inv = await tx.invoice.findUnique({
                where: { id: invoiceId },
                include: { booking: true },
            });
            if (!inv) {
                throw new Error('Invoice not found');
            }
            const paymentDate = String(body.payment_date ?? new Date().toISOString().slice(0, 10));
            const rec = {
                id: (0, crypto_1.randomUUID)(),
                invoiceId,
                customerId: inv.userId,
                amount,
                paymentDate,
                paymentMethod: String(body.payment_method ?? 'bank_transfer'),
                reference: body.reference != null ? String(body.reference) : undefined,
                createdAt: new Date().toISOString(),
            };
            const row = await tx.adminSettings.findUnique({ where: { key: appCompatJsonStore_1.KEYS.payments } });
            const cur = parsePaymentStore(row?.value);
            const next = { records: [...cur.records, rec] };
            await tx.adminSettings.upsert({
                where: { key: appCompatJsonStore_1.KEYS.payments },
                create: { key: appCompatJsonStore_1.KEYS.payments, value: next },
                update: { value: next },
            });
            const paid = next.records.filter((p) => p.invoiceId === invoiceId).reduce((s, p) => s + p.amount, 0);
            let becamePaid = false;
            if (paid + 1e-6 >= inv.total && inv.status !== client_1.InvoiceStatus.PAID) {
                const now = new Date();
                await tx.invoice.update({
                    where: { id: invoiceId },
                    data: { status: client_1.InvoiceStatus.PAID, paidAt: now },
                });
                if (inv.bookingId) {
                    await tx.booking.update({
                        where: { id: inv.bookingId },
                        data: { paymentStatus: client_1.PaymentStatus.PAID },
                    });
                }
                becamePaid = true;
            }
            return { rec, becamePaid };
        });
        await (0, internalEvents_1.emitDomainEvent)({
            type: becamePaid ? 'payment.succeeded' : 'payment.recorded',
            payload: { paymentId: rec.id, invoiceId, amount: rec.amount },
        });
        void (0, compatCache_1.invalidateCompatInvoices)();
        void (0, compatCache_1.invalidateCompatBookings)();
        void (0, compatCache_1.invalidateCompatDashboard)();
        return rec;
    });
}
//# sourceMappingURL=paymentDomainService.js.map