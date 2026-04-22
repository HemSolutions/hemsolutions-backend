interface EmailData {
    to: string;
    subject: string;
    text?: string;
    html: string;
}
export declare function sendEmail(data: EmailData): Promise<void>;
export type InvoiceEmailTemplateInput = {
    customerName: string;
    invoiceNumber: string;
    dueDate: Date;
    total: number;
    status: string;
    paymentUrl?: string;
};
export declare function getInvoiceEmailTemplate(input: InvoiceEmailTemplateInput): string;
export type ReminderEmailTemplateInput = {
    customerName: string;
    invoiceNumber: string;
    dueDate: Date;
    total: number;
    message?: string;
    paymentUrl?: string;
};
export declare function getReminderEmailTemplate(input: ReminderEmailTemplateInput): string;
export declare function getPasswordResetEmailTemplate(resetUrl: string, firstName: string): string;
export declare function getBookingConfirmationEmailTemplate(firstName: string, serviceName: string, date: string, time: string): string;
export {};
