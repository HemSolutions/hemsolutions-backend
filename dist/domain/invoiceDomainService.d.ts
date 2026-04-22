import type { Prisma } from '@prisma/client';
type ReceiptItem = {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    article_id?: string | null;
};
export type CompatReceiptRecord = {
    id: string;
    invoiceId: string;
    receiptNumber: string;
    customerId: string;
    issueDate: string;
    totalAmount: number;
    vatAmount: number;
    paymentMethod?: string;
    items: ReceiptItem[];
    createdAt: string;
};
declare const invoiceDetailInclude: {
    readonly user: {
        readonly select: {
            readonly firstName: true;
            readonly lastName: true;
            readonly email: true;
            readonly phone: true;
        };
    };
    readonly items: true;
    readonly booking: {
        readonly include: {
            readonly address: true;
        };
    };
};
export type InvoiceWithDetailInclude = Prisma.InvoiceGetPayload<{
    include: typeof invoiceDetailInclude;
}>;
export declare function createCompatInvoiceFromBody(data: Record<string, unknown>): Promise<InvoiceWithDetailInclude>;
export declare function updateCompatInvoice(id: string, data: Record<string, unknown>): Promise<InvoiceWithDetailInclude>;
export declare function deleteCompatInvoice(id: string): Promise<void>;
export declare function createCompatReceiptFromInvoice(body: Record<string, unknown>): Promise<CompatReceiptRecord>;
export {};
//# sourceMappingURL=invoiceDomainService.d.ts.map