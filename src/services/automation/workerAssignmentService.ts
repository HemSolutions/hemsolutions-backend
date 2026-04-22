import type { Booking, Service, WorkerSchedule } from '@prisma/client';
import { prisma } from '../../prisma/client';
import * as availabilityService from './availabilityService';

function scheduleCoversWindow(
  schedules: Pick<WorkerSchedule, 'dayOfWeek' | 'startTime' | 'endTime' | 'isActive'>[],
  windowStart: Date,
  windowEnd: Date
): boolean {
  const dayOfWeek = windowStart.getDay();
  const sched = schedules.find((s) => s.dayOfWeek === dayOfWeek && s.isActive);
  if (!sched) {
    return false;
  }

  const y = windowStart.getFullYear();
  const mo = windowStart.getMonth();
  const d = windowStart.getDate();
  const [sh, sm] = sched.startTime.split(':').map((x) => parseInt(x, 10));
  const [eh, em] = sched.endTime.split(':').map((x) => parseInt(x, 10));
  const scheduleStart = new Date(y, mo, d, sh, sm, 0, 0);
  const scheduleEnd = new Date(y, mo, d, eh, em, 0, 0);

  if (scheduleEnd.getTime() <= scheduleStart.getTime()) {
    return false;
  }

  return (
    windowStart.getTime() >= scheduleStart.getTime() &&
    windowEnd.getTime() <= scheduleEnd.getTime()
  );
}

/**
 * Auto-assign workers and enforce no double-booking.
 */
export async function assignWorkerIfEligible(
  booking: Booking,
  service: Service
): Promise<Booking | null> {
  void service;

  if (booking.workerId) {
    return prisma.booking.findUnique({ where: { id: booking.id } });
  }

  const { start, end } = availabilityService.getBookingTimeWindow(booking);
  const dayOfWeek = start.getDay();

  const workers = await prisma.worker.findMany({
    where: {
      isActive: true,
      schedules: {
        some: {
          dayOfWeek,
          isActive: true,
        },
      },
    },
    include: {
      schedules: {
        where: {
          dayOfWeek,
          isActive: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  for (const worker of workers) {
    if (!scheduleCoversWindow(worker.schedules, start, end)) {
      continue;
    }

    const free = await availabilityService.isSlotFree(worker.id, start, end, booking.id);
    if (!free) {
      continue;
    }

    return prisma.booking.update({
      where: { id: booking.id },
      data: {
        workerId: worker.id,
        status: 'ASSIGNED',
      },
    });
  }

  return null;
}

export async function assertNoCollision(workerId: string, booking: Booking): Promise<void> {
  const { start, end } = availabilityService.getBookingTimeWindow(booking);
  const conflicts = await availabilityService.getConflictingBookings(
    workerId,
    start,
    end,
    booking.id
  );

  if (conflicts.length > 0) {
    throw new Error('Worker has a conflicting booking in this time window');
  }
}
