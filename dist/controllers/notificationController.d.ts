import { Request, Response } from 'express';
export declare function getNotifications(req: Request, res: Response): Promise<void>;
export declare function markAsRead(req: Request, res: Response): Promise<void>;
export declare function markAllAsRead(req: Request, res: Response): Promise<void>;
export declare function getUnreadCount(req: Request, res: Response): Promise<void>;
export declare function deleteNotification(req: Request, res: Response): Promise<void>;
