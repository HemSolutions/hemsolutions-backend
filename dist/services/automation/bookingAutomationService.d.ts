import type { Booking } from '@prisma/client';
/**
 * Orchestrates post-create booking side-effects (assignment, thread, etc.).
 */
export declare function runAfterBookingPersisted(booking: Booking): Promise<void>;
export declare function ensureInitialMessageThread(bookingId: string, userId: string): Promise<void>;
