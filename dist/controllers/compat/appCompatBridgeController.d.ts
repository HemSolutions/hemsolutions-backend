import type { Request, Response } from 'express';
export declare function handleMessages(req: Request, res: Response): Promise<void>;
export declare function handleReminders(req: Request, res: Response): Promise<void>;
export declare function handlePayments(req: Request, res: Response): Promise<void>;
export declare function handleReceipts(req: Request, res: Response): Promise<void>;
export declare function handleSettings(req: Request, res: Response): Promise<void>;
export declare function handleArticles(req: Request, res: Response): Promise<void>;
export declare function handleAdminSegment(req: Request, res: Response): Promise<void>;
