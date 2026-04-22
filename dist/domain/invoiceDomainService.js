"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCompatInvoiceFromBody = createCompatInvoiceFromBody;
exports.updateCompatInvoice = updateCompatInvoice;
exports.deleteCompatInvoice = deleteCompatInvoice;
exports.createCompatReceiptFromInvoice = createCompatReceiptFromInvoice;
const crypto_1 = require("crypto");
const client_1 = require("../prisma/client");
const mappers_1 = require("../controllers/compat/mappers");
const internalEvents_1 = require("./internalEvents");
const appCompatJsonStore_1 = require("../services/compat/appCompatJsonStore");
const compatCache_1 = require("../services/cache/compatCache");
const invoiceDetailInclude = {
    user: { select: { firstName: true, lastName: true, email: true, phone: true } },
    items: true,
    booking: { include: { address: true } },
};
async function createCompatInvoiceFromBody(data) {
    const bookingId = String(data.booking_id ?? '');
    const booking = await client_1.prisma.booking.findUnique({
        where: { id: bookingId },
        include: { service: true, user: true },
    });
    if (!booking) {
        throw new Error('Bokning hittades inte');
    }
    const existingInv = await client_1.prisma.invoice.findUnique({ where: { bookingId } });
    if (existingInv) {
        throw new Error('Faktura finns redan för denna bokning');
    }
    const customerId = String(data.customer_id ?? booking.userId);
    if (customerId !== booking.userId) {
        throw new Error('customer_id stämmer inte med bokningen');
    }
    const items = data.items ?? [];
    let totalAmount = 0;
    let vatAmount = 0;
    const lineCreates = [];
    if (items.length > 0) {
        for (const item of items) {
            const qty = Number(item.quantity ?? 1);
            const unit = Number(item.unit_price ?? 0);
            const lineTotal = qty * unit;
            const vatRate = Number(item.vat_rate ?? 25) / 100;
            totalAmount += lineTotal * (1 + vatRate);
            vatAmount += lineTotal * vatRate;
            lineCreates.push({
                description: String(item.article_name ?? item.description ?? 'Rad'),
                quantity: qty,
                unitPrice: unit,
                total: lineTotal,
            });
        }
    }
    else {
        const taxRate = 0.25;
        const total = booking.totalPrice;
        const sub = total / (1 + taxRate);
        const tax = total - sub;
        totalAmount = total;
        vatAmount = tax;
        lineCreates.push({
            description: booking.service.name,
            quantity: 1,
            unitPrice: booking.basePrice + booking.extrasPrice,
            total: booking.basePrice + booking.extrasPrice,
        });
    }
    const subtotal = totalAmount - vatAmount;
    const taxRate = subtotal > 0 ? vatAmount / subtotal : 0.25;
    const invoiceNumber = String(data.invoice_number ?? '').trim() ||
        `F-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const due = String(data.due_date ?? '');
    const dueDate = due ? new Date(`${due}T23:59:59.000Z`) : new Date(Date.now() + 30 * 864e5);
    const statusPrisma = (0, mappers_1.phpInvoiceStatusToPrisma)(String(data.status ?? 'draft')) ?? 'DRAFT';
    const full = await client_1.prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.create({
            data: {
                bookingId,
                userId: customerId,
                invoiceNumber,
                subtotal,
                taxRate,
                taxAmount: vatAmount,
                total: totalAmount,
                dueDate,
                status: statusPrisma,
                items: { create: lineCreates },
            },
        });
        const row = await tx.invoice.findUnique({
            where: { id: inv.id },
            include: invoiceDetailInclude,
        });
        if (!row) {
            throw new Error('Kunde inte läsa faktura');
        }
        return row;
    });
    await (0, internalEvents_1.emitDomainEvent)({ type: 'invoice.created', payload: { invoiceId: full.id, bookingId } });
    void (0, compatCache_1.invalidateCompatInvoices)();
    void (0, compatCache_1.invalidateCompatDashboard)();
    return full;
}
async function updateCompatInvoice(id, data) {
    const inv = await client_1.prisma.invoice.findUnique({ where: { id } });
    if (!inv) {
        throw new Error('Faktura hittades inte');
    }
    const updates = {};
    if (data.status != null) {
        const st = (0, mappers_1.phpInvoiceStatusToPrisma)(String(data.status));
        if (!st) {
            throw new Error('Ogiltig status');
        }
        updates.status = st;
    }
    if (data.due_date != null) {
        updates.dueDate = new Date(String(data.due_date));
    }
    if (data.vat_amount != null) {
        updates.taxAmount = Number(data.vat_amount);
    }
    const hasScalarUpdates = Object.keys(updates).length > 0;
    const hasItems = Array.isArray(data.items);
    if (!hasScalarUpdates && !hasItems) {
        throw new Error('Inga fält att uppdatera');
    }
    const updated = await client_1.prisma.$transaction(async (tx) => {
        if (hasScalarUpdates) {
            await tx.invoice.update({ where: { id }, data: updates });
        }
        if (hasItems) {
            await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
            for (const item of data.items) {
                const qty = Number(item.quantity ?? 1);
                const unit = Number(item.unit_price ?? 0);
                const lineTotal = qty * unit;
                await tx.invoiceItem.create({
                    data: {
                        invoiceId: id,
                        description: String(item.article_name ?? item.description ?? 'Rad'),
                        quantity: qty,
                        unitPrice: unit,
                        total: lineTotal,
                    },
                });
            }
            const rowItems = await tx.invoiceItem.findMany({ where: { invoiceId: id } });
            const subtotal = rowItems.reduce((s, it) => s + it.total, 0);
            const invRow = await tx.invoice.findUnique({ where: { id } });
            if (!invRow) {
                throw new Error('Faktura hittades inte');
            }
            const taxRt = invRow.taxRate;
            const taxAmount = subtotal * taxRt;
            await tx.invoice.update({
                where: { id },
                data: {
                    subtotal,
                    taxAmount,
                    total: subtotal + taxAmount,
                },
            });
        }
        const out = await tx.invoice.findUnique({
            where: { id },
            include: invoiceDetailInclude,
        });
        if (!out) {
            throw new Error('Faktura hittades inte');
        }
        return out;
    });
    await (0, internalEvents_1.emitDomainEvent)({ type: 'invoice.updated', payload: { invoiceId: id } });
    void (0, compatCache_1.invalidateCompatInvoices)();
    void (0, compatCache_1.invalidateCompatDashboard)();
    return updated;
}
async function deleteCompatInvoice(id) {
    const inv = await client_1.prisma.invoice.findUnique({ where: { id } });
    if (!inv) {
        throw new Error('Faktura hittades inte');
    }
    if (inv.status === 'PAID') {
        throw new Error('Kan inte ta bort betald faktura');
    }
    await client_1.prisma.invoice.delete({ where: { id } });
    await (0, internalEvents_1.emitDomainEvent)({ type: 'invoice.deleted', payload: { invoiceId: id } });
}
async function createCompatReceiptFromInvoice(body) {
    const invoiceId = String(body.invoice_id ?? '');
    const inv = await client_1.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { items: true, user: true },
    });
    if (!inv) {
        throw new Error('Invoice not found');
    }
    const now = new Date().toISOString();
    const receiptNumber = `R-${inv.invoiceNumber}-${Date.now()}`;
    const items = inv.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
    }));
    const rec = {
        id: (0, crypto_1.randomUUID)(),
        invoiceId,
        receiptNumber,
        customerId: inv.userId,
        issueDate: now.slice(0, 10),
        totalAmount: inv.total,
        vatAmount: inv.taxAmount,
        paymentMethod: String(body.payment_method ?? ''),
        items,
        createdAt: now,
    };
    await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.receipts, () => ({ receipts: [] }), (cur) => ({
        receipts: [...cur.receipts, rec],
    }));
    void (0, compatCache_1.invalidateCompatDashboard)();
    return rec;
}
//# sourceMappingURL=invoiceDomainService.js.map