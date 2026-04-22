import { Request, Response } from 'express';
/**
 * Mirrors `hemsolutions/app/api/invoices.php` — raw JSON, snake_case monetary fields on list/detail.
 */
export declare function handleInvoices(req: Request, res: Response): Promise<void>;
