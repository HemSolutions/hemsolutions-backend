import type { Booking } from '@prisma/client';
/**
 * Calendar + clock window for a booking (local date parts from `scheduledDate` + `scheduledTime`).
 */
export declare function getBookingTimeWindow(booking: Booking): {
    start: Date;
    end: Date;
};
export declare function timeRangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean;
/**
 * Returns bookings for the worker whose time window overlaps [start, end).
 */
export declare function getConflictingBookings(workerId: string, start: Date, end: Date, excludeBookingId?: string): Promise<Booking[]>;
export declare function isSlotFree(workerId: string, start: Date, end: Date, excludeBookingId?: string): Promise<boolean>;
