"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onBookingCompleted = onBookingCompleted;
const client_1 = require("@prisma/client");
const client_2 = require("../../prisma/client");
const DEFAULT_TAX_RATE = 0.25;
const DUE_DAYS = 30;
function buildInvoiceNumber() {
    return `INV-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}
/**
 * When a booking is completed: ensure an invoice exists (idempotent).
 * - If an invoice already exists for this booking → no-op (no duplicate, no status change).
 * - Otherwise → create invoice linked to the booking, status SENT (unpaid), totals aligned with booking pricing.
 * Compatible with POST /api/invoices/:id/pay (uses existing Invoice row).
 */
async function onBookingCompleted(bookingId, userId) {
    await client_2.prisma.$transaction(async (tx) => {
        const existing = await tx.invoice.findUnique({
            where: { bookingId },
        });
        if (existing) {
            return;
        }
        const booking = await tx.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });
        if (!booking || booking.userId !== userId) {
            return;
        }
        const totalPrice = booking.totalPrice;
        const taxRate = DEFAULT_TAX_RATE;
        const subtotal = totalPrice / (1 + taxRate);
        const taxAmount = totalPrice - subtotal;
        const invoiceNumber = buildInvoiceNumber();
        const dueDate = new Date(Date.now() + DUE_DAYS * 24 * 60 * 60 * 1000);
        const itemCreates = [
            {
                description: booking.service.name,
                quantity: 1,
                unitPrice: booking.basePrice,
                total: booking.basePrice,
            },
        ];
        if (booking.extrasPrice > 0) {
            itemCreates.push({
                description: 'Extras',
                quantity: 1,
                unitPrice: booking.extrasPrice,
                total: booking.extrasPrice,
            });
        }
        try {
            await tx.invoice.create({
                data: {
                    bookingId: booking.id,
                    userId: booking.userId,
                    invoiceNumber,
                    subtotal,
                    taxRate,
                    taxAmount,
                    total: totalPrice,
                    status: 'SENT',
                    dueDate,
                    items: {
                        create: itemCreates,
                    },
                },
            });
        }
        catch (err) {
            if (err instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002') {
                return;
            }
            throw err;
        }
    });
}
//# sourceMappingURL=invoiceAutomationService.js.map