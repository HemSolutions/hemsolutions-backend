import { Request, Response } from 'express';
export declare const createBookingValidation: import("express-validator").ValidationChain[];
export declare function createBooking(req: Request, res: Response): Promise<void>;
export declare function getBookings(req: Request, res: Response): Promise<void>;
export declare function getBookingById(req: Request, res: Response): Promise<void>;
export declare function cancelBooking(req: Request, res: Response): Promise<void>;
export declare function assignWorker(req: Request, res: Response): Promise<void>;
export declare function getAllBookings(req: Request, res: Response): Promise<void>;
export declare function updateBookingStatus(req: Request, res: Response): Promise<void>;
