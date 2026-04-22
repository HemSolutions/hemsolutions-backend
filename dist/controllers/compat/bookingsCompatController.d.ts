import { Request, Response } from 'express';
/**
 * Mirrors `hemsolutions/app/api/bookings.php` — query `id`, `worker_id`, `start`+`end`, raw arrays/objects.
 */
export declare function handleBookings(req: Request, res: Response): Promise<void>;
