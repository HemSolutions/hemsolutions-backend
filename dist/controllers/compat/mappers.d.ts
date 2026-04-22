import type { Address, Booking, Invoice, InvoiceItem, Service, User, Worker } from '@prisma/client';
/** yyyy-mm-dd in UTC (matches typical stored booking dates). */
export declare function utcYmd(d: Date): string;
export declare function bookingStatusToPhp(status: Booking['status']): string;
export declare function phpStatusToBookingStatus(status: string): Booking['status'] | null;
export declare function invoiceStatusToPhp(status: Invoice['status']): string;
export declare function phpInvoiceStatusToPrisma(status: string): Invoice['status'] | null;
export declare function userToPhpCustomer(u: User, addr: Address | null, customerNumber: string): Record<string, unknown>;
export declare function buildBookingStartTime(b: Booking): string;
export declare function buildBookingEndTime(b: Booking): string;
type BookingWithJoins = Booking & {
    user: Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'>;
    service: Pick<Service, 'name'>;
    worker: Pick<Worker, 'firstName' | 'lastName'> | null;
};
export declare function bookingToPhp(b: BookingWithJoins): Record<string, unknown>;
type InvoiceListRow = Invoice & {
    user: Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'>;
};
export declare function invoiceToPhpListRow(inv: InvoiceListRow): Record<string, unknown>;
type InvoiceDetailRow = Invoice & {
    user: Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'>;
    items: InvoiceItem[];
    booking?: (Booking & {
        address: Address;
    }) | null;
};
export declare function invoiceToPhpDetail(inv: InvoiceDetailRow): Record<string, unknown>;
export declare function workerToPhp(w: Worker): Record<string, unknown>;
/** Article row (Service) — matches `hemsolutions` Article / articles.php list. */
export declare function serviceToPhpArticle(s: Service): Record<string, unknown>;
export type CompatReminderStoreRow = {
    id: string;
    invoiceId: string;
    status: string;
    reminderLevel?: number;
    feeAmount?: number;
    message?: string;
    createdAt: string;
    updatedAt?: string;
};
type InvoiceMini = {
    invoiceNumber: string;
    userId: string;
    total: number;
    dueDate: Date;
    user: {
        firstName: string;
        lastName: string;
    };
};
export declare function reminderCompatToPhp(r: CompatReminderStoreRow, inv: InvoiceMini | null): Record<string, unknown>;
export type CompatPaymentStoreRow = {
    id: string;
    invoiceId: string;
    customerId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    reference?: string;
    createdAt: string;
};
export declare function paymentCompatToPhp(p: CompatPaymentStoreRow, inv: {
    invoiceNumber: string;
    user: {
        firstName: string;
        lastName: string;
    };
} | null): Record<string, unknown>;
export type CompatReceiptStoreItem = {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    article_id?: string | null;
};
export type CompatReceiptStoreRow = {
    id: string;
    invoiceId: string;
    receiptNumber: string;
    customerId: string;
    issueDate: string;
    totalAmount: number;
    vatAmount: number;
    paymentMethod?: string;
    items: CompatReceiptStoreItem[];
    createdAt: string;
};
export declare function receiptCompatToPhp(r: CompatReceiptStoreRow, customerName: string): Record<string, unknown>;
export {};
