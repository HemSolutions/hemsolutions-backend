import { randomUUID } from 'crypto';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { KEYS } from '../services/compat/appCompatJsonStore';
import { requireIdempotencyKey, withPaymentIdempotency } from '../services/idempotencyService';
import { emitDomainEvent } from './internalEvents';
import {
  invalidateCompatBookings,
  invalidateCompatDashboard,
  invalidateCompatInvoices,
} from '../services/cache/compatCache';

export type CompatPaymentRecord = {
  id: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  reference?: string;
  createdAt: string;
};

type PaymentStore = { records: CompatPaymentRecord[] };

function parsePaymentStore(raw: unknown): PaymentStore {
  if (raw && typeof raw === 'object' && 'records' in (raw as object)) {
    const recs = (raw as PaymentStore).records;
    if (Array.isArray(recs)) return { records: recs as CompatPaymentRecord[] };
  }
  return { records: [] };
}

/**
 * Ledger entry must always reference an invoice; invoice PAID + booking paymentStatus updated in the same DB transaction as the ledger append.
 */
export async function recordCompatPayment(
  body: Record<string, unknown>,
  idempotencyKey: string | undefined
): Promise<CompatPaymentRecord> {
  const key = requireIdempotencyKey(idempotencyKey);

  return withPaymentIdempotency(key, async () => {
    const invoiceId = String(body.invoice_id ?? '');
    const amount = Number(body.amount ?? 0);
    if (!invoiceId || amount <= 0) {
      throw new Error('invoice_id and positive amount required');
    }

    const { rec, becamePaid } = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { booking: true },
      });
      if (!inv) {
        throw new Error('Invoice not found');
      }

      const paymentDate = String(body.payment_date ?? new Date().toISOString().slice(0, 10));
      const rec: CompatPaymentRecord = {
        id: randomUUID(),
        invoiceId,
        customerId: inv.userId,
        amount,
        paymentDate,
        paymentMethod: String(body.payment_method ?? 'bank_transfer'),
        reference: body.reference != null ? String(body.reference) : undefined,
        createdAt: new Date().toISOString(),
      };

      const row = await tx.adminSettings.findUnique({ where: { key: KEYS.payments } });
      const cur = parsePaymentStore(row?.value);
      const next: PaymentStore = { records: [...cur.records, rec] };

      await tx.adminSettings.upsert({
        where: { key: KEYS.payments },
        create: { key: KEYS.payments, value: next as object },
        update: { value: next as object },
      });

      const paid = next.records.filter((p) => p.invoiceId === invoiceId).reduce((s, p) => s + p.amount, 0);
      let becamePaid = false;
      if (paid + 1e-6 >= inv.total && inv.status !== InvoiceStatus.PAID) {
        const now = new Date();
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: InvoiceStatus.PAID, paidAt: now },
        });
        if (inv.bookingId) {
          await tx.booking.update({
            where: { id: inv.bookingId },
            data: { paymentStatus: PaymentStatus.PAID },
          });
        }
        becamePaid = true;
      }

      return { rec, becamePaid };
    });

    await emitDomainEvent({
      type: becamePaid ? 'payment.succeeded' : 'payment.recorded',
      payload: { paymentId: rec.id, invoiceId, amount: rec.amount },
    });

    void invalidateCompatInvoices();
    void invalidateCompatBookings();
    void invalidateCompatDashboard();

    return rec;
  });
}
