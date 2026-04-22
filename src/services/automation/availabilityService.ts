import type { Booking } from '@prisma/client';
import { prisma } from '../../prisma/client';

/**
 * Calendar + clock window for a booking (local date parts from `scheduledDate` + `scheduledTime`).
 */
export function getBookingTimeWindow(booking: Booking): { start: Date; end: Date } {
  const d = new Date(booking.scheduledDate);
  const [hours, minutes] = booking.scheduledTime.split(':').map((v) => parseInt(v, 10));
  const start = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    hours,
    minutes,
    0,
    0
  );
  const end = new Date(start.getTime() + booking.duration * 60 * 1000);
  return { start, end };
}

export function timeRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Returns bookings for the worker whose time window overlaps [start, end).
 */
export async function getConflictingBookings(
  workerId: string,
  start: Date,
  end: Date,
  excludeBookingId?: string
): Promise<Booking[]> {
  const rows = await prisma.booking.findMany({
    where: {
      workerId,
      status: { not: 'CANCELLED' },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
  });

  return rows.filter((b) => {
    const w = getBookingTimeWindow(b);
    return timeRangesOverlap(start, end, w.start, w.end);
  });
}

export async function isSlotFree(
  workerId: string,
  start: Date,
  end: Date,
  excludeBookingId?: string
): Promise<boolean> {
  const conflicts = await getConflictingBookings(workerId, start, end, excludeBookingId);
  return conflicts.length === 0;
}
