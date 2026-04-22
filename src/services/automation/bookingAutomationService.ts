import type { Booking } from '@prisma/client';
import { prisma } from '../../prisma/client';
import * as workerAssignmentService from './workerAssignmentService';

/**
 * Orchestrates post-create booking side-effects (assignment, thread, etc.).
 */
export async function runAfterBookingPersisted(booking: Booking): Promise<void> {

  const service = await prisma.service.findUnique({
    where: { id: booking.serviceId },
  });

  if (!service) {
    return;
  }

  await workerAssignmentService.assignWorkerIfEligible(booking, service);
  // TODO: calendar materialization, further notifications, socket refresh.
}

export async function ensureInitialMessageThread(
  bookingId: string,
  userId: string
): Promise<void> {
  void userId;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    return;
  }

  // TODO: create seed Message; requires valid senderId (User) for SYSTEM/welcome copy.
  void booking;
}
