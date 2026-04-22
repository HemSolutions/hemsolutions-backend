import { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { compatJson } from './compatHttp';
import { invoiceToPhpDetail, invoiceToPhpListRow, phpInvoiceStatusToPrisma, utcYmd } from './mappers';
import * as invoiceDomainService from '../../domain/invoiceDomainService';
import {
  compatCacheKey,
  compatGetJson,
  compatSetJson,
} from '../../services/cache/compatCache';

/**
 * Mirrors `hemsolutions/app/api/invoices.php` — raw JSON, snake_case monetary fields on list/detail.
 */
export async function handleInvoices(req: Request, res: Response): Promise<void> {
  try {
    const method = req.method;

    if (method === 'GET') {
      if (req.query.action === 'stats') {
        const statsKey = compatCacheKey('invoices', { action: 'stats' });
        const statsHit = await compatGetJson<Record<string, unknown>>(statsKey, 'short');
        if (statsHit) {
          compatJson(res, statsHit);
          return;
        }
        const [total, draft, sent, paid, overdue, sumAll, sumOutstanding] = await Promise.all([
          prisma.invoice.count(),
          prisma.invoice.count({ where: { status: 'DRAFT' } }),
          prisma.invoice.count({ where: { status: 'SENT' } }),
          prisma.invoice.count({ where: { status: 'PAID' } }),
          prisma.invoice.count({ where: { status: 'OVERDUE' } }),
          prisma.invoice.aggregate({ _sum: { total: true } }),
          prisma.invoice.aggregate({
            where: { status: { in: ['SENT', 'OVERDUE', 'DRAFT'] } },
            _sum: { total: true },
          }),
        ]);
        const statsPayload = {
          total_count: total,
          draft_count: draft,
          sent_count: sent,
          paid_count: paid,
          overdue_count: overdue,
          total_amount: sumAll._sum.total ?? 0,
          outstanding_amount: sumOutstanding._sum.total ?? 0,
        };
        await compatSetJson(statsKey, statsPayload, 'short');
        compatJson(res, statsPayload);
        return;
      }

      const id = req.query.id as string | undefined;
      if (id) {
        const inv = await prisma.invoice.findUnique({
          where: { id },
          include: {
            user: { select: { firstName: true, lastName: true, email: true, phone: true } },
            items: true,
            booking: { include: { address: true } },
          },
        });
        if (!inv) {
          compatJson(res, { error: 'Faktura hittades inte' }, 404);
          return;
        }
        compatJson(res, invoiceToPhpDetail(inv));
        return;
      }

      const statusQ = req.query.status as string | undefined;
      const customerId = req.query.customer_id as string | undefined;
      const startDate = req.query.start_date as string | undefined;
      const endDate = req.query.end_date as string | undefined;
      const search = String(req.query.search ?? '').trim();

      const statusPrisma = statusQ ? phpInvoiceStatusToPrisma(statusQ) : null;
      if (statusQ && !statusPrisma) {
        compatJson(res, { error: 'Ogiltig status' }, 400);
        return;
      }

      const createdAtFilter: { gte?: Date; lte?: Date } = {};
      if (startDate) {
        createdAtFilter.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        createdAtFilter.lte = new Date(`${endDate}T23:59:59.999Z`);
      }

      const where: Prisma.InvoiceWhereInput = {
        ...(statusPrisma ? { status: statusPrisma } : {}),
        ...(customerId ? { userId: customerId } : {}),
        ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
        ...(search
          ? {
              OR: [
                { invoiceNumber: { contains: search, mode: 'insensitive' } },
                { user: { firstName: { contains: search, mode: 'insensitive' } } },
                { user: { lastName: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      };

      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
      const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? '100'), 10) || 100));
      const skip = (page - 1) * limit;

      const listKey = compatCacheKey('invoices', {
        list: true,
        statusQ: statusQ ?? '',
        customerId: customerId ?? '',
        startDate: startDate ?? '',
        endDate: endDate ?? '',
        search,
        page,
        limit,
      });
      const listHit = await compatGetJson<Record<string, unknown>[]>(listKey, 'medium');
      if (listHit) {
        compatJson(res, listHit);
        return;
      }

      const rows = await prisma.invoice.findMany({
        where,
        include: {
          user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      });

      const listOut = rows.map((r) => invoiceToPhpListRow(r));
      await compatSetJson(listKey, listOut, 'medium');
      compatJson(res, listOut);
      return;
    }

    if (method === 'POST') {
      const data = req.body as Record<string, unknown>;
      if (!String(data.booking_id ?? '').trim()) {
        compatJson(
          res,
          { error: 'booking_id krävs (Node kopplar faktura till bokning)' },
          400
        );
        return;
      }
      try {
        const full = await invoiceDomainService.createCompatInvoiceFromBody(data);
        compatJson(res, invoiceToPhpDetail(full), 201);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Server error';
        const status =
          msg === 'Bokning hittades inte'
            ? 404
            : msg === 'Faktura finns redan för denna bokning'
              ? 409
              : msg === 'customer_id stämmer inte med bokningen'
                ? 400
                : msg === 'Kunde inte läsa faktura'
                  ? 500
                  : 400;
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
        const updated = await invoiceDomainService.updateCompatInvoice(id, data);
        compatJson(res, invoiceToPhpDetail(updated));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Server error';
        const status =
          msg === 'Faktura hittades inte'
            ? 404
            : msg === 'Ogiltig status' || msg === 'Inga fält att uppdatera'
              ? 400
              : 400;
        compatJson(res, { error: msg }, status);
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
        await invoiceDomainService.deleteCompatInvoice(id);
        compatJson(res, { id, deleted: 1 });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Server error';
        const status = msg === 'Faktura hittades inte' ? 404 : msg.includes('betald') ? 400 : 400;
        compatJson(res, { error: msg }, status);
      }
      return;
    }

    compatJson(res, { error: 'Method not allowed' }, 405);
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('compat invoices:', e);
    }
    compatJson(res, { error: 'Server error' }, 500);
  }
}
