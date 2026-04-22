"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleReklamation = handleReklamation;
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const client_2 = require("../../prisma/client");
const compatHttp_1 = require("./compatHttp");
const appCompatJsonStore_1 = require("../../services/compat/appCompatJsonStore");
function defaultStore() {
    return { records: [] };
}
async function customerName(userId) {
    const u = await client_2.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
    });
    return u ? `${u.firstName} ${u.lastName}`.trim() : '';
}
function toListRow(r, name) {
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
function authorFromReq(req) {
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
async function handleReklamation(req, res) {
    try {
        const method = req.method;
        if (method === 'GET') {
            const id = String(req.query.id ?? '');
            const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.reklamation)) ?? defaultStore();
            if (id) {
                const r = store.records.find((x) => x.id === id);
                if (!r) {
                    (0, compatHttp_1.compatJson)(res, { error: 'Not found' }, 404);
                    return;
                }
                const name = await customerName(r.customer_id);
                (0, compatHttp_1.compatJson)(res, toListRow(r, name));
                return;
            }
            const out = [];
            for (const r of store.records) {
                const name = await customerName(r.customer_id);
                out.push(toListRow(r, name));
            }
            out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
            (0, compatHttp_1.compatJson)(res, out);
            return;
        }
        if (method === 'POST') {
            const body = (req.body ?? {});
            if (String(body.action ?? '') === 'add_comment') {
                const rid = String(body.reklamation_id ?? '');
                const content = String(body.content ?? '').trim();
                if (!rid || !content) {
                    (0, compatHttp_1.compatJson)(res, { error: 'reklamation_id and content required' }, 400);
                    return;
                }
                const auth = authorFromReq(req);
                const comment = {
                    id: (0, crypto_1.randomUUID)(),
                    author_type: auth.type,
                    author_name: auth.name,
                    author_user_id: auth.userId,
                    content,
                    created_at: new Date().toISOString(),
                };
                await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.reklamation, defaultStore, (cur) => {
                    const records = cur.records.map((row) => {
                        if (row.id !== rid)
                            return row;
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
                const after = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.reklamation)) ?? defaultStore();
                const updated = after.records.find((x) => x.id === rid);
                if (!updated) {
                    (0, compatHttp_1.compatJson)(res, { error: 'Not found' }, 404);
                    return;
                }
                (0, compatHttp_1.compatJson)(res, {
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
                (0, compatHttp_1.compatJson)(res, { error: 'customer_id and title required' }, 400);
                return;
            }
            const u = await client_2.prisma.user.findFirst({
                where: { id: customerId, role: client_1.UserRole.CUSTOMER },
            });
            if (!u) {
                (0, compatHttp_1.compatJson)(res, { error: 'Customer not found' }, 404);
                return;
            }
            let bookingId = body.booking_id != null ? String(body.booking_id) : null;
            if (bookingId) {
                const b = await client_2.prisma.booking.findFirst({
                    where: { id: bookingId, userId: customerId },
                });
                if (!b) {
                    (0, compatHttp_1.compatJson)(res, { error: 'Booking not found for customer' }, 400);
                    return;
                }
            }
            else {
                bookingId = null;
            }
            const now = new Date().toISOString();
            const rec = {
                id: (0, crypto_1.randomUUID)(),
                customer_id: customerId,
                booking_id: bookingId,
                title,
                description,
                status: (['new', 'processing', 'resolved', 'rejected'].includes(String(body.status))
                    ? body.status
                    : 'new'),
                images: body.images != null ? String(body.images) : '',
                share_with_customer: Boolean(body.share_with_customer),
                share_with_worker: Boolean(body.share_with_worker),
                assigned_to: body.assigned_to != null ? String(body.assigned_to) : '',
                comments: [],
                created_at: now,
                updated_at: now,
            };
            await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.reklamation, defaultStore, (cur) => ({
                records: [rec, ...cur.records],
            }));
            (0, compatHttp_1.compatJson)(res, toListRow(rec, await customerName(rec.customer_id)), 201);
            return;
        }
        if (method === 'PUT') {
            const id = String(req.query.id ?? req.body?.id ?? '');
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'id required' }, 400);
                return;
            }
            const body = (req.body ?? {});
            if (body.customer_id != null) {
                const cid = String(body.customer_id);
                const u = await client_2.prisma.user.findFirst({ where: { id: cid, role: client_1.UserRole.CUSTOMER } });
                if (!u) {
                    (0, compatHttp_1.compatJson)(res, { error: 'Customer not found' }, 404);
                    return;
                }
            }
            if (body.booking_id != null && String(body.booking_id) !== '') {
                const bid = String(body.booking_id);
                const row = ((await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.reklamation)) ?? defaultStore()).records.find((x) => x.id === id);
                const cust = String(body.customer_id ?? row?.customer_id ?? '');
                if (!cust) {
                    (0, compatHttp_1.compatJson)(res, { error: 'customer_id required when setting booking_id' }, 400);
                    return;
                }
                const b = await client_2.prisma.booking.findFirst({ where: { id: bid, userId: cust } });
                if (!b) {
                    (0, compatHttp_1.compatJson)(res, { error: 'Booking not found for customer' }, 400);
                    return;
                }
            }
            await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.reklamation, defaultStore, (cur) => {
                const records = cur.records.map((row) => {
                    if (row.id !== id)
                        return row;
                    const next = { ...row, updated_at: new Date().toISOString() };
                    if (body.customer_id != null)
                        next.customer_id = String(body.customer_id);
                    if (body.booking_id !== undefined) {
                        next.booking_id = body.booking_id ? String(body.booking_id) : null;
                    }
                    if (body.title != null)
                        next.title = String(body.title);
                    if (body.description != null)
                        next.description = String(body.description);
                    if (body.status != null && ['new', 'processing', 'resolved', 'rejected'].includes(String(body.status))) {
                        next.status = body.status;
                    }
                    if (body.images != null)
                        next.images = String(body.images);
                    if (body.share_with_customer !== undefined)
                        next.share_with_customer = Boolean(body.share_with_customer);
                    if (body.share_with_worker !== undefined)
                        next.share_with_worker = Boolean(body.share_with_worker);
                    if (body.assigned_to !== undefined)
                        next.assigned_to = String(body.assigned_to ?? '');
                    return next;
                });
                if (!records.some((r) => r.id === id)) {
                    return cur;
                }
                return { records };
            });
            const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.reklamation)) ?? defaultStore();
            const r = store.records.find((x) => x.id === id);
            if (!r) {
                (0, compatHttp_1.compatJson)(res, { error: 'Not found' }, 404);
                return;
            }
            if (r.customer_id) {
                const u = await client_2.prisma.user.findFirst({
                    where: { id: r.customer_id, role: client_1.UserRole.CUSTOMER },
                });
                if (!u) {
                    (0, compatHttp_1.compatJson)(res, { error: 'Customer not found' }, 400);
                    return;
                }
            }
            (0, compatHttp_1.compatJson)(res, toListRow(r, await customerName(r.customer_id)));
            return;
        }
        if (method === 'DELETE') {
            const id = String(req.query.id ?? '');
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'id required' }, 400);
                return;
            }
            const before = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.reklamation)) ?? defaultStore();
            if (!before.records.some((r) => r.id === id)) {
                (0, compatHttp_1.compatJson)(res, { error: 'Not found' }, 404);
                return;
            }
            await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.reklamation, defaultStore, (cur) => ({
                records: cur.records.filter((r) => r.id !== id),
            }));
            (0, compatHttp_1.compatJson)(res, { id, deleted: 1 });
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        console.error('compat reklamation:', e);
        (0, compatHttp_1.compatJson)(res, { error: e instanceof Error ? e.message : 'error' }, 500);
    }
}
//# sourceMappingURL=compatReklamationController.js.map