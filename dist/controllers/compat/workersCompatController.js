"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWorkers = handleWorkers;
const client_1 = require("../../prisma/client");
const compatHttp_1 = require("./compatHttp");
const mappers_1 = require("./mappers");
/**
 * Mirrors `hemsolutions/app/api/workers.php` — raw JSON.
 */
async function handleWorkers(req, res) {
    try {
        const method = req.method;
        if (method === 'GET') {
            const id = req.query.id;
            if (id) {
                const w = await client_1.prisma.worker.findUnique({ where: { id } });
                if (!w) {
                    (0, compatHttp_1.compatJson)(res, { error: 'Arbetare hittades inte' }, 404);
                    return;
                }
                (0, compatHttp_1.compatJson)(res, (0, mappers_1.workerToPhp)(w));
                return;
            }
            const workers = await client_1.prisma.worker.findMany({
                where: { isActive: true },
                orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
            });
            (0, compatHttp_1.compatJson)(res, workers.map((w) => (0, mappers_1.workerToPhp)(w)));
            return;
        }
        if (method === 'POST') {
            const data = req.body;
            const name = String(data.name ?? '').trim();
            if (!name) {
                (0, compatHttp_1.compatJson)(res, { error: 'Namn krävs' }, 400);
                return;
            }
            const parts = name.split(/\s+/);
            const firstName = parts[0] ?? 'Worker';
            const lastName = parts.slice(1).join(' ') || '—';
            const email = String(data.email ?? `worker-${Date.now()}-${Math.floor(Math.random() * 1e6)}@compat.local`);
            const w = await client_1.prisma.worker.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    phone: String(data.phone ?? '000000000'),
                    isActive: (data.is_active ?? 1) === 1 || data.is_active === true,
                },
            });
            const created = await client_1.prisma.worker.findUnique({ where: { id: w.id } });
            (0, compatHttp_1.compatJson)(res, created ? (0, mappers_1.workerToPhp)(created) : (0, mappers_1.workerToPhp)(w), 201);
            return;
        }
        if (method === 'PUT') {
            const id = req.query.id;
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'ID krävs' }, 400);
                return;
            }
            const data = req.body;
            const name = String(data.name ?? '').trim();
            if (!name) {
                (0, compatHttp_1.compatJson)(res, { error: 'Namn krävs' }, 400);
                return;
            }
            const parts = name.split(/\s+/);
            const firstName = parts[0] ?? 'Worker';
            const lastName = parts.slice(1).join(' ') || '—';
            await client_1.prisma.worker.update({
                where: { id },
                data: {
                    firstName,
                    lastName,
                    email: data.email != null ? String(data.email) : undefined,
                    phone: data.phone != null ? String(data.phone) : undefined,
                    isActive: data.is_active !== undefined
                        ? data.is_active === 1 || data.is_active === true
                        : undefined,
                },
            });
            (0, compatHttp_1.compatJson)(res, { message: 'Arbetare uppdaterad' });
            return;
        }
        if (method === 'DELETE') {
            const id = req.query.id;
            if (!id) {
                (0, compatHttp_1.compatJson)(res, { error: 'ID krävs' }, 400);
                return;
            }
            await client_1.prisma.worker.update({
                where: { id },
                data: { isActive: false },
            });
            const soft = await client_1.prisma.worker.findUnique({ where: { id } });
            (0, compatHttp_1.compatJson)(res, soft ? (0, mappers_1.workerToPhp)(soft) : { id, is_active: 0 });
            return;
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        console.error('compat workers:', e);
        (0, compatHttp_1.compatJson)(res, { error: e instanceof Error ? e.message : 'Server error' }, 500);
    }
}
//# sourceMappingURL=workersCompatController.js.map