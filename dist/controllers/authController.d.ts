import { Request, Response } from 'express';
export declare const registerValidation: import("express-validator").ValidationChain[];
export declare const loginValidation: import("express-validator").ValidationChain[];
export declare const forgotPasswordValidation: import("express-validator").ValidationChain[];
export declare const resetPasswordValidation: import("express-validator").ValidationChain[];
export declare function register(req: Request, res: Response): Promise<void>;
export declare function login(req: Request, res: Response): Promise<void>;
export declare function logout(_req: Request, res: Response): Promise<void>;
export declare function refresh(req: Request, res: Response): Promise<void>;
export declare function forgotPassword(req: Request, res: Response): Promise<void>;
export declare function resetPassword(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=authController.d.ts.map