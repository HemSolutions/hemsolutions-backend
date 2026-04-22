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
/**
 * Ledger entry must always reference an invoice; invoice PAID + booking paymentStatus updated in the same DB transaction as the ledger append.
 */
export declare function recordCompatPayment(body: Record<string, unknown>, idempotencyKey: string | undefined): Promise<CompatPaymentRecord>;
