"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCustomerPrices = handleCustomerPrices;
const client_1 = require("../../prisma/client");
const compatHttp_1 = require("./compatHttp");
const appCompatJsonStore_1 = require("../../services/compat/appCompatJsonStore");
function defaultStore() {
    return { nextId: 1, records: [] };
}
function toResponse(r) {
    return {
        id: r.id,
        customer_id: r.customer_id,
        article_id: r.article_id,
        custom_price: r.custom_price,
        created_at: r.created_at,
        updated_at: r.updated_at,
    };
}
/**
 * Per-customer Service (article) pricing in AdminSettings JSON.
 */
async function handleCustomerPrices(req, res) {
    try {
        const method = req.method;
        if (method === 'GET') {
            const customerId = String(req.query.customer_id ?? '');
            if (!customerId) {
                (0, compatHttp_1.compatJson)(res, { error: 'customer_id required' }, 400);
                return;
            }
            const u = await client_1.prisma.user.findUnique({ where: { id: customerId } });
            if (!u) {
                (0, compatHttp_1.compatJson)(res, { error: 'Customer not found' }, 404);
                return;
            }
            const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.customerPrices)) ?? defaultStore();
            const rows = store.records.filter((r) => r.customer_id === customerId);
            (0, compatHttp_1.compatJson)(res, rows.map(toResponse));
            return;
        }
        if (method === 'POST') {
            const body = (req.body ?? {});
            const customerId = String(body.customer_id ?? '');
            const articleId = String(body.article_id ?? '');
            const customPrice = Number(body.custom_price ?? body.customPrice ?? NaN);
            if (!customerId || !articleId || Number.isNaN(customPrice)) {
                (0, compatHttp_1.compatJson)(res, { error: 'customer_id, article_id, custom_price required' }, 400);
                return;
            }
            const u = await client_1.prisma.user.findUnique({ where: { id: customerId } });
            if (!u) {
                (0, compatHttp_1.compatJson)(res, { error: 'Customer not found' }, 404);
                return;
            }
            const svc = await client_1.prisma.service.findUnique({ where: { id: articleId } });
            if (!svc) {
                (0, compatHttp_1.compatJson)(res, { error: 'Article (service) not found' }, 404);
                return;
            }
            const now = new Date().toISOString();
            await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.customerPrices, defaultStore, (cur) => {
                const existingIdx = cur.records.findIndex((r) => r.customer_id === customerId && r.article_id === articleId);
                if (existingIdx >= 0) {
                    const records = [...cur.records];
                    records[existingIdx] = {
                        ...records[existingIdx],
                        custom_price: customPrice,
                        updated_at: now,
                    };
                    return { ...cur, records };
                }
                const id = cur.nextId;
                return {
                    nextId: cur.nextId + 1,
                    records: [
                        ...cur.records,
                        {
                            id,
                            customer_id: customerId,
                            article_id: articleId,
                            custom_price: customPrice,
                            created_at: now,
                            updated_at: now,
                        },
                    ],
                };
            });
            const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.customerPrices)) ?? defaultStore();
            const row = store.records.find((r) => r.customer_id === customerId && r.article_id === articleId);
            if (!row) {
                (0, compatHttp_1.compatJson)(res, { error: 'Could not read price row' }, 500);
                return;
            }
            (0, compatHttp_1.compatJson)(res, toResponse(row), 201);
            return;
        }
        if (method === 'PUT') {
            const id = Number(req.query.id ?? req.body?.id ?? NaN);
            const body = (req.body ?? {});
            if (Number.isNaN(id)) {
                (0, compatHttp_1.compatJson)(res, { error: 'id required' }, 400);
                return;
            }
            const before = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.customerPrices)) ?? defaultStore();
            if (!before.records.some((r) => r.id === id)) {
                (0, compatHttp_1.compatJson)(res, { error: 'Not found' }, 404);
                return;
            }
            await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.customerPrices, defaultStore, (cur) => ({
                ...cur,
                records: cur.records.map((r) => {
                    if (r.id !== id)
                        return r;
                    const next = { ...r, updated_at: new Date().toISOString() };
                    if (body.custom_price != null)
                        next.custom_price = Number(body.custom_price);
                    if (body.article_id != null)
                        next.article_id = String(body.article_id);
                    return next;
                }),
            }));
            const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.customerPrices)) ?? defaultStore();
            const row = store.records.find((r) => r.id === id);
            (0, compatHttp_1.compatJson)(res, row ? toResponse(row) : {});
            return;
        }
        if (method === 'DELETE') {
            const id = Number(req.query.id ?? NaN);
            if (Number.isNaN(id)) {
                (0, compatHttp_1.compatJson)(res, { error: 'id required' }, 400);
                return;
            }
            const before = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.customerPrices)) ?? defaultStore();
            if (!before.records.some((r) => r.id === id)) {
                (0, compatHttp_1.compatJson)(res, { error: 'Not found' }, 404);
                return;
            }
            await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.customerPrices, defaultStore, (cur) => ({
                ...cur,
                records: cur.records.filter((r) => r.id !== id),
            }));
            (0, compatHttp_1.compatJson)(res, { id, deleted: 1 });
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        console.error('compat customer-prices:', e);
        (0, compatHttp_1.compatJson)(res, { error: e instanceof Error ? e.message : 'error' }, 500);
    }
}
//# sourceMappingURL=compatCustomerPricesController.js.map