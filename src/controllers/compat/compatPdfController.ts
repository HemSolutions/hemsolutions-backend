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

function pdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

async function assertInvoiceAccess(req: Request, invoiceUserId: string): Promise<boolean> {
  const role = req.user?.role ?? '';
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
  return req.user?.userId === invoiceUserId;
}

async function assertReceiptAccess(req: Request, customerId: string): Promise<boolean> {
  const role = req.user?.role ?? '';
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
  return req.user?.userId === customerId;
}

/**
 * GET /api/compat/pdf/invoice|receipt — real PDF from Prisma invoice (+ compat receipt store).
 */
export async function handleCompatPdf(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).type('application/json').json({ error: 'Method not allowed' });
      return;
    }
    const resource = String(req.params.resource ?? '').replace(/\.php$/i, '');
    const id = String(req.query.id ?? '');
    if (!id) {
      res.status(400).type('application/json').json({ error: 'id required' });
      return;
    }

    const company = await loadCompanyBlock();

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
        res.status(404).type('application/json').json({ error: 'Invoice not found' });
        return;
      }
      if (!(await assertInvoiceAccess(req, inv.userId))) {
        res.status(403).type('application/json').json({ error: 'Forbidden' });
        return;
      }

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const customerName = `${inv.user.firstName} ${inv.user.lastName}`.trim();
      const addr = inv.booking?.address;

      doc.fontSize(10).text(company.name, { align: 'right' });
      if (company.address) doc.text(company.address, { align: 'right' });
      if (company.cityLine) doc.text(company.cityLine, { align: 'right' });
      if (company.phone) doc.text(`Tel: ${company.phone}`, { align: 'right' });
      if (company.email) doc.text(company.email, { align: 'right' });
      if (company.org) doc.text(`Org.nr: ${company.org}`, { align: 'right' });

      doc.moveDown(2);
      doc.fontSize(22).fillColor('#212529').text('FAKTURA');
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#333333');
      doc.text(`Fakturanummer: ${inv.invoiceNumber}`);
      doc.text(`Fakturadatum: ${utcYmd(inv.createdAt)}`);
      doc.text(`Förfallodatum: ${utcYmd(inv.dueDate)}`);
      doc.moveDown();

      doc.fontSize(12).text('Kund', { underline: true });
      doc.fontSize(10).text(customerName);
      if (addr) {
        doc.text(`${addr.street}, ${addr.zipCode} ${addr.city}`);
      }
      if (inv.user.email) doc.text(inv.user.email);
      if (inv.user.phone) doc.text(inv.user.phone);

      doc.moveDown();
      doc.fontSize(12).text('Fakturarader', { underline: true });
      doc.moveDown(0.3);
      const vatPct = Math.round(inv.taxRate * 100);
      doc.fontSize(9).fillColor('#495057');
      for (const it of inv.items) {
        doc.fillColor('#212529').fontSize(10);
        doc.text(
          `${it.description}  |  antal ${it.quantity}  |  à-pris ${it.unitPrice.toFixed(2)} SEK  |  moms ${vatPct}%  |  rad ${it.total.toFixed(2)} SEK`
        );
      }

      doc.moveDown();
      doc.fontSize(10).fillColor('#495057');
      doc.text(`Nettosumma: ${inv.subtotal.toFixed(2)} SEK`);
      doc.text(`Moms: ${inv.taxAmount.toFixed(2)} SEK`);
      doc.font('Helvetica-Bold').fillColor('#212529');
      doc.text(`Att betala: ${inv.total.toFixed(2)} SEK`);

      const buf = await pdfBuffer(doc);
      res
        .status(200)
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="invoice-${inv.invoiceNumber}.pdf"`)
        .send(buf);
      return;
    }

    if (resource === 'receipt') {
      const store = (await readJsonStore<ReceiptStore>(KEYS.receipts)) ?? { receipts: [] };
      const rec = store.receipts.find((r) => r.id === id);
      if (!rec) {
        res.status(404).type('application/json').json({ error: 'Receipt not found' });
        return;
      }
      if (!(await assertReceiptAccess(req, rec.customerId))) {
        res.status(403).type('application/json').json({ error: 'Forbidden' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: rec.customerId },
        select: { firstName: true, lastName: true },
      });
      const customerName = user ? `${user.firstName} ${user.lastName}`.trim() : '';

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.fontSize(10).text(company.name, { align: 'center' });
      doc.moveDown(2);
      doc.fontSize(24).fillColor('#212529').text('KVITTO', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).fillColor('#333333');
      doc.text(`Kvittonummer: ${rec.receiptNumber}`);
      doc.text(`Datum: ${rec.issueDate}`);
      doc.text(`Kund: ${customerName}`);
      doc.moveDown();

      doc.fontSize(12).text('Rader', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10);
      for (const it of rec.items) {
        doc.text(
          `${it.description}  |  antal ${it.quantity}  |  à-pris ${it.unitPrice.toFixed(2)} SEK  |  rad ${it.total.toFixed(2)} SEK`
        );
      }

      doc.moveDown();
      const subtotal = rec.totalAmount - rec.vatAmount;
      doc.fontSize(10).fillColor('#495057');
      doc.text(`Nettosumma: ${subtotal.toFixed(2)} SEK`);
      doc.text(`Moms: ${rec.vatAmount.toFixed(2)} SEK`);
      doc.font('Helvetica-Bold').fillColor('#212529');
      doc.text(`TOTALT: ${rec.totalAmount.toFixed(2)} SEK`);
      if (rec.paymentMethod) {
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9).fillColor('#333333');
        doc.text(`Betalningsmetod: ${rec.paymentMethod}`);
      }

      const buf = await pdfBuffer(doc);
      res
        .status(200)
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="receipt-${rec.receiptNumber}.pdf"`)
        .send(buf);
      return;
    }

    res.status(404).type('application/json').json({ error: 'Unknown PDF resource' });
  } catch (e) {
    console.error('compat pdf:', e);
    res.status(500).type('application/json').json({ error: e instanceof Error ? e.message : 'error' });
  }
}
