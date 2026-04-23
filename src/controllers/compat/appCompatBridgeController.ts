import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import type { Prisma, SenderType, ServiceCategory } from '@prisma/client';
import { prisma } from '../../prisma/client';
import * as adminMetricsService from '../../services/automation/adminMetricsService';
import * as invoiceDomainService from '../../domain/invoiceDomainService';
import * as paymentDomainService from '../../domain/paymentDomainService';
import * as messagingDomainService from '../../domain/messagingDomainService';
import * as reminderDomainService from '../../domain/reminderDomainService';
import type { CompatReminderRecord } from '../../domain/reminderDomainService';
import { compatJson } from './compatHttp';
import {
  paymentCompatToPhp,
  receiptCompatToPhp,
  reminderCompatToPhp,
  serviceToPhpArticle,
  type CompatReceiptStoreRow,
  type CompatReminderStoreRow,
} from './mappers';
import { KEYS, readJsonStore, writeJsonStore } from '../../services/compat/appCompatJsonStore';
import {
  compatCacheKey,
  compatGetJson,
  compatSetJson,
} from '../../services/cache/compatCache';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function parseSenderType(raw: string): SenderType {
  const u = raw.toUpperCase();
  if (u === 'WORKER') return 'WORKER';
  if (u === 'ADMIN') return 'ADMIN';
  if (u === 'SYSTEM') return 'SYSTEM';
  return 'USER';
}

type ReminderStore = { records: CompatReminderRecord[] };

type CompatPaymentRecord = {
  id: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  reference?: string;
  createdAt: string;
};
type PaymentStore = { records: CompatPaymentRecord[] };

type ReceiptItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  article_id?: string | null;
};
type CompatReceiptRecord = {
  id: string;
  invoiceId: string;
  receiptNumber: string;
  customerId: string;
  issueDate: string;
  totalAmount: number;
  vatAmount: number;
  paymentMethod?: string;
  items: ReceiptItem[];
  createdAt: string;
};
type ReceiptStore = { receipts: CompatReceiptRecord[] };

type SettingsBundle = {
  company: Record<string, unknown>;
  invoice: Record<string, unknown>;
  VAT: Record<string, unknown>;
  templates: Record<string, unknown>;
};

function defaultSettingsBundle(): SettingsBundle {
  return {
    company: {},
    invoice: {},
    VAT: {},
    templates: {},
  };
}

/** Non-empty PHP-shaped defaults for settings GET (merged with stored JSON). */
function phpDefaultSettingsBundle(): SettingsBundle {
  return {
    company: {
      company_name: '',
      org_number: '',
      vat_number: '',
      address: '',
      address_line1: '',
      postal_code: '',
      city: '',
      phone: '',
      email: '',
      website: '',
      bankgiro: '',
      swish_number: '',
      plusgiro: '',
      bank_account: '',
      iban: '',
      swift: '',
      logo_url: '',
    },
    invoice: {
      payment_terms_days: 30,
      default_vat_rate: 25,
      invoice_number_prefix: 'F',
      default_notes: '',
      default_footer: '',
      logo_url: '',
      swish_number: '',
      late_payment_interest_rate: 8,
      reminder_fee_1: 0,
      reminder_fee_2: 0,
      reminder_fee_3: 0,
    },
    VAT: { default_rate: 25 },
    templates: {},
  };
}

function mergeSettingsBundles(base: SettingsBundle, overlay: SettingsBundle): SettingsBundle {
  return {
    company: { ...base.company, ...overlay.company },
    invoice: { ...base.invoice, ...overlay.invoice },
    VAT: { ...base.VAT, ...overlay.VAT },
    templates: { ...base.templates, ...overlay.templates },
  };
}

async function resolveConversationToBookingIds(conversation: string): Promise<string[]> {
  const raw = conversation.trim();
  if (!raw) return [];
  const parts = raw.split(':').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2 && parts[0].toLowerCase() === 'booking') {
    const b = await prisma.booking.findUnique({ where: { id: parts[1] } });
    return b ? [b.id] : [];
  }
  if (parts.length !== 4) return [];
  const [a1, id1, a2, id2] = parts;
  const t1 = a1.toLowerCase();
  const t2 = a2.toLowerCase();
  const ors: Prisma.BookingWhereInput[] = [];
  if ((t1 === 'customer' || t1 === 'user') && t2 === 'worker') {
    ors.push({ userId: id1, workerId: id2 });
  } else if (t1 === 'worker' && (t2 === 'customer' || t2 === 'user')) {
    ors.push({ userId: id2, workerId: id1 });
  } else if ((t1 === 'customer' || t1 === 'user') && (t2 === 'customer' || t2 === 'user')) {
    ors.push({ userId: id1 });
    ors.push({ userId: id2 });
  } else if (t1 === 'admin' && (t2 === 'customer' || t2 === 'user')) {
    ors.push({ userId: id2 });
  } else if ((t1 === 'customer' || t1 === 'user') && t2 === 'admin') {
    ors.push({ userId: id1 });
  } else if (t1 === 'admin' && t2 === 'worker') {
    ors.push({ workerId: id2 });
  } else if (t1 === 'worker' && t2 === 'admin') {
    ors.push({ workerId: id1 });
  }
  if (ors.length === 0) return [];
  const bookings = await prisma.booking.findMany({ where: { OR: ors } });
  return bookings.map((b) => b.id);
}

async function resolveSenderUserId(
  req: Request,
  senderType: SenderType,
  bodySenderId: string | undefined,
  bookingUserId: string
): Promise<string | null> {
  const authId = req.user?.userId;
  if (bodySenderId) {
    const u = await prisma.user.findUnique({ where: { id: bodySenderId } });
    if (u) return u.id;
    if (senderType === 'WORKER') {
      const w = await prisma.worker.findUnique({ where: { id: bodySenderId } });
      if (w) {
        const byEmail = await prisma.user.findFirst({ where: { email: w.email } });
        if (byEmail) return byEmail.id;
      }
    }
  }
  if (authId) {
    const u = await prisma.user.findUnique({ where: { id: authId } });
    if (u) return u.id;
  }
  return bookingUserId;
}

function messageToLegacy(m: {
  id: string;
  bookingId: string | null;
  conversationId?: string | null;
  senderId: string;
  senderType: SenderType;
  content: string;
  attachments: string[];
  isRead: boolean;
  createdAt: Date;
  sender?: { firstName: string; lastName: string } | null;
}): Record<string, unknown> {
  return {
    id: m.id,
    booking_id: m.bookingId,
    conversation_id: m.conversationId ?? null,
    sender_type: String(m.senderType).toLowerCase(),
    sender_id: m.senderId,
    sender_name: m.sender ? `${m.sender.firstName} ${m.sender.lastName}`.trim() : '',
    recipient_type: '',
    recipient_id: '',
    recipient_name: '',
    content: m.content,
    channel: 'app',
    status: 'sent',
    attachments: JSON.stringify(m.attachments ?? []),
    is_read: m.isRead,
    created_at: m.createdAt,
  };
}

export async function handleMessages(req: Request, res: Response): Promise<void> {
  try {
    const role = req.user?.role ?? '';

    if (req.method === 'GET') {
      const conversation = String(req.query.conversation ?? '');
      const bookingIdParam = String(req.query.bookingId ?? req.query.booking_id ?? '');

      let bookingIds: string[] = [];
      if (bookingIdParam) {
        const b = await prisma.booking.findUnique({ where: { id: bookingIdParam } });
        if (b) bookingIds = [b.id];
      } else if (conversation) {
        bookingIds = await resolveConversationToBookingIds(conversation);
        if (bookingIds.length === 0) {
          compatJson(res, { error: 'Invalid conversation or no matching booking' }, 400);
          return;
        }
      }

      let baseWhere: Prisma.MessageWhereInput;
      if (bookingIds.length > 0) {
        if (conversation) {
          baseWhere = {
            OR: [{ bookingId: { in: bookingIds } }, { conversationId: conversation }],
          };
        } else {
          baseWhere = { bookingId: { in: bookingIds } };
        }
      } else if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
        baseWhere = {};
      } else {
        const uid = req.user!.userId;
        const user = await prisma.user.findUnique({ where: { id: uid } });
        const worker = user?.email
          ? await prisma.worker.findFirst({ where: { email: user.email } })
          : null;
        const or: Prisma.MessageWhereInput[] = [{ booking: { userId: uid } }];
        if (worker) {
          or.push({ booking: { workerId: worker.id } });
        }
        baseWhere = { OR: or };
      }

      const rows = await prisma.message.findMany({
        where: baseWhere,
        orderBy: { createdAt: 'asc' },
        take: 500,
        include: { sender: { select: { firstName: true, lastName: true } } },
      });
      compatJson(res, rows.map((m) => messageToLegacy(m)));
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const bookingId = String(body.booking_id ?? body.bookingId ?? '');
      const content = String(body.content ?? '');
      if (!bookingId || !content) {
        compatJson(res, { error: 'booking_id and content required' }, 400);
        return;
      }
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking) {
        compatJson(res, { error: 'Booking not found' }, 404);
        return;
      }
      const senderType = parseSenderType(String(body.sender_type ?? 'user'));
      const senderId = await resolveSenderUserId(
        req,
        senderType,
        body.sender_id != null ? String(body.sender_id) : undefined,
        booking.userId
      );
      if (!senderId) {
        compatJson(res, { error: 'Could not resolve sender user id' }, 400);
        return;
      }
      const msg = await messagingDomainService.createMessageCompat({
        bookingId,
        senderId,
        senderType,
        content,
        attachments: Array.isArray(body.attachments) ? (body.attachments as string[]) : [],
      });
      compatJson(res, messageToLegacy(msg), 201);
      return;
    }

    if (req.method === 'PUT') {
      const id = String(req.query.id ?? (req.body as { id?: string })?.id ?? '');
      if (!id) {
        compatJson(res, { error: 'id required' }, 400);
        return;
      }
      const existing = await prisma.message.findUnique({ where: { id }, include: { booking: true } });
      if (!existing) {
        compatJson(res, { error: 'Message not found' }, 404);
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const data: Prisma.MessageUpdateInput = {};
      if (body.is_read !== undefined) {
        data.isRead = Boolean(body.is_read);
      }
      if (body.content != null) {
        data.content = String(body.content);
      }
      if (Object.keys(data).length === 0) {
        compatJson(res, { error: 'No updatable fields' }, 400);
        return;
      }
      const updated = await messagingDomainService.updateMessageCompat(id, data);
      compatJson(res, messageToLegacy(updated));
      return;
    }

    compatJson(res, { error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('compat messages:', e);
    compatJson(res, { error: e instanceof Error ? e.message : 'error' }, 500);
  }
}

async function enrichReminders(records: CompatReminderRecord[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const r of records) {
    const inv = await prisma.invoice.findUnique({
      where: { id: r.invoiceId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    const mini = inv
      ? {
          invoiceNumber: inv.invoiceNumber,
          userId: inv.userId,
          total: inv.total,
          dueDate: inv.dueDate,
          user: inv.user,
        }
      : null;
    out.push(reminderCompatToPhp(r as CompatReminderStoreRow, mini));
  }
  return out;
}

async function reminderRowToPhp(r: CompatReminderRecord): Promise<Record<string, unknown>> {
  const inv = await prisma.invoice.findUnique({
    where: { id: r.invoiceId },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  const mini = inv
    ? {
        invoiceNumber: inv.invoiceNumber,
        userId: inv.userId,
        total: inv.total,
        dueDate: inv.dueDate,
        user: inv.user,
      }
    : null;
  return reminderCompatToPhp(r as CompatReminderStoreRow, mini);
}

export async function handleReminders(req: Request, res: Response): Promise<void> {
  try {
    if (req.method === 'GET') {
      const store = (await readJsonStore<ReminderStore>(KEYS.reminders)) ?? { records: [] };
      const status = String(req.query.status ?? '');
      let recs = store.records;
      if (status && status !== 'all') {
        recs = recs.filter((r) => r.status === status);
      }
      recs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      compatJson(res, await enrichReminders(recs));
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      try {
        const rec = await reminderDomainService.createReminderFromBody(body);
        compatJson(res, await reminderRowToPhp(rec), 201);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'error';
        compatJson(res, { error: msg }, msg === 'Invoice not found' ? 404 : 400);
      }
      return;
    }

    if (req.method === 'PUT') {
      const id = String(req.query.id ?? (req.body as { id?: string })?.id ?? '');
      if (!id) {
        compatJson(res, { error: 'id required' }, 400);
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      try {
        const updated = await reminderDomainService.transitionReminder(id, body);
        compatJson(res, await reminderRowToPhp(updated));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'error';
        const status =
          msg === 'Reminder not found'
            ? 404
            : msg.startsWith('Illegal reminder transition')
              ? 400
              : 400;
        compatJson(res, { error: msg }, status);
      }
      return;
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id ?? '');
      if (!id) {
        compatJson(res, { error: 'id required' }, 400);
        return;
      }
      await reminderDomainService.deleteReminderRecord(id);
      compatJson(res, { id, deleted: 1 });
      return;
    }

    compatJson(res, { error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('compat reminders:', e);
    compatJson(res, { error: e instanceof Error ? e.message : 'error' }, 500);
  }
}

export async function handlePayments(req: Request, res: Response): Promise<void> {
  try {
    if (req.method === 'GET') {
      const store = (await readJsonStore<PaymentStore>(KEYS.payments)) ?? { records: [] };
      const sorted = [...store.records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const enriched: Record<string, unknown>[] = [];
      for (const p of sorted.slice(0, 200)) {
        const inv = await prisma.invoice.findUnique({
          where: { id: p.invoiceId },
          include: { user: { select: { firstName: true, lastName: true } } },
        });
        enriched.push(
          paymentCompatToPhp(p, inv ? { invoiceNumber: inv.invoiceNumber, user: inv.user } : null)
        );
      }
      compatJson(res, enriched);
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const idem = req.get('Idempotency-Key') ?? req.get('idempotency-key') ?? undefined;
      try {
        const rec = await paymentDomainService.recordCompatPayment(body, idem);
        const invRow = await prisma.invoice.findUnique({
          where: { id: rec.invoiceId },
          include: { user: { select: { firstName: true, lastName: true } } },
        });
        compatJson(
          res,
          paymentCompatToPhp(rec, invRow ? { invoiceNumber: invRow.invoiceNumber, user: invRow.user } : null),
          201
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'error';
        const status =
          msg === 'Invoice not found'
            ? 404
            : msg.includes('Idempotency-Key header is required')
              ? 400
              : msg.includes('invoice_id')
                ? 400
                : 400;
        compatJson(res, { error: msg }, status);
      }
      return;
    }

    compatJson(res, { error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('compat payments:', e);
    compatJson(res, { error: e instanceof Error ? e.message : 'error' }, 500);
  }
}

export async function handleReceipts(req: Request, res: Response): Promise<void> {
  try {
    if (req.method === 'GET') {
      const id = String(req.query.id ?? '');
      const store = (await readJsonStore<ReceiptStore>(KEYS.receipts)) ?? { receipts: [] };
      if (id) {
        const r = store.receipts.find((x) => x.id === id);
        if (!r) {
          compatJson(res, { error: 'Receipt not found' }, 404);
          return;
        }
        const u = await prisma.user.findUnique({
          where: { id: r.customerId },
          select: { firstName: true, lastName: true },
        });
        const name = u ? `${u.firstName} ${u.lastName}`.trim() : '';
        compatJson(res, receiptCompatToPhp(r as CompatReceiptStoreRow, name));
        return;
      }
      const sorted = [...store.receipts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const out: Record<string, unknown>[] = [];
      for (const r of sorted) {
        const u = await prisma.user.findUnique({
          where: { id: r.customerId },
          select: { firstName: true, lastName: true },
        });
        const name = u ? `${u.firstName} ${u.lastName}`.trim() : '';
        out.push(receiptCompatToPhp(r as CompatReceiptStoreRow, name));
      }
      compatJson(res, out);
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      try {
        const rec = await invoiceDomainService.createCompatReceiptFromInvoice(body);
        const u = await prisma.user.findUnique({
          where: { id: rec.customerId },
          select: { firstName: true, lastName: true },
        });
        const name = u ? `${u.firstName} ${u.lastName}`.trim() : '';
        compatJson(res, receiptCompatToPhp(rec as CompatReceiptStoreRow, name), 201);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'error';
        compatJson(res, { error: msg }, msg === 'Invoice not found' ? 404 : 400);
      }
      return;
    }

    compatJson(res, { error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('compat receipts:', e);
    compatJson(res, { error: e instanceof Error ? e.message : 'error' }, 500);
  }
}

export async function handleSettings(req: Request, res: Response): Promise<void> {
  try {
    if (req.method === 'GET') {
      const stored =
        (await readJsonStore<SettingsBundle>(KEYS.settingsBundle)) ?? defaultSettingsBundle();
      const merged = mergeSettingsBundles(phpDefaultSettingsBundle(), stored);
      compatJson(res, merged);
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = (req.body ?? {}) as Partial<SettingsBundle>;
      const current = mergeSettingsBundles(
        phpDefaultSettingsBundle(),
        (await readJsonStore<SettingsBundle>(KEYS.settingsBundle)) ?? defaultSettingsBundle()
      );
      const next: SettingsBundle = {
        company: { ...current.company, ...(body.company ?? {}) },
        invoice: { ...current.invoice, ...(body.invoice ?? {}) },
        VAT: { ...current.VAT, ...(body.VAT ?? {}) },
        templates: { ...current.templates, ...(body.templates ?? {}) },
      };
      await writeJsonStore(KEYS.settingsBundle, next as object);
      compatJson(res, mergeSettingsBundles(phpDefaultSettingsBundle(), next));
      return;
    }

    compatJson(res, { error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('compat settings:', e);
    compatJson(res, { error: e instanceof Error ? e.message : 'error' }, 500);
  }
}

function parseCategory(raw: string): ServiceCategory {
  const u = raw.toUpperCase();
  const allowed: ServiceCategory[] = [
    'RESIDENTIAL',
    'COMMERCIAL',
    'MOVE_IN_OUT',
    'POST_CONSTRUCTION',
    'SPECIALIZED',
  ];
  return (allowed as string[]).includes(u) ? (u as ServiceCategory) : 'RESIDENTIAL';
}

function parsePriceType(raw: string | undefined): 'FIXED' | 'HOURLY' | 'PER_SQUARE_METER' {
  const u = (raw ?? 'FIXED').toUpperCase();
  if (u === 'HOURLY') return 'HOURLY';
  if (u === 'PER_SQUARE_METER') return 'PER_SQUARE_METER';
  return 'FIXED';
}

export async function handleArticles(req: Request, res: Response): Promise<void> {
  const role = req.user?.role ?? '';
  const admin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  try {
    if (req.method === 'GET') {
      const services = await prisma.service.findMany({ orderBy: { name: 'asc' } });
      compatJson(res, services.map((s) => serviceToPhpArticle(s)));
      return;
    }

    if (!admin) {
      compatJson(res, { error: 'Forbidden' }, 403);
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const name = String(body.name ?? '').trim();
      if (!name) {
        compatJson(res, { error: 'name required' }, 400);
        return;
      }
      const baseSlug = String(body.slug ?? slugify(name));
      let slug = baseSlug;
      let n = 0;
      while (await prisma.service.findUnique({ where: { slug } })) {
        n += 1;
        slug = `${baseSlug}-${n}`;
      }
      const s = await prisma.service.create({
        data: {
          name,
          slug,
          description: String(body.description ?? name),
          shortDesc: body.shortDesc != null ? String(body.shortDesc) : null,
          price: Number(body.price ?? 0),
          priceType: parsePriceType(body.type != null ? String(body.type) : undefined),
          duration: Math.max(15, Number(body.duration ?? 60)),
          category: parseCategory(String(body.category ?? 'RESIDENTIAL')),
          features: [],
        },
      });
      compatJson(res, serviceToPhpArticle(s), 201);
      return;
    }

    if (req.method === 'PUT') {
      const id = String(req.query.id ?? (req.body as { id?: string })?.id ?? '');
      if (!id) {
        compatJson(res, { error: 'id required' }, 400);
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const existing = await prisma.service.findUnique({ where: { id } });
      if (!existing) {
        compatJson(res, { error: 'Not found' }, 404);
        return;
      }
      const s = await prisma.service.update({
        where: { id },
        data: {
          ...(body.name != null ? { name: String(body.name) } : {}),
          ...(body.description != null ? { description: String(body.description) } : {}),
          ...(body.shortDesc != null ? { shortDesc: String(body.shortDesc) } : {}),
          ...(body.price != null ? { price: Number(body.price) } : {}),
          ...(body.duration != null ? { duration: Math.max(15, Number(body.duration)) } : {}),
          ...(body.category != null ? { category: parseCategory(String(body.category)) } : {}),
          ...(body.type != null ? { priceType: parsePriceType(String(body.type)) } : {}),
          ...(body.is_active !== undefined ? { isActive: Boolean(body.is_active) } : {}),
        },
      });
      compatJson(res, serviceToPhpArticle(s));
      return;
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id ?? '');
      if (!id) {
        compatJson(res, { error: 'id required' }, 400);
        return;
      }
      const count = await prisma.booking.count({ where: { serviceId: id } });
      if (count > 0) {
        const s = await prisma.service.update({ where: { id }, data: { isActive: false } });
        compatJson(res, serviceToPhpArticle(s));
        return;
      }
      await prisma.service.delete({ where: { id } });
      compatJson(res, { id, deleted: 1 });
      return;
    }

    compatJson(res, { error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('compat articles:', e);
    compatJson(res, { error: e instanceof Error ? e.message : 'error' }, 500);
  }
}

export async function handleAdminSegment(req: Request, res: Response): Promise<void> {
  try {
    const raw = String(req.params.segment ?? '').replace(/\.php$/i, '');
    const seg = raw.split('/')[0] ?? raw;

    if (seg === 'dashboard-stats') {
      const dKey = compatCacheKey('dashboard', { seg: 'dashboard-stats' });
      const dHit = await compatGetJson<Record<string, number>>(dKey, 'short');
      if (dHit) {
        compatJson(res, dHit);
        return;
      }
      const stats = await adminMetricsService.fetchDashboardStatsPhpCompat();
      await compatSetJson(dKey, stats, 'short');
      compatJson(res, stats);
      return;
    }

    if (seg === 'top-customers') {
      const grouped = await prisma.invoice.groupBy({
        by: ['userId'],
        where: { status: 'PAID' },
        _sum: { total: true },
        _count: { id: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 25,
      });
      const userIds = grouped.map((g) => g.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true },
      });
      type TopUserRow = (typeof users)[number];
      const byId = new Map<string, TopUserRow>(users.map((u) => [u.id, u]));
      compatJson(
        res,
        grouped.map((g) => {
          const u = byId.get(g.userId);
          return {
            customer_id: g.userId,
            customer_name: u ? `${u.firstName} ${u.lastName}`.trim() : '',
            total_amount: g._sum.total ?? 0,
            invoice_count: g._count.id,
          };
        })
      );
      return;
    }

    if (seg === 'outstanding-reminders') {
      const store = (await readJsonStore<ReminderStore>(KEYS.reminders)) ?? { records: [] };
      const pending = store.records.filter((r) => r.status === 'pending');
      compatJson(res, await enrichReminders(pending));
      return;
    }

    if (seg === 'recent-payments') {
      const store = (await readJsonStore<PaymentStore>(KEYS.payments)) ?? { records: [] };
      const sorted = [...store.records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50);
      const out: Record<string, unknown>[] = [];
      for (const p of sorted) {
        const inv = await prisma.invoice.findUnique({
          where: { id: p.invoiceId },
          include: { user: { select: { firstName: true, lastName: true } } },
        });
        out.push(
          paymentCompatToPhp(p, inv ? { invoiceNumber: inv.invoiceNumber, user: inv.user } : null)
        );
      }
      compatJson(res, out);
      return;
    }

    compatJson(res, { error: 'Unknown admin compat segment: ' + seg }, 404);
  } catch (e) {
    console.error('compat admin:', e);
    compatJson(res, { error: e instanceof Error ? e.message : 'error' }, 500);
  }
}
