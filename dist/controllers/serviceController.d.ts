import { Request, Response } from 'express';
export declare const createServiceValidation: import("express-validator").ValidationChain[];
export declare function getServices(req: Request, res: Response): Promise<void>;
export declare function getServiceBySlug(req: Request, res: Response): Promise<void>;
export declare function createService(req: Request, res: Response): Promise<void>;
export declare function updateService(req: Request, res: Response): Promise<void>;
export declare function deleteService(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=serviceController.d.ts.map