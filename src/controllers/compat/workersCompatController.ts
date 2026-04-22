import { Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { compatJson } from './compatHttp';
import { workerToPhp } from './mappers';

/**
 * Mirrors `hemsolutions/app/api/workers.php` — raw JSON.
 */
export async function handleWorkers(req: Request, res: Response): Promise<void> {
  try {
    const method = req.method;

    if (method === 'GET') {
      const id = req.query.id as string | undefined;
      if (id) {
        const w = await prisma.worker.findUnique({ where: { id } });
        if (!w) {
          compatJson(res, { error: 'Arbetare hittades inte' }, 404);
          return;
        }
        compatJson(res, workerToPhp(w));
        return;
      }
      const workers = await prisma.worker.findMany({
        where: { isActive: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });
      compatJson(res, workers.map((w) => workerToPhp(w)));
      return;
    }

    if (method === 'POST') {
      const data = req.body as Record<string, unknown>;
      const name = String(data.name ?? '').trim();
      if (!name) {
        compatJson(res, { error: 'Namn krävs' }, 400);
        return;
      }
      const parts = name.split(/\s+/);
      const firstName = parts[0] ?? 'Worker';
      const lastName = parts.slice(1).join(' ') || '—';
      const email = String(
        data.email ?? `worker-${Date.now()}-${Math.floor(Math.random() * 1e6)}@compat.local`
      );
      const w = await prisma.worker.create({
        data: {
          firstName,
          lastName,
          email,
          phone: String(data.phone ?? '000000000'),
          isActive: (data.is_active ?? 1) === 1 || data.is_active === true,
        },
      });
      const created = await prisma.worker.findUnique({ where: { id: w.id } });
      compatJson(res, created ? workerToPhp(created) : workerToPhp(w), 201);
      return;
    }

    if (method === 'PUT') {
      const id = req.query.id as string | undefined;
      if (!id) {
        compatJson(res, { error: 'ID krävs' }, 400);
        return;
      }
      const data = req.body as Record<string, unknown>;
      const name = String(data.name ?? '').trim();
      if (!name) {
        compatJson(res, { error: 'Namn krävs' }, 400);
        return;
      }
      const parts = name.split(/\s+/);
      const firstName = parts[0] ?? 'Worker';
      const lastName = parts.slice(1).join(' ') || '—';
      await prisma.worker.update({
        where: { id },
        data: {
          firstName,
          lastName,
          email: data.email != null ? String(data.email) : undefined,
          phone: data.phone != null ? String(data.phone) : undefined,
          isActive:
            data.is_active !== undefined
              ? data.is_active === 1 || data.is_active === true
              : undefined,
        },
      });
      compatJson(res, { message: 'Arbetare uppdaterad' });
      return;
    }

    if (method === 'DELETE') {
      const id = req.query.id as string | undefined;
      if (!id) {
        compatJson(res, { error: 'ID krävs' }, 400);
        return;
      }
      await prisma.worker.update({
        where: { id },
        data: { isActive: false },
      });
      const soft = await prisma.worker.findUnique({ where: { id } });
      compatJson(res, soft ? workerToPhp(soft) : { id, is_active: 0 });
      return;
    }

    compatJson(res, { error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('compat workers:', e);
    compatJson(res, { error: e instanceof Error ? e.message : 'Server error' }, 500);
  }
}
