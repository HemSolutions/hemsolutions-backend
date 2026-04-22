import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { UserRole } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { compatJson } from './compatHttp';
import { KEYS, mutateJsonStore, readJsonStore } from '../../services/compat/appCompatJsonStore';

type ReklamationComment = {
  id: string;
  author_type: 'admin' | 'worker' | 'customer';
  author_name: string;
  author_user_id?: string;
  content: string;
  created_at: string;
};

type ReklamationRecord = {
  id: string;
  customer_id: string;
  booking_id: string | null;
  title: string;
  description: string;
  status: 'new' | 'processing' | 'resolved' | 'rejected';
  images: string;
  share_with_customer: boolean;
  share_with_worker: boolean;
  assigned_to: string;
  comments: ReklamationComment[];
  created_at: string;
  updated_at: string;
};

type ReklamationStore = { records: ReklamationRecord[] };

function defaultStore(): ReklamationStore {
  return { records: [] };
}

async function customerName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  return u ? `${u.firstName} ${u.lastName}`.trim() : '';
}

function toListRow(r: ReklamationRecord, name: string): Record<string, unknown> {
  return {
    id: r.id,
    customer_id: r.customer_id,
    customer_name: name,
    booking_id: r.booking_id,
    title: r.title,
    description: r.description,
    status: r.status,
    images: r.images,
    share_with_customer: r.share_with_customer,
    share_with_worker: r.share_with_worker,
    assigned_to: r.assigned_to,
    comments: r.comments,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function authorFromReq(req: Request): { type: ReklamationComment['author_type']; name: string; userId?: string } {
  const role = req.user?.role ?? '';
  const uid = req.user?.userId;
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return { type: 'admin', name: 'Admin', userId: uid };
  }
  if (role === 'WORKER') {
    return { type: 'worker', name: 'Worker', userId: uid };
  }
  return { type: 'customer', name: 'Customer', userId: uid };
}

/**
 * Full CRUD + comments (AdminSettings JSON). Linked to Prisma User (customer) and optional Booking.
 * GET returns a raw array for ReklamationList.tsx.
 */
export async function handleReklamation(req: Request, res: Response): Promise<void> {
  try {
    const method = req.method;

    if (method === 'GET') {
      const id = String(req.query.id ?? '');
      const store = (await readJsonStore<ReklamationStore>(KEYS.reklamation)) ?? defaultStore();
      if (id) {
        const r = store.records.find((x) => x.id === id);
        if (!r) {
          compatJson(res, { error: 'Not found' }, 404);
          return;
        }
        const name = await customerName(r.customer_id);
        compatJson(res, toListRow(r, name));
        return;
      }
      const out: Record<string, unknown>[] = [];
      for (const r of store.records) {
        const name = await customerName(r.customer_id);
        out.push(toListRow(r, name));
      }
      out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      compatJson(res, out);
      return;
    }

    if (method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (String(body.action ?? '') === 'add_comment') {
        const rid = String(body.reklamation_id ?? '');
        const content = String(body.content ?? '').trim();
        if (!rid || !content) {
          compatJson(res, { error: 'reklamation_id and content required' }, 400);
          return;
        }
        const auth = authorFromReq(req);
        const comment: ReklamationComment = {
          id: randomUUID(),
          author_type: auth.type,
          author_name: auth.name,
          author_user_id: auth.userId,
          content,
          created_at: new Date().toISOString(),
        };
        await mutateJsonStore<ReklamationStore>(KEYS.reklamation, defaultStore, (cur) => {
          const records = cur.records.map((row) => {
            if (row.id !== rid) return row;
            return {
              ...row,
              comments: [...row.comments, comment],
              updated_at: new Date().toISOString(),
            };
          });
          if (!records.some((row) => row.id === rid)) {
            return cur;
          }
          return { records };
        });
        const after = (await readJsonStore<ReklamationStore>(KEYS.reklamation)) ?? defaultStore();
        const updated = after.records.find((x) => x.id === rid);
        if (!updated) {
          compatJson(res, { error: 'Not found' }, 404);
          return;
        }
        compatJson(res, {
          id: comment.id,
          reklamation_id: rid,
          author_type: comment.author_type,
          author_name: comment.author_name,
          content: comment.content,
          created_at: comment.created_at,
        });
        return;
      }

      const customerId = String(body.customer_id ?? '');
      const title = String(body.title ?? '').trim();
      const description = String(body.description ?? '').trim();
      if (!customerId || !title) {
        compatJson(res, { error: 'customer_id and title required' }, 400);
        return;
      }
      const u = await prisma.user.findFirst({
        where: { id: customerId, role: UserRole.CUSTOMER },
      });
      if (!u) {
        compatJson(res, { error: 'Customer not found' }, 404);
        return;
      }
      let bookingId: string | null = body.booking_id != null ? String(body.booking_id) : null;
      if (bookingId) {
        const b = await prisma.booking.findFirst({
          where: { id: bookingId, userId: customerId },
        });
        if (!b) {
          compatJson(res, { error: 'Booking not found for customer' }, 400);
          return;
        }
      } else {
        bookingId = null;
      }
      const now = new Date().toISOString();
      const rec: ReklamationRecord = {
        id: randomUUID(),
        customer_id: customerId,
        booking_id: bookingId,
        title,
        description,
        status: (['new', 'processing', 'resolved', 'rejected'].includes(String(body.status))
          ? body.status
          : 'new') as ReklamationRecord['status'],
        images: body.images != null ? String(body.images) : '',
        share_with_customer: Boolean(body.share_with_customer),
        share_with_worker: Boolean(body.share_with_worker),
        assigned_to: body.assigned_to != null ? String(body.assigned_to) : '',
        comments: [],
        created_at: now,
        updated_at: now,
      };
      await mutateJsonStore<ReklamationStore>(KEYS.reklamation, defaultStore, (cur) => ({
        records: [rec, ...cur.records],
      }));
      compatJson(res, toListRow(rec, await customerName(rec.customer_id)), 201);
      return;
    }

    if (method === 'PUT') {
      const id = String(req.query.id ?? (req.body as { id?: string })?.id ?? '');
      if (!id) {
        compatJson(res, { error: 'id required' }, 400);
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (body.customer_id != null) {
        const cid = String(body.customer_id);
        const u = await prisma.user.findFirst({ where: { id: cid, role: UserRole.CUSTOMER } });
        if (!u) {
          compatJson(res, { error: 'Customer not found' }, 404);
          return;
        }
      }
      if (body.booking_id != null && String(body.booking_id) !== '') {
        const bid = String(body.booking_id);
        const row = ((await readJsonStore<ReklamationStore>(KEYS.reklamation)) ?? defaultStore()).records.find(
          (x) => x.id === id
        );
        const cust = String(body.customer_id ?? row?.customer_id ?? '');
        if (!cust) {
          compatJson(res, { error: 'customer_id required when setting booking_id' }, 400);
          return;
        }
        const b = await prisma.booking.findFirst({ where: { id: bid, userId: cust } });
        if (!b) {
          compatJson(res, { error: 'Booking not found for customer' }, 400);
          return;
        }
      }
      await mutateJsonStore<ReklamationStore>(KEYS.reklamation, defaultStore, (cur) => {
        const records = cur.records.map((row) => {
          if (row.id !== id) return row;
          const next: ReklamationRecord = { ...row, updated_at: new Date().toISOString() };
          if (body.customer_id != null) next.customer_id = String(body.customer_id);
          if (body.booking_id !== undefined) {
            next.booking_id = body.booking_id ? String(body.booking_id) : null;
          }
          if (body.title != null) next.title = String(body.title);
          if (body.description != null) next.description = String(body.description);
          if (body.status != null && ['new', 'processing', 'resolved', 'rejected'].includes(String(body.status))) {
            next.status = body.status as ReklamationRecord['status'];
          }
          if (body.images != null) next.images = String(body.images);
          if (body.share_with_customer !== undefined) next.share_with_customer = Boolean(body.share_with_customer);
          if (body.share_with_worker !== undefined) next.share_with_worker = Boolean(body.share_with_worker);
          if (body.assigned_to !== undefined) next.assigned_to = String(body.assigned_to ?? '');
          return next;
        });
        if (!records.some((r) => r.id === id)) {
          return cur;
        }
        return { records };
      });
      const store = (await readJsonStore<ReklamationStore>(KEYS.reklamation)) ?? defaultStore();
      const r = store.records.find((x) => x.id === id);
      if (!r) {
        compatJson(res, { error: 'Not found' }, 404);
        return;
      }
      if (r.customer_id) {
        const u = await prisma.user.findFirst({
          where: { id: r.customer_id, role: UserRole.CUSTOMER },
        });
        if (!u) {
          compatJson(res, { error: 'Customer not found' }, 400);
          return;
        }
      }
      compatJson(res, toListRow(r, await customerName(r.customer_id)));
      return;
    }

    if (method === 'DELETE') {
      const id = String(req.query.id ?? '');
      if (!id) {
        compatJson(res, { error: 'id required' }, 400);
        return;
      }
      const before = (await readJsonStore<ReklamationStore>(KEYS.reklamation)) ?? defaultStore();
      if (!before.records.some((r) => r.id === id)) {
        compatJson(res, { error: 'Not found' }, 404);
        return;
      }
      await mutateJsonStore<ReklamationStore>(KEYS.reklamation, defaultStore, (cur) => ({
        records: cur.records.filter((r) => r.id !== id),
      }));
      compatJson(res, { id, deleted: 1 });
      return;
    }

    compatJson(res, { error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('compat reklamation:', e);
    compatJson(res, { error: e instanceof Error ? e.message : 'error' }, 500);
  }
}
