import type { Request, Response } from 'express';
/**
 * SMS via env provider when configured; otherwise simulated (still logged + in-app notification).
 * GET returns persisted log (newest first).
 */
export declare function handleSmsService(req: Request, res: Response): Promise<void>;
