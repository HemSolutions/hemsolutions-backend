import { Request, Response } from 'express';
export declare const sendMessageValidation: import("express-validator").ValidationChain[];
export declare function getChatHistory(req: Request, res: Response): Promise<void>;
export declare function sendMessage(req: Request, res: Response): Promise<void>;
export declare function markMessagesAsRead(req: Request, res: Response): Promise<void>;
export declare function getConversations(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=messageController.d.ts.map