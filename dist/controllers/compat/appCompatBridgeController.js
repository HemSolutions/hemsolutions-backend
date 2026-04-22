"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMessages = handleMessages;
exports.handleReminders = handleReminders;
exports.handlePayments = handlePayments;
exports.handleReceipts = handleReceipts;
exports.handleSettings = handleSettings;
exports.handleArticles = handleArticles;
exports.handleAdminSegment = handleAdminSegment;
const client_1 = require("../../prisma/client");
const adminMetricsService = __importStar(require("../../services/automation/adminMetricsService"));
const invoiceDomainService = __importStar(require("../../domain/invoiceDomainService"));
const paymentDomainService = __importStar(require("../../domain/paymentDomainService"));
const messagingDomainService = __importStar(require("../../domain/messagingDomainService"));
const reminderDomainService = __importStar(require("../../domain/reminderDomainService"));
const compatHttp_1 = require("./compatHttp");
const mappers_1 = require("./mappers");
const appCompatJsonStore_1 = require("../../services/compat/appCompatJsonStore");
const compatCache_1 = require("../../services/cache/compatCache");
function slugify(input) {
    return input
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}
function parseSenderType(raw) {
    const u = raw.toUpperCase();
    if (u === 'WORKER')
        return 'WORKER';
    if (u === 'ADMIN')
        return 'ADMIN';
    if (u === 'SYSTEM')
        return 'SYSTEM';
    return 'USER';
}
function defaultSettingsBundle() {
    return {
        company: {},
        invoice: {},
        VAT: {},
        templates: {},
    };
}
/** Non-empty PHP-shaped defaults for settings GET (merged with stored JSON). */
function phpDefaultSettingsBundle() {
    return {
        company: {
            company_name: '',
            org_number: '',
            vat_number: '',
            address: '',
            postal_code: '',
            city: '',
            phone: '',
            email: '',
            website: '',
            bankgiro: '',
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
            late_payment_interest_rate: 8,
            reminder_fee_1: 0,
            reminder_fee_2: 0,
            reminder_fee_3: 0,
        },
        VAT: { default_rate: 25 },
        templates: {},
    };
}
function mergeSettingsBundles(base, overlay) {
    return {
        company: { ...base.company, ...overlay.company },
        invoice: { ...base.invoice, ...overlay.invoice },
        VAT: { ...base.VAT, ...overlay.VAT },
        templates: { ...base.templates, ...overlay.templates },
    };
}
async function resolveConversationToBookingIds(conversation) {
    const raw = conversation.trim();
    if (!raw)
        return [];
    const parts = raw.split(':').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2 && parts[0].toLowerCase() === 'booking') {
        const b = await client_1.prisma.booking.findUnique({ where: { id: parts[1] } });
        return b ? [b.id] : [];
    }
    if (parts.length !== 4)
        return [];
    const [a1, id1, a2, id2] = parts;
    const t1 = a1.toLowerCase();
    const t2 = a2.toLowerCase();
    const ors = [];
    if ((t1 === 'customer' || t1 === 'user') && t2 === 'worker') {
        ors.push({ userId: id1, workerId: id2 });
    }
    else if (t1 === 'worker' && (t2 === 'customer' || t2 === 'user')) {
        ors.push({ userId: id2, workerId: id1 });
    }
    else if ((t1 === 'customer' || t1 === 'user') && (t2 === 'customer' || t2 === 'user')) {
        ors.push({ userId: id1 });
        ors.push({ userId: id2 });
    }
    else if (t1 === 'admin' && (t2 === 'customer' || t2 === 'user')) {
        ors.push({ userId: id2 });
    }
    else if ((t1 === 'customer' || t1 === 'user') && t2 === 'admin') {
        ors.push({ userId: id1 });
    }
    else if (t1 === 'admin' && t2 === 'worker') {
        ors.push({ workerId: id2 });
    }
    else if (t1 === 'worker' && t2 === 'admin') {
        ors.push({ workerId: id1 });
    }
    if (ors.length === 0)
        return [];
    const bookings = await client_1.prisma.booking.findMany({ where: { OR: ors } });
    return bookings.map((b) => b.id);
}
async function resolveSenderUserId(req, senderType, bodySenderId, bookingUserId) {
    const authId = req.user?.userId;
    if (bodySenderId) {
        const u = await client_1.prisma.user.findUnique({ where: { id: bodySenderId } });
        if (u)
            return u.id;
        if (senderType === 'WORKER') {
            const w = await client_1.prisma.worker.findUnique({ where: { id: bodySenderId } });
            if (w) {
                const byEmail = await client_1.prisma.user.findFirst({ where: { email: w.email } });
                if (byEmail)
                    return byEmail.id;
            }
        }
    }
    if (authId) {
        const u = await client_1.prisma.user.findUnique({ where: { id: authId } });
        if (u)
            return u.id;
    }
    return bookingUserId;
}
function messageToLegacy(m) {
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
async function handleMessages(req, res) {
    try {
        const role = req.user?.role ?? '';
        if (req.method === 'GET') {
            const conversation = String(req.query.conversation ?? '');
            const bookingIdParam = String(req.query.bookingId ?? req.query.booking_id ?? '');
            let bookingIds = [];
            if (bookingIdParam) {
                const b = await client_1.prisma.booking.findUnique({ where: { id: bookingIdParam } });
                if (b)
                    bookingIds = [b.id];
            }
            else if (conversation) {
                bookingIds = await resolveConversationToBookingIds(conversation);
                if (bookingIds.length === 0) {
                    (0, compatHttp_1.compatJson)(res, { error: 'Invalid conversation or no matching booking' }, 400);
                    return;
                }
            }
            let baseWhere;
            if (bookingIds.length > 0) {
                if (conversation) {
                    baseWhere = {
                        OR: [{ bookingId: { in: bookingIds } }, { conversationId: conversation }],
                    };
                }
                else {
                    baseWhere = { bookingId: { in: bookingIds } };
                }
            }
            else if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
                baseWhere = {};
            }
            else {
                const uid = req.user.userId;
                const user = await client_1.prisma.user.findUnique({ where: { id: uid } });
                const worker = user?.email
                    ? await client_1.prisma.worker.findFirst({ where: { email: user.email } })
                    : null;
                const or = [{ booking: { userId: uid } }];
                if (worker) {
                    or.push({ booking: { workerId: worker.id } });
                }
                baseWhere = { OR: or };
            }
            const rows = await client_1.prisma.message.findMany({
                where: baseWhere,
                orderBy: { createdAt: 'asc' },
                take: 500,
                include: { sender: { select: { firstName: true, lastName: true } } },
            });
            (0, compatHttp_1.compatJson)(res, rows.map((m) => messageToLegacy(m)));
            return;
        }
        if (req.method === 'POST') {
            const body = (req.body ?? {});
            const bookingId = String(body.booking_id ?? body.bookingId ?? '');
            const content = String(body.content ?? '');
            if (!bookingId || !content) {
                (0, compatHttp_1.compatJson)(res, { error: 'booking_id and content required' }, 400);
                return;
            }
            const booking = await client_1.prisma.booking.findUnique({ where: { id: bookingId } });
            if (!booking) {
                (0, compatHttp_1.compatJson)(res, { error: 'Booking not found' }, 404);
                return;
            }
            const senderType = parseSenderType(String(body.sender_type ?? 'user'));
            const senderId = await resolveSenderUserId(req, senderType, body.sender_id != null ? String(body.sender_id) : undefined, booking.userId);
            if (!senderId) {
                (0, compatHttp_1.compatJson)(res, { error: 'Could not resolve sender user id' }, 400);
                return;
            }
            const msg = await messagingDomainService.createMessageCompat({
                bookingId,
                senderId,
                senderType,
                content,
                attachments: Array.isArray(body.attachments) ? body.attachments : [],
            });
            (0, compatHttp_1.compatJson)(res, messageToLegacy(msg), 201);
            return;
        }
        if (req.method === 'PUT') {
            const id = String(req.query.id ?? req.body?.id ?? '');
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'id required' }, 400);
                return;
            }
            const existing = await client_1.prisma.message.findUnique({ where: { id }, include: { booking: true } });
            if (!existing) {
                (0, compatHttp_1.compatJson)(res, { error: 'Message not found' }, 404);
                return;
            }
            const body = (req.body ?? {});
            const data = {};
            if (body.is_read !== undefined) {
                data.isRead = Boolean(body.is_read);
            }
            if (body.content != null) {
                data.content = String(body.content);
            }
            if (Object.keys(data).length === 0) {
                (0, compatHttp_1.compatJson)(res, { error: 'No updatable fields' }, 400);
                return;
            }
            const updated = await messagingDomainService.updateMessageCompat(id, data);
            (0, compatHttp_1.compatJson)(res, messageToLegacy(updated));
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        console.error('compat messages:', e);
        (0, compatHttp_1.compatJson)(res, { error: e instanceof Error ? e.message : 'error' }, 500);
    }
}
async function enrichReminders(records) {
    const out = [];
    for (const r of records) {
        const inv = await client_1.prisma.invoice.findUnique({
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
        out.push((0, mappers_1.reminderCompatToPhp)(r, mini));
    }
    return out;
}
async function reminderRowToPhp(r) {
    const inv = await client_1.prisma.invoice.findUnique({
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
    return (0, mappers_1.reminderCompatToPhp)(r, mini);
}
async function handleReminders(req, res) {
    try {
        if (req.method === 'GET') {
            const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.reminders)) ?? { records: [] };
            const status = String(req.query.status ?? '');
            let recs = store.records;
            if (status && status !== 'all') {
                recs = recs.filter((r) => r.status === status);
            }
            recs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
            (0, compatHttp_1.compatJson)(res, await enrichReminders(recs));
            return;
        }
        if (req.method === 'POST') {
            const body = (req.body ?? {});
            try {
                const rec = await reminderDomainService.createReminderFromBody(body);
                (0, compatHttp_1.compatJson)(res, await reminderRowToPhp(rec), 201);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'error';
                (0, compatHttp_1.compatJson)(res, { error: msg }, msg === 'Invoice not found' ? 404 : 400);
            }
            return;
        }
        if (req.method === 'PUT') {
            const id = String(req.query.id ?? req.body?.id ?? '');
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'id required' }, 400);
                return;
            }
            const body = (req.body ?? {});
            try {
                const updated = await reminderDomainService.transitionReminder(id, body);
                (0, compatHttp_1.compatJson)(res, await reminderRowToPhp(updated));
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'error';
                const status = msg === 'Reminder not found'
                    ? 404
                    : msg.startsWith('Illegal reminder transition')
                        ? 400
                        : 400;
                (0, compatHttp_1.compatJson)(res, { error: msg }, status);
            }
            return;
        }
        if (req.method === 'DELETE') {
            const id = String(req.query.id ?? '');
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'id required' }, 400);
                return;
            }
            await reminderDomainService.deleteReminderRecord(id);
            (0, compatHttp_1.compatJson)(res, { id, deleted: 1 });
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        console.error('compat reminders:', e);
        (0, compatHttp_1.compatJson)(res, { error: e instanceof Error ? e.message : 'error' }, 500);
    }
}
async function handlePayments(req, res) {
    try {
        if (req.method === 'GET') {
            const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.payments)) ?? { records: [] };
            const sorted = [...store.records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
            const enriched = [];
            for (const p of sorted.slice(0, 200)) {
                const inv = await client_1.prisma.invoice.findUnique({
                    where: { id: p.invoiceId },
                    include: { user: { select: { firstName: true, lastName: true } } },
                });
                enriched.push((0, mappers_1.paymentCompatToPhp)(p, inv ? { invoiceNumber: inv.invoiceNumber, user: inv.user } : null));
            }
            (0, compatHttp_1.compatJson)(res, enriched);
            return;
        }
        if (req.method === 'POST') {
            const body = (req.body ?? {});
            const idem = req.get('Idempotency-Key') ?? req.get('idempotency-key') ?? undefined;
            try {
                const rec = await paymentDomainService.recordCompatPayment(body, idem);
                const invRow = await client_1.prisma.invoice.findUnique({
                    where: { id: rec.invoiceId },
                    include: { user: { select: { firstName: true, lastName: true } } },
                });
                (0, compatHttp_1.compatJson)(res, (0, mappers_1.paymentCompatToPhp)(rec, invRow ? { invoiceNumber: invRow.invoiceNumber, user: invRow.user } : null), 201);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'error';
                const status = msg === 'Invoice not found'
                    ? 404
                    : msg.includes('Idempotency-Key header is required')
                        ? 400
                        : msg.includes('invoice_id')
                            ? 400
                            : 400;
                (0, compatHttp_1.compatJson)(res, { error: msg }, status);
            }
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        console.error('compat payments:', e);
        (0, compatHttp_1.compatJson)(res, { error: e instanceof Error ? e.message : 'error' }, 500);
    }
}
async function handleReceipts(req, res) {
    try {
        if (req.method === 'GET') {
            const id = String(req.query.id ?? '');
            const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.receipts)) ?? { receipts: [] };
            if (id) {
                const r = store.receipts.find((x) => x.id === id);
                if (!r) {
                    (0, compatHttp_1.compatJson)(res, { error: 'Receipt not found' }, 404);
                    return;
                }
                const u = await client_1.prisma.user.findUnique({
                    where: { id: r.customerId },
                    select: { firstName: true, lastName: true },
                });
                const name = u ? `${u.firstName} ${u.lastName}`.trim() : '';
                (0, compatHttp_1.compatJson)(res, (0, mappers_1.receiptCompatToPhp)(r, name));
                return;
            }
            const sorted = [...store.receipts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
            const out = [];
            for (const r of sorted) {
                const u = await client_1.prisma.user.findUnique({
                    where: { id: r.customerId },
                    select: { firstName: true, lastName: true },
                });
                const name = u ? `${u.firstName} ${u.lastName}`.trim() : '';
                out.push((0, mappers_1.receiptCompatToPhp)(r, name));
            }
            (0, compatHttp_1.compatJson)(res, out);
            return;
        }
        if (req.method === 'POST') {
            const body = (req.body ?? {});
            try {
                const rec = await invoiceDomainService.createCompatReceiptFromInvoice(body);
                const u = await client_1.prisma.user.findUnique({
                    where: { id: rec.customerId },
                    select: { firstName: true, lastName: true },
                });
                const name = u ? `${u.firstName} ${u.lastName}`.trim() : '';
                (0, compatHttp_1.compatJson)(res, (0, mappers_1.receiptCompatToPhp)(rec, name), 201);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'error';
                (0, compatHttp_1.compatJson)(res, { error: msg }, msg === 'Invoice not found' ? 404 : 400);
            }
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        console.error('compat receipts:', e);
        (0, compatHttp_1.compatJson)(res, { error: e instanceof Error ? e.message : 'error' }, 500);
    }
}
async function handleSettings(req, res) {
    try {
        if (req.method === 'GET') {
            const stored = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.settingsBundle)) ?? defaultSettingsBundle();
            const merged = mergeSettingsBundles(phpDefaultSettingsBundle(), stored);
            (0, compatHttp_1.compatJson)(res, merged);
            return;
        }
        if (req.method === 'PUT' || req.method === 'POST') {
            const body = (req.body ?? {});
            const current = mergeSettingsBundles(phpDefaultSettingsBundle(), (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.settingsBundle)) ?? defaultSettingsBundle());
            const next = {
                company: { ...current.company, ...(body.company ?? {}) },
                invoice: { ...current.invoice, ...(body.invoice ?? {}) },
                VAT: { ...current.VAT, ...(body.VAT ?? {}) },
                templates: { ...current.templates, ...(body.templates ?? {}) },
            };
            await (0, appCompatJsonStore_1.writeJsonStore)(appCompatJsonStore_1.KEYS.settingsBundle, next);
            (0, compatHttp_1.compatJson)(res, mergeSettingsBundles(phpDefaultSettingsBundle(), next));
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        console.error('compat settings:', e);
        (0, compatHttp_1.compatJson)(res, { error: e instanceof Error ? e.message : 'error' }, 500);
    }
}
function parseCategory(raw) {
    const u = raw.toUpperCase();
    const allowed = [
        'RESIDENTIAL',
        'COMMERCIAL',
        'MOVE_IN_OUT',
        'POST_CONSTRUCTION',
        'SPECIALIZED',
    ];
    return allowed.includes(u) ? u : 'RESIDENTIAL';
}
function parsePriceType(raw) {
    const u = (raw ?? 'FIXED').toUpperCase();
    if (u === 'HOURLY')
        return 'HOURLY';
    if (u === 'PER_SQUARE_METER')
        return 'PER_SQUARE_METER';
    return 'FIXED';
}
async function handleArticles(req, res) {
    const role = req.user?.role ?? '';
    const admin = role === 'ADMIN' || role === 'SUPER_ADMIN';
    try {
        if (req.method === 'GET') {
            const services = await client_1.prisma.service.findMany({ orderBy: { name: 'asc' } });
            (0, compatHttp_1.compatJson)(res, services.map((s) => (0, mappers_1.serviceToPhpArticle)(s)));
            return;
        }
        if (!admin) {
            (0, compatHttp_1.compatJson)(res, { error: 'Forbidden' }, 403);
            return;
        }
        if (req.method === 'POST') {
            const body = (req.body ?? {});
            const name = String(body.name ?? '').trim();
            if (!name) {
                (0, compatHttp_1.compatJson)(res, { error: 'name required' }, 400);
                return;
            }
            const baseSlug = String(body.slug ?? slugify(name));
            let slug = baseSlug;
            let n = 0;
            while (await client_1.prisma.service.findUnique({ where: { slug } })) {
                n += 1;
                slug = `${baseSlug}-${n}`;
            }
            const s = await client_1.prisma.service.create({
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
            (0, compatHttp_1.compatJson)(res, (0, mappers_1.serviceToPhpArticle)(s), 201);
            return;
        }
        if (req.method === 'PUT') {
            const id = String(req.query.id ?? req.body?.id ?? '');
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'id required' }, 400);
                return;
            }
            const body = (req.body ?? {});
            const existing = await client_1.prisma.service.findUnique({ where: { id } });
            if (!existing) {
                (0, compatHttp_1.compatJson)(res, { error: 'Not found' }, 404);
                return;
            }
            const s = await client_1.prisma.service.update({
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
            (0, compatHttp_1.compatJson)(res, (0, mappers_1.serviceToPhpArticle)(s));
            return;
        }
        if (req.method === 'DELETE') {
            const id = String(req.query.id ?? '');
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'id required' }, 400);
                return;
            }
            const count = await client_1.prisma.booking.count({ where: { serviceId: id } });
            if (count > 0) {
                const s = await client_1.prisma.service.update({ where: { id }, data: { isActive: false } });
                (0, compatHttp_1.compatJson)(res, (0, mappers_1.serviceToPhpArticle)(s));
                return;
            }
            await client_1.prisma.service.delete({ where: { id } });
            (0, compatHttp_1.compatJson)(res, { id, deleted: 1 });
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        console.error('compat articles:', e);
        (0, compatHttp_1.compatJson)(res, { error: e instanceof Error ? e.message : 'error' }, 500);
    }
}
async function handleAdminSegment(req, res) {
    try {
        const raw = String(req.params.segment ?? '').replace(/\.php$/i, '');
        const seg = raw.split('/')[0] ?? raw;
        if (seg === 'dashboard-stats') {
            const dKey = (0, compatCache_1.compatCacheKey)('dashboard', { seg: 'dashboard-stats' });
            const dHit = await (0, compatCache_1.compatGetJson)(dKey, 'short');
            if (dHit) {
                (0, compatHttp_1.compatJson)(res, dHit);
                return;
            }
            const stats = await adminMetricsService.fetchDashboardStatsPhpCompat();
            await (0, compatCache_1.compatSetJson)(dKey, stats, 'short');
            (0, compatHttp_1.compatJson)(res, stats);
            return;
        }
        if (seg === 'top-customers') {
            const grouped = await client_1.prisma.invoice.groupBy({
                by: ['userId'],
                where: { status: 'PAID' },
                _sum: { total: true },
                _count: { id: true },
                orderBy: { _sum: { total: 'desc' } },
                take: 25,
            });
            const userIds = grouped.map((g) => g.userId);
            const users = await client_1.prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true },
            });
            const byId = new Map(users.map((u) => [u.id, u]));
            (0, compatHttp_1.compatJson)(res, grouped.map((g) => {
                const u = byId.get(g.userId);
                return {
                    customer_id: g.userId,
                    customer_name: u ? `${u.firstName} ${u.lastName}`.trim() : '',
                    total_amount: g._sum.total ?? 0,
                    invoice_count: g._count.id,
                };
            }));
            return;
        }
        if (seg === 'outstanding-reminders') {
            const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.reminders)) ?? { records: [] };
            const pending = store.records.filter((r) => r.status === 'pending');
            (0, compatHttp_1.compatJson)(res, await enrichReminders(pending));
            return;
        }
        if (seg === 'recent-payments') {
            const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.payments)) ?? { records: [] };
            const sorted = [...store.records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50);
            const out = [];
            for (const p of sorted) {
                const inv = await client_1.prisma.invoice.findUnique({
                    where: { id: p.invoiceId },
                    include: { user: { select: { firstName: true, lastName: true } } },
                });
                out.push((0, mappers_1.paymentCompatToPhp)(p, inv ? { invoiceNumber: inv.invoiceNumber, user: inv.user } : null));
            }
            (0, compatHttp_1.compatJson)(res, out);
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Unknown admin compat segment: ' + seg }, 404);
    }
    catch (e) {
        console.error('compat admin:', e);
        (0, compatHttp_1.compatJson)(res, { error: e instanceof Error ? e.message : 'error' }, 500);
    }
}
//# sourceMappingURL=appCompatBridgeController.js.map