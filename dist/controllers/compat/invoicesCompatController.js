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
exports.handleInvoices = handleInvoices;
const client_1 = require("../../prisma/client");
const compatHttp_1 = require("./compatHttp");
const mappers_1 = require("./mappers");
const invoiceDomainService = __importStar(require("../../domain/invoiceDomainService"));
const compatCache_1 = require("../../services/cache/compatCache");
/**
 * Mirrors `hemsolutions/app/api/invoices.php` — raw JSON, snake_case monetary fields on list/detail.
 */
async function handleInvoices(req, res) {
    try {
        const method = req.method;
        if (method === 'GET') {
            if (req.query.action === 'stats') {
                const statsKey = (0, compatCache_1.compatCacheKey)('invoices', { action: 'stats' });
                const statsHit = await (0, compatCache_1.compatGetJson)(statsKey, 'short');
                if (statsHit) {
                    (0, compatHttp_1.compatJson)(res, statsHit);
                    return;
                }
                const [total, draft, sent, paid, overdue, sumAll, sumOutstanding] = await Promise.all([
                    client_1.prisma.invoice.count(),
                    client_1.prisma.invoice.count({ where: { status: 'DRAFT' } }),
                    client_1.prisma.invoice.count({ where: { status: 'SENT' } }),
                    client_1.prisma.invoice.count({ where: { status: 'PAID' } }),
                    client_1.prisma.invoice.count({ where: { status: 'OVERDUE' } }),
                    client_1.prisma.invoice.aggregate({ _sum: { total: true } }),
                    client_1.prisma.invoice.aggregate({
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
                await (0, compatCache_1.compatSetJson)(statsKey, statsPayload, 'short');
                (0, compatHttp_1.compatJson)(res, statsPayload);
                return;
            }
            const id = req.query.id;
            if (id) {
                const inv = await client_1.prisma.invoice.findUnique({
                    where: { id },
                    include: {
                        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
                        items: true,
                        booking: { include: { address: true } },
                    },
                });
                if (!inv) {
                    (0, compatHttp_1.compatJson)(res, { error: 'Faktura hittades inte' }, 404);
                    return;
                }
                (0, compatHttp_1.compatJson)(res, (0, mappers_1.invoiceToPhpDetail)(inv));
                return;
            }
            const statusQ = req.query.status;
            const customerId = req.query.customer_id;
            const startDate = req.query.start_date;
            const endDate = req.query.end_date;
            const search = String(req.query.search ?? '').trim();
            const statusPrisma = statusQ ? (0, mappers_1.phpInvoiceStatusToPrisma)(statusQ) : null;
            if (statusQ && !statusPrisma) {
                (0, compatHttp_1.compatJson)(res, { error: 'Ogiltig status' }, 400);
                return;
            }
            const createdAtFilter = {};
            if (startDate) {
                createdAtFilter.gte = new Date(`${startDate}T00:00:00.000Z`);
            }
            if (endDate) {
                createdAtFilter.lte = new Date(`${endDate}T23:59:59.999Z`);
            }
            const where = {
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
            const listKey = (0, compatCache_1.compatCacheKey)('invoices', {
                list: true,
                statusQ: statusQ ?? '',
                customerId: customerId ?? '',
                startDate: startDate ?? '',
                endDate: endDate ?? '',
                search,
                page,
                limit,
            });
            const listHit = await (0, compatCache_1.compatGetJson)(listKey, 'medium');
            if (listHit) {
                (0, compatHttp_1.compatJson)(res, listHit);
                return;
            }
            const rows = await client_1.prisma.invoice.findMany({
                where,
                include: {
                    user: { select: { firstName: true, lastName: true, email: true, phone: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            });
            const listOut = rows.map((r) => (0, mappers_1.invoiceToPhpListRow)(r));
            await (0, compatCache_1.compatSetJson)(listKey, listOut, 'medium');
            (0, compatHttp_1.compatJson)(res, listOut);
            return;
        }
        if (method === 'POST') {
            const data = req.body;
            if (!String(data.booking_id ?? '').trim()) {
                (0, compatHttp_1.compatJson)(res, { error: 'booking_id krävs (Node kopplar faktura till bokning)' }, 400);
                return;
            }
            try {
                const full = await invoiceDomainService.createCompatInvoiceFromBody(data);
                (0, compatHttp_1.compatJson)(res, (0, mappers_1.invoiceToPhpDetail)(full), 201);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'Server error';
                const status = msg === 'Bokning hittades inte'
                    ? 404
                    : msg === 'Faktura finns redan för denna bokning'
                        ? 409
                        : msg === 'customer_id stämmer inte med bokningen'
                            ? 400
                            : msg === 'Kunde inte läsa faktura'
                                ? 500
                                : 400;
                (0, compatHttp_1.compatJson)(res, { error: msg }, status);
            }
            return;
        }
        if (method === 'PUT') {
            const id = req.query.id;
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'ID krävs' }, 400);
                return;
            }
            const data = req.body;
            try {
                const updated = await invoiceDomainService.updateCompatInvoice(id, data);
                (0, compatHttp_1.compatJson)(res, (0, mappers_1.invoiceToPhpDetail)(updated));
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'Server error';
                const status = msg === 'Faktura hittades inte'
                    ? 404
                    : msg === 'Ogiltig status' || msg === 'Inga fält att uppdatera'
                        ? 400
                        : 400;
                (0, compatHttp_1.compatJson)(res, { error: msg }, status);
            }
            return;
        }
        if (method === 'DELETE') {
            const id = req.query.id;
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'ID krävs' }, 400);
                return;
            }
            try {
                await invoiceDomainService.deleteCompatInvoice(id);
                (0, compatHttp_1.compatJson)(res, { id, deleted: 1 });
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'Server error';
                const status = msg === 'Faktura hittades inte' ? 404 : msg.includes('betald') ? 400 : 400;
                (0, compatHttp_1.compatJson)(res, { error: msg }, status);
            }
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('compat invoices:', e);
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Server error' }, 500);
    }
}
//# sourceMappingURL=invoicesCompatController.js.map