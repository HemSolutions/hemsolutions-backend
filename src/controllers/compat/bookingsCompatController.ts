import { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { compatJson } from './compatHttp';
import { bookingToPhp, utcYmd } from './mappers';
import * as bookingDomainService from '../../domain/bookingDomainService';
import {
  compatCacheKey,
  compatGetJson,
  compatSetJson,
} from '../../services/cache/compatCache';

const bookingInclude = {
  user: { select: { firstName: true, lastName: true, email: true, phone: true } },
  service: { select: { name: true } },
  worker: { select: { firstName: true, lastName: true } },
} as const;

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function endOfUtcDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

/**
 * Mirrors `hemsolutions/app/api/bookings.php` — query `id`, `worker_id`, `start`+`end`, raw arrays/objects.
 */
export async function handleBookings(req: Request, res: Response): Promise<void> {
  try {
    const method = req.method;

    if (method === 'GET') {
      const id = req.query.id as string | undefined;
      if (id) {
        const b = await prisma.booking.findUnique({
          where: { id },
          include: bookingInclude,
        });
        if (!b) {
          compatJson(res, { error: 'Bokning hittades inte' }, 404);
          return;
        }
        compatJson(res, bookingToPhp(b));
        return;
      }

      const workerId = req.query.worker_id as string | undefined;
      const startQ = req.query.start as string | undefined;
      const endQ = req.query.end as string | undefined;
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
      const limit = Math.max(1, Math.min(2000, parseInt(String(req.query.limit ?? '500'), 10) || 500));
      const skip = (page - 1) * limit;

      let start: string;
      let end: string;
      if (startQ && endQ) {
        start = startQ;
        end = endQ;
      } else {
        const now = new Date();
        const y = now.getUTCFullYear();
        const m = now.getUTCMonth();
        start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const endD = new Date(Date.UTC(y, m + 3, 0));
        end = utcYmd(endD);
      }

      const rangeStart = parseYmd(start);
      const rangeEnd = endOfUtcDay(end);

      const where: Prisma.BookingWhereInput = {
        scheduledDate: { gte: rangeStart, lte: rangeEnd },
        ...(workerId ? { workerId } : {}),
      };

      const cacheKey = compatCacheKey('bookings', { start, end, workerId: workerId ?? '', page, limit });
      const cached = await compatGetJson<Record<string, unknown>[]>(cacheKey, 'short');
      if (cached) {
        compatJson(res, cached);
        return;
      }

      const rows = await prisma.booking.findMany({
        where,
        include: bookingInclude,
        orderBy: { scheduledDate: 'asc' },
        skip,
        take: limit,
      });

      const out = rows.map((b) => bookingToPhp(b));
      await compatSetJson(cacheKey, out, 'short');
      compatJson(res, out);
      return;
    }

    if (method === 'POST') {
      const data = req.body as Record<string, unknown>;
      try {
        const full = await bookingDomainService.createCompatBookingWithInvoice(data);
        compatJson(res, bookingToPhp(full));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Server error';
        const status =
          msg === 'Tjänst hittades inte' || msg === 'Arbetare hittades inte' ? 404 : 400;
        compatJson(res, { error: msg }, status);
      }
      return;
    }

    if (method === 'PUT') {
      const id = req.query.id as string | undefined;
      if (!id) {
        compatJson(res, { error: 'ID krävs' }, 400);
        return;
      }
      const data = req.body as Record<string, unknown>;
      try {
        const full = await bookingDomainService.updateCompatBooking(id, data);
        compatJson(res, bookingToPhp(full));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Server error';
        compatJson(res, { error: msg }, msg === 'Bokning hittades inte' ? 404 : 400);
      }
      return;
    }

    if (method === 'DELETE') {
      const id = req.query.id as string | undefined;
      if (!id) {
        compatJson(res, { error: 'ID krävs' }, 400);
        return;
      }
      try {
        await bookingDomainService.deleteCompatBookingCascade(id);
        compatJson(res, { id, deleted: 1 });
      } catch (e) {
        compatJson(res, { error: 'Server error' }, 500);
      }
      return;
    }

    compatJson(res, { error: 'Method not allowed' }, 405);
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('compat bookings:', e);
    }
    compatJson(res, { error: 'Server error' }, 500);
  }
}
