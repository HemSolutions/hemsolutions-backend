"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCustomers = handleCustomers;
const client_1 = require("@prisma/client");
const client_2 = require("../../prisma/client");
const password_1 = require("../../utils/password");
const compatHttp_1 = require("./compatHttp");
const mappers_1 = require("./mappers");
const compatCache_1 = require("../../services/cache/compatCache");
function customerNumberForUser(id) {
    return `K-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
/**
 * Mirrors `hemsolutions/app/api/customers.php` — raw JSON, no success wrapper.
 */
async function handleCustomers(req, res) {
    try {
        const method = req.method;
        if (method === 'GET') {
            const id = req.query.id;
            if (id) {
                const u = await client_2.prisma.user.findFirst({
                    where: { id, role: client_1.UserRole.CUSTOMER },
                    include: { addresses: { orderBy: { isDefault: 'desc' }, take: 1 } },
                });
                if (!u) {
                    (0, compatHttp_1.compatJson)(res, { error: 'Kund hittades inte' }, 404);
                    return;
                }
                const addr = u.addresses[0] ?? null;
                (0, compatHttp_1.compatJson)(res, (0, mappers_1.userToPhpCustomer)(u, addr, customerNumberForUser(u.id)));
                return;
            }
            if (req.query.page !== undefined ||
                req.query.limit !== undefined ||
                req.query.search !== undefined ||
                req.query.sort !== undefined) {
                const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
                const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '20'), 10) || 20));
                const offset = (page - 1) * limit;
                const search = String(req.query.search ?? '').trim();
                const sortByRaw = String(req.query.sort ?? 'name');
                const sortOrder = String(req.query.order ?? 'ASC').toUpperCase() === 'DESC' ? 'desc' : 'asc';
                const allowed = new Set(['name', 'email', 'phone', 'created_at']);
                const sortBy = allowed.has(sortByRaw) ? sortByRaw : 'name';
                const where = {
                    role: client_1.UserRole.CUSTOMER,
                    ...(search
                        ? {
                            OR: [
                                { firstName: { contains: search, mode: 'insensitive' } },
                                { lastName: { contains: search, mode: 'insensitive' } },
                                { email: { contains: search, mode: 'insensitive' } },
                                { phone: { contains: search, mode: 'insensitive' } },
                            ],
                        }
                        : {}),
                };
                const orderBy = sortBy === 'name'
                    ? [{ firstName: sortOrder }, { lastName: sortOrder }]
                    : sortBy === 'email'
                        ? { email: sortOrder }
                        : sortBy === 'phone'
                            ? { phone: sortOrder }
                            : { createdAt: sortOrder };
                const listCacheKey = (0, compatCache_1.compatCacheKey)('customers', { page, limit, search, sortBy, sortOrder });
                const cachedList = await (0, compatCache_1.compatGetJson)(listCacheKey, 'medium');
                if (cachedList) {
                    (0, compatHttp_1.compatJson)(res, cachedList);
                    return;
                }
                const [users, total] = await Promise.all([
                    client_2.prisma.user.findMany({
                        where,
                        include: { addresses: { orderBy: { isDefault: 'desc' }, take: 1 } },
                        orderBy,
                        skip: offset,
                        take: limit,
                    }),
                    client_2.prisma.user.count({ where }),
                ]);
                const customers = users.map((u) => (0, mappers_1.userToPhpCustomer)(u, u.addresses[0] ?? null, customerNumberForUser(u.id)));
                const payload = {
                    customers,
                    pagination: {
                        page,
                        limit,
                        total,
                        total_pages: Math.ceil(total / limit),
                    },
                };
                await (0, compatCache_1.compatSetJson)(listCacheKey, payload, 'medium');
                (0, compatHttp_1.compatJson)(res, payload);
                return;
            }
            const allKey = (0, compatCache_1.compatCacheKey)('customers', { branch: 'all' });
            const cachedAll = await (0, compatCache_1.compatGetJson)(allKey, 'long');
            if (cachedAll) {
                (0, compatHttp_1.compatJson)(res, cachedAll);
                return;
            }
            const users = await client_2.prisma.user.findMany({
                where: { role: client_1.UserRole.CUSTOMER },
                include: { addresses: { orderBy: { isDefault: 'desc' }, take: 1 } },
                orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
                take: 5000,
            });
            const allRows = users.map((u) => (0, mappers_1.userToPhpCustomer)(u, u.addresses[0] ?? null, customerNumberForUser(u.id)));
            await (0, compatCache_1.compatSetJson)(allKey, allRows, 'long');
            (0, compatHttp_1.compatJson)(res, allRows);
            return;
        }
        if (method === 'POST') {
            const data = req.body;
            const name = String(data.name ?? '').trim();
            if (!name) {
                (0, compatHttp_1.compatJson)(res, { error: 'Namn krävs' }, 400);
                return;
            }
            const emailRaw = String(data.email ?? '').trim();
            if (!emailRaw) {
                (0, compatHttp_1.compatJson)(res, { error: 'E-post krävs' }, 400);
                return;
            }
            const existing = await client_2.prisma.user.findUnique({ where: { email: emailRaw } });
            if (existing) {
                (0, compatHttp_1.compatJson)(res, { error: 'E-post används redan' }, 409);
                return;
            }
            const parts = name.split(/\s+/);
            const firstName = parts[0] ?? 'Customer';
            const lastName = parts.slice(1).join(' ') || '—';
            const password = String(data.password ?? `compat-${crypto.randomUUID()}`);
            const hashedPassword = await (0, password_1.hashPassword)(password);
            const u = await client_2.prisma.user.create({
                data: {
                    email: emailRaw,
                    password: hashedPassword,
                    firstName,
                    lastName,
                    phone: String(data.phone ?? data.mobile_phone ?? '') || null,
                    role: client_1.UserRole.CUSTOMER,
                },
            });
            const customerNumber = String(data.customer_number ?? '').trim() || customerNumberForUser(u.id);
            const created = await client_2.prisma.user.findFirst({
                where: { id: u.id },
                include: { addresses: { orderBy: { isDefault: 'desc' }, take: 1 } },
            });
            if (!created) {
                (0, compatHttp_1.compatJson)(res, { error: 'Kund hittades inte' }, 500);
                return;
            }
            (0, compatHttp_1.compatJson)(res, (0, mappers_1.userToPhpCustomer)(created, created.addresses[0] ?? null, customerNumber), 201);
            void (0, compatCache_1.invalidateCompatCustomers)();
            return;
        }
        if (method === 'PUT') {
            const id = req.query.id;
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'ID krävs' }, 400);
                return;
            }
            const data = req.body;
            const u = await client_2.prisma.user.findFirst({ where: { id, role: client_1.UserRole.CUSTOMER } });
            if (!u) {
                (0, compatHttp_1.compatJson)(res, { error: 'Kund hittades inte' }, 404);
                return;
            }
            const name = data.name != null ? String(data.name).trim() : null;
            let firstName = u.firstName;
            let lastName = u.lastName;
            if (name) {
                const parts = name.split(/\s+/);
                firstName = parts[0] ?? firstName;
                lastName = parts.slice(1).join(' ') || lastName;
            }
            await client_2.prisma.user.update({
                where: { id },
                data: {
                    ...(data.email != null ? { email: String(data.email) } : {}),
                    firstName,
                    lastName,
                    ...(data.phone != null || data.mobile_phone != null
                        ? { phone: String(data.phone ?? data.mobile_phone ?? '') || null }
                        : {}),
                },
            });
            const refreshed = await client_2.prisma.user.findFirst({
                where: { id, role: client_1.UserRole.CUSTOMER },
                include: { addresses: { orderBy: { isDefault: 'desc' }, take: 1 } },
            });
            if (!refreshed) {
                (0, compatHttp_1.compatJson)(res, { error: 'Kund hittades inte' }, 404);
                return;
            }
            (0, compatHttp_1.compatJson)(res, (0, mappers_1.userToPhpCustomer)(refreshed, refreshed.addresses[0] ?? null, customerNumberForUser(refreshed.id)));
            void (0, compatCache_1.invalidateCompatCustomers)();
            return;
        }
        if (method === 'DELETE') {
            const id = req.query.id;
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'ID krävs' }, 400);
                return;
            }
            const bookingCount = await client_2.prisma.booking.count({ where: { userId: id } });
            if (bookingCount > 0) {
                (0, compatHttp_1.compatJson)(res, { error: 'Kan inte ta bort kund med bokningar' }, 400);
                return;
            }
            const u = await client_2.prisma.user.findFirst({ where: { id, role: client_1.UserRole.CUSTOMER } });
            if (!u) {
                (0, compatHttp_1.compatJson)(res, { error: 'Kund hittades inte' }, 404);
                return;
            }
            await client_2.prisma.user.delete({ where: { id } });
            (0, compatHttp_1.compatJson)(res, { id, deleted: 1 });
            void (0, compatCache_1.invalidateCompatCustomers)();
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('compat customers:', e);
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Server error' }, 500);
    }
}
//# sourceMappingURL=customersCompatController.js.map