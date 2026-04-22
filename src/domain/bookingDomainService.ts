import type { Booking, BookingStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { emitDomainEvent } from './internalEvents';
import { phpStatusToBookingStatus } from '../controllers/compat/mappers';
import {
  invalidateCompatBookings,
  invalidateCompatDashboard,
  invalidateCompatInvoices,
} from '../services/cache/compatCache';

const bookingInclude = {
  user: { select: { firstName: true, lastName: true, email: true, phone: true } },
  service: { select: { name: true } },
  worker: { select: { firstName: true, lastName: true } },
} as const;

export type BookingWithPhpJoins = Booking & {
  user: { firstName: string; lastName: string; email: string; phone: string | null };
  service: { name: string };
  worker: { firstName: string; lastName: string } | null;
};

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/**
 * Single mutation path for compat/admin-style booking creates (includes initial invoice).
 */
export async function createCompatBookingWithInvoice(data: Record<string, unknown>): Promise<BookingWithPhpJoins> {
  const workerId = String(data.worker_id ?? '').trim();
  const userId = String(data.customer_id ?? '').trim();
  const serviceId = String(data.service_id ?? '').trim();
  const startTime = String(data.start_time ?? '').trim();
  if (!workerId) throw new Error('worker_id krävs');
  if (!userId) throw new Error('customer_id krävs');
  if (!serviceId) throw new Error('service_id krävs');
  if (!startTime) throw new Error('start_time krävs');

  const address = await prisma.address.findFirst({
    where: { userId },
    orderBy: { isDefault: 'desc' },
  });
  if (!address) {
    throw new Error('Kunden saknar adress');
  }

  const service = await prisma.service.findFirst({ where: { id: serviceId, isActive: true } });
  if (!service) {
    throw new Error('Tjänst hittades inte');
  }

  const worker = await prisma.worker.findFirst({ where: { id: workerId, isActive: true } });
  if (!worker) {
    throw new Error('Arbetare hittades inte');
  }

  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/.exec(startTime);
  if (!m) {
    throw new Error('Ogiltigt start_time-format');
  }
  const datePart = m[1];
  const timePart = m[2];
  const scheduledDate = parseYmd(datePart);
  const durationHours = Number(data.duration_hours ?? 1) + Number(data.duration_minutes ?? 0) / 60;
  const durationMinutes = Math.max(15, Math.round(durationHours * 60));

  const phpStatus = phpStatusToBookingStatus(String(data.status ?? 'pending'));
  const status: BookingStatus = phpStatus ?? 'PENDING';

  const basePrice = service.price;
  const totalPrice = basePrice;
  const taxRate = 0.25;
  const subtotal = totalPrice / (1 + taxRate);
  const taxAmount = totalPrice - subtotal;

  const { bookingId, invoiceId } = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        userId,
        serviceId,
        addressId: address.id,
        workerId,
        scheduledDate,
        scheduledTime: timePart,
        duration: durationMinutes,
        basePrice,
        extrasPrice: 0,
        discount: 0,
        totalPrice,
        notes: String(data.notes ?? ''),
        status,
        paymentStatus: 'PENDING',
      },
      include: bookingInclude,
    });

    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const inv = await tx.invoice.create({
      data: {
        bookingId: booking.id,
        userId,
        invoiceNumber,
        subtotal,
        taxRate,
        taxAmount,
        total: totalPrice,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'SENT',
        items: {
          create: [
            {
              description: service.name,
              quantity: 1,
              unitPrice: basePrice,
              total: basePrice,
            },
          ],
        },
      },
    });

    return { bookingId: booking.id, invoiceId: inv.id };
  });

  const full = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude,
  });
  if (!full) {
    throw new Error('Bokning kunde inte läsas');
  }

  await emitDomainEvent({ type: 'booking.created', payload: { bookingId: full.id, userId: full.userId } });
  await emitDomainEvent({
    type: 'invoice.created',
    payload: { invoiceId, bookingId: full.id },
  });

  void invalidateCompatBookings();
  void invalidateCompatInvoices();
  void invalidateCompatDashboard();

  return full as BookingWithPhpJoins;
}

export async function updateCompatBooking(id: string, data: Record<string, unknown>): Promise<BookingWithPhpJoins> {
  const existing = await prisma.booking.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('Bokning hittades inte');
  }

  let scheduledDate = existing.scheduledDate;
  let scheduledTime = existing.scheduledTime;
  if (data.start_time != null) {
    const st = String(data.start_time);
    const mm = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/.exec(st);
    if (mm) {
      scheduledDate = parseYmd(mm[1]);
      scheduledTime = mm[2];
    }
  }

  const durationMinutes =
    data.duration_hours != null ? Math.max(15, Math.round(Number(data.duration_hours) * 60)) : existing.duration;

  const statusUpd = data.status != null ? phpStatusToBookingStatus(String(data.status)) : null;

  await prisma.booking.update({
    where: { id },
    data: {
      ...(data.customer_id != null ? { userId: String(data.customer_id) } : {}),
      ...(data.worker_id != null ? { workerId: String(data.worker_id) } : {}),
      ...(data.service_id != null ? { serviceId: String(data.service_id) } : {}),
      scheduledDate,
      scheduledTime,
      duration: durationMinutes,
      ...(statusUpd ? { status: statusUpd } : {}),
      ...(data.notes != null ? { notes: String(data.notes) } : {}),
    },
  });

  const full = await prisma.booking.findUnique({ where: { id }, include: bookingInclude });
  if (!full) {
    throw new Error('Bokning hittades inte');
  }

  await emitDomainEvent({ type: 'booking.updated', payload: { bookingId: id } });
  if (statusUpd === 'COMPLETED' && existing.status !== 'COMPLETED') {
    await emitDomainEvent({
      type: 'booking.completed',
      payload: { bookingId: id, userId: full.userId },
    });
  }

  void invalidateCompatBookings();
  void invalidateCompatDashboard();

  return full as BookingWithPhpJoins;
}

export async function deleteCompatBookingCascade(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.message.deleteMany({ where: { bookingId: id } });
    await tx.review.deleteMany({ where: { bookingId: id } });
    await tx.invoice.deleteMany({ where: { bookingId: id } });
    await tx.booking.delete({ where: { id } });
  });
  await emitDomainEvent({ type: 'booking.deleted', payload: { bookingId: id } });
  void invalidateCompatBookings();
  void invalidateCompatInvoices();
  void invalidateCompatDashboard();
}

/** Admin API worker lifecycle — centralized here to keep controllers thin. */
export async function adminCreateWorker(body: Record<string, unknown>) {
  const { firstName, lastName, email, phone, skills, bio } = body as Record<string, unknown>;
  const existing = await prisma.worker.findUnique({ where: { email: String(email) } });
  if (existing) {
    throw new Error('WORKER_EMAIL_EXISTS');
  }
  return prisma.worker.create({
    data: {
      firstName: String(firstName),
      lastName: String(lastName),
      email: String(email),
      phone: String(phone),
      skills: (skills as string[]) || [],
      bio: bio != null ? String(bio) : undefined,
    },
  });
}

export async function adminUpdateWorker(id: string, body: Record<string, unknown>) {
  const { firstName, lastName, phone, skills, bio, isActive } = body;
  return prisma.worker.update({
    where: { id },
    data: {
      firstName: firstName != null ? String(firstName) : undefined,
      lastName: lastName != null ? String(lastName) : undefined,
      phone: phone != null ? String(phone) : undefined,
      skills: skills as string[] | undefined,
      bio: bio != null ? String(bio) : undefined,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
    },
  });
}

export async function adminDeleteWorker(id: string): Promise<void> {
  const activeBookings = await prisma.booking.count({
    where: {
      workerId: id,
      status: { in: ['CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'] },
    },
  });
  if (activeBookings > 0) {
    throw new Error('ACTIVE_BOOKINGS');
  }
  await prisma.worker.delete({ where: { id } });
}
