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
exports.handleBookings = handleBookings;
const client_1 = require("../../prisma/client");
const compatHttp_1 = require("./compatHttp");
const mappers_1 = require("./mappers");
const bookingDomainService = __importStar(require("../../domain/bookingDomainService"));
const compatCache_1 = require("../../services/cache/compatCache");
const bookingInclude = {
    user: { select: { firstName: true, lastName: true, email: true, phone: true } },
    service: { select: { name: true } },
    worker: { select: { firstName: true, lastName: true } },
};
function parseYmd(s) {
    const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
function endOfUtcDay(ymd) {
    const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}
/**
 * Mirrors `hemsolutions/app/api/bookings.php` — query `id`, `worker_id`, `start`+`end`, raw arrays/objects.
 */
async function handleBookings(req, res) {
    try {
        const method = req.method;
        if (method === 'GET') {
            const id = req.query.id;
            if (id) {
                const b = await client_1.prisma.booking.findUnique({
                    where: { id },
                    include: bookingInclude,
                });
                if (!b) {
                    (0, compatHttp_1.compatJson)(res, { error: 'Bokning hittades inte' }, 404);
                    return;
                }
                (0, compatHttp_1.compatJson)(res, (0, mappers_1.bookingToPhp)(b));
                return;
            }
            const workerId = req.query.worker_id;
            const startQ = req.query.start;
            const endQ = req.query.end;
            const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
            const limit = Math.max(1, Math.min(2000, parseInt(String(req.query.limit ?? '500'), 10) || 500));
            const skip = (page - 1) * limit;
            let start;
            let end;
            if (startQ && endQ) {
                start = startQ;
                end = endQ;
            }
            else {
                const now = new Date();
                const y = now.getUTCFullYear();
                const m = now.getUTCMonth();
                start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
                const endD = new Date(Date.UTC(y, m + 3, 0));
                end = (0, mappers_1.utcYmd)(endD);
            }
            const rangeStart = parseYmd(start);
            const rangeEnd = endOfUtcDay(end);
            const where = {
                scheduledDate: { gte: rangeStart, lte: rangeEnd },
                ...(workerId ? { workerId } : {}),
            };
            const cacheKey = (0, compatCache_1.compatCacheKey)('bookings', { start, end, workerId: workerId ?? '', page, limit });
            const cached = await (0, compatCache_1.compatGetJson)(cacheKey, 'short');
            if (cached) {
                (0, compatHttp_1.compatJson)(res, cached);
                return;
            }
            const rows = await client_1.prisma.booking.findMany({
                where,
                include: bookingInclude,
                orderBy: { scheduledDate: 'asc' },
                skip,
                take: limit,
            });
            const out = rows.map((b) => (0, mappers_1.bookingToPhp)(b));
            await (0, compatCache_1.compatSetJson)(cacheKey, out, 'short');
            (0, compatHttp_1.compatJson)(res, out);
            return;
        }
        if (method === 'POST') {
            const data = req.body;
            try {
                const full = await bookingDomainService.createCompatBookingWithInvoice(data);
                (0, compatHttp_1.compatJson)(res, (0, mappers_1.bookingToPhp)(full));
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'Server error';
                const status = msg === 'Tjänst hittades inte' || msg === 'Arbetare hittades inte' ? 404 : 400;
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
                const full = await bookingDomainService.updateCompatBooking(id, data);
                (0, compatHttp_1.compatJson)(res, (0, mappers_1.bookingToPhp)(full));
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'Server error';
                (0, compatHttp_1.compatJson)(res, { error: msg }, msg === 'Bokning hittades inte' ? 404 : 400);
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
                await bookingDomainService.deleteCompatBookingCascade(id);
                (0, compatHttp_1.compatJson)(res, { id, deleted: 1 });
            }
            catch (e) {
                (0, compatHttp_1.compatJson)(res, { error: 'Server error' }, 500);
            }
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('compat bookings:', e);
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Server error' }, 500);
    }
}
//# sourceMappingURL=bookingsCompatController.js.map