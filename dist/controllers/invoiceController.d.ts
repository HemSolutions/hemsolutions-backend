import { Request, Response } from 'express';
export declare function getInvoices(req: Request, res: Response): Promise<void>;
export declare function getInvoiceById(req: Request, res: Response): Promise<void>;
export declare function createPaymentIntentForInvoice(req: Request, res: Response): Promise<void>;
export declare function downloadInvoicePDF(req: Request, res: Response): Promise<void>;
export declare function handleStripeWebhook(req: Request, res: Response): Promise<void>;
