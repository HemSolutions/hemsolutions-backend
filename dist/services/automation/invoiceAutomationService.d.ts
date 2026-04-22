/**
 * When a booking is completed: ensure an invoice exists (idempotent).
 * - If an invoice already exists for this booking → no-op (no duplicate, no status change).
 * - Otherwise → create invoice linked to the booking, status SENT (unpaid), totals aligned with booking pricing.
 * Compatible with POST /api/invoices/:id/pay (uses existing Invoice row).
 */
export declare function onBookingCompleted(bookingId: string, userId: string): Promise<void>;
//# sourceMappingURL=invoiceAutomationService.d.ts.map