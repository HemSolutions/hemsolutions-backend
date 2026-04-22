import type { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { prisma } from '../../prisma/client';
import { KEYS, readJsonStore } from '../../services/compat/appCompatJsonStore';
import { utcYmd } from './mappers';

type SettingsBundle = {
  company: Record<string, unknown>;
  invoice: Record<string, unknown>;
  VAT: Record<string, unknown>;
  templates: Record<string, unknown>;
};

type ReceiptStore = {
  receipts: Array<{
    id: string;
    invoiceId: string;
    receiptNumber: string;
    customerId: string;
    issueDate: string;
    totalAmount: number;
    vatAmount: number;
    paymentMethod?: string;
    items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
    createdAt: string;
  }>;
};

function str(v: unknown, fallback = ''): string {
  if (v == null) return fallback;
  return String(v);
}

async function loadCompanyBlock(): Promise<{
  name: string;
  address: string;
  cityLine: string;
  phone: string;
  email: string;
  org: string;
}> {
  const bundle = (await readJsonStore<SettingsBundle>(KEYS.settingsBundle)) ?? null;
  const c = bundle?.company ?? {};

  return {
    name: str(c.company_name ?? c.name, 'HemSolutions'),
    address: str(c.address),
    cityLine: `${str(c.postal_code)} ${str(c.city)}`.trim(),
    phone: str(c.phone),
    email: str(c.email),
    org: str(c.org_number ?? c.orgNumber),
  };
}

/**
 * FIXED: no PDFKit namespace usage (this was breaking Render build)
 */
function pdfBuffer(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.end();
  });
}

async function assertInvoiceAccess(req: Request, invoiceUserId: string): Promise<boolean> {
  const role = (req as any).user?.role ?? '';
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
  return (req as any).user?.userId === invoiceUserId;
}

async function assertReceiptAccess(req: Request, customerId: string): Promise<boolean> {
  const role = (req as any).user?.role ?? '';
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
  return (req as any).user?.userId === customerId;
}

export async function handleCompatPdf(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const resource = String(req.params.resource ?? '').replace(/\.php$/i, '');
    const id = String(req.query.id ?? '');

    if (!id) {
      res.status(400).json({ error: 'id required' });
      return;
    }

    const company = await loadCompanyBlock();

    // ---------------- INVOICE ----------------
    if (resource === 'invoice') {
      const inv = await prisma.invoice.findUnique({
        where: { id },
        include: {
          items: true,
          user: { select: { firstName: true, lastName: true, email: true, phone: true } },
          booking: { include: { address: true } },
        },
      });

      if (!inv) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      if (!(await assertInvoiceAccess(req, inv.userId))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const doc = new PDFDocument({ size: 'A4', margin: 50 });

      const customerName = `${inv.user.firstName} ${inv.user.lastName}`.trim();
      const addr = inv.booking?.address;

      doc.fontSize(10).text(company.name, { align: 'right' });
      doc.moveDown();

      doc.fontSize(22).text('FAKTURA');
      doc.moveDown();

      doc.fontSize(10);
      doc.text(`Fakturanummer: ${inv.invoiceNumber}`);
      doc.text(`Fakturadatum: ${utcYmd(inv.createdAt)}`);
      doc.text(`Förfallodatum: ${utcYmd(inv.dueDate)}`);

      doc.moveDown();
      doc.text('Kund:');
      doc.text(customerName);

      if (addr) doc.text(`${addr.street}, ${addr.zipCode} ${addr.city}`);
      if (inv.user.email) doc.text(inv.user.email);
      if (inv.user.phone) doc.text(inv.user.phone);

      doc.moveDown();

      const vatPct = Math.round(inv.taxRate * 100);

      for (const it of inv.items) {
        doc.text(
          `${it.description} | ${it.quantity} x ${it.unitPrice.toFixed(
            2
          )} SEK | VAT ${vatPct}% | ${it.total.toFixed(2)} SEK`
        );
      }

      doc.moveDown();
      doc.text(`Subtotal: ${inv.subtotal.toFixed(2)} SEK`);
      doc.text(`VAT: ${inv.taxAmount.toFixed(2)} SEK`);
      doc.font('Helvetica-Bold').text(`TOTAL: ${inv.total.toFixed(2)} SEK`);

      const buf = await pdfBuffer(doc);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="invoice-${inv.invoiceNumber}.pdf"`
      );
      res.send(buf);
      return;
    }

    // ---------------- RECEIPT ----------------
    if (resource === 'receipt') {
      const store = (await readJsonStore<ReceiptStore>(KEYS.receipts)) ?? { receipts: [] };
      const rec = store.receipts.find((r) => r.id === id);

      if (!rec) {
        res.status(404).json({ error: 'Receipt not found' });
        return;
      }

      if (!(await assertReceiptAccess(req, rec.customerId))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: rec.customerId },
        select: { firstName: true, lastName: true },
      });

      const customerName = user ? `${user.firstName} ${user.lastName}`.trim() : '';

      const doc = new PDFDocument({ size: 'A4', margin: 50 });

      doc.fontSize(10).text(company.name, { align: 'center' });
      doc.moveDown();

      doc.fontSize(22).text('KVITTO', { align: 'center' });
      doc.moveDown();

      doc.fontSize(10);
      doc.text(`Kvittonummer: ${rec.receiptNumber}`);
      doc.text(`Datum: ${rec.issueDate}`);
      doc.text(`Kund: ${customerName}`);

      doc.moveDown();

      for (const it of rec.items) {
        doc.text(
          `${it.description} | ${it.quantity} x ${it.unitPrice.toFixed(
            2
          )} SEK | ${it.total.toFixed(2)} SEK`
        );
      }

      doc.moveDown();

      const subtotal = rec.totalAmount - rec.vatAmount;

      doc.text(`Subtotal: ${subtotal.toFixed(2)} SEK`);
      doc.text(`VAT: ${rec.vatAmount.toFixed(2)} SEK`);
      doc.font('Helvetica-Bold').text(`TOTAL: ${rec.totalAmount.toFixed(2)} SEK`);

      if (rec.paymentMethod) {
        doc.moveDown();
        doc.font('Helvetica').text(`Payment: ${rec.paymentMethod}`);
      }

      const buf = await pdfBuffer(doc);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="receipt-${rec.receiptNumber}.pdf"`
      );
      res.send(buf);
      return;
    }

    res.status(404).json({ error: 'Unknown PDF resource' });
  } catch (e) {
    console.error('compat pdf:', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'error' });
  }
}