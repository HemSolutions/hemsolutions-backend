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
exports.getDashboardStats = getDashboardStats;
exports.getAnalytics = getAnalytics;
exports.getUsers = getUsers;
exports.updateUser = updateUser;
exports.getWorkers = getWorkers;
exports.createWorker = createWorker;
exports.updateWorker = updateWorker;
exports.deleteWorker = deleteWorker;
const client_1 = require("../prisma/client");
const response_1 = require("../utils/response");
const adminMetricsService = __importStar(require("../services/automation/adminMetricsService"));
const bookingDomainService = __importStar(require("../domain/bookingDomainService"));
async function getDashboardStats(req, res) {
    try {
        const stats = await adminMetricsService.fetchDashboardStats();
        (0, response_1.successResponse)(res, stats);
    }
    catch (error) {
        console.error('Get dashboard stats error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get dashboard stats', 500);
    }
}
async function getAnalytics(req, res) {
    try {
        const now = new Date();
        const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        // Bookings by month
        const bookingsByMonth = await client_1.prisma.$queryRaw `
      SELECT 
        DATE_TRUNC('month', "scheduledDate") as month,
        COUNT(*) as count
      FROM bookings
      WHERE "scheduledDate" >= ${sixMonthsAgo}
      GROUP BY DATE_TRUNC('month', "scheduledDate")
      ORDER BY month ASC
    `;
        // Revenue by month
        const revenueByMonth = await client_1.prisma.$queryRaw `
      SELECT 
        DATE_TRUNC('month', "paidAt") as month,
        SUM(total) as amount
      FROM invoices
      WHERE "paidAt" >= ${sixMonthsAgo} AND status = 'PAID'
      GROUP BY DATE_TRUNC('month', "paidAt")
      ORDER BY month ASC
    `;
        // Service popularity
        const servicePopularity = await client_1.prisma.booking.groupBy({
            by: ['serviceId'],
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 10
        });
        const services = await client_1.prisma.service.findMany({
            where: { id: { in: servicePopularity.map(s => s.serviceId) } },
            select: { id: true, name: true }
        });
        const formattedServicePopularity = servicePopularity.map(sp => {
            const service = services.find(s => s.id === sp.serviceId);
            return {
                serviceName: service?.name || 'Unknown',
                bookings: Number(sp._count.id)
            };
        });
        const analytics = {
            bookingsByMonth: bookingsByMonth.map(b => ({
                month: b.month.toISOString().slice(0, 7),
                count: Number(b.count)
            })),
            revenueByMonth: revenueByMonth.map(r => ({
                month: r.month.toISOString().slice(0, 7),
                amount: Number(r.amount)
            })),
            servicesPopularity: formattedServicePopularity
        };
        (0, response_1.successResponse)(res, analytics);
    }
    catch (error) {
        console.error('Get analytics error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get analytics', 500);
    }
}
async function getUsers(req, res) {
    try {
        const { role, page = '1', limit = '20' } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const where = {};
        if (role) {
            where.role = role;
        }
        const [users, total] = await Promise.all([
            client_1.prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    role: true,
                    isActive: true,
                    isVerified: true,
                    createdAt: true,
                    lastLoginAt: true,
                    _count: {
                        select: {
                            bookings: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum
            }),
            client_1.prisma.user.count({ where })
        ]);
        (0, response_1.successResponse)(res, {
            users,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    }
    catch (error) {
        console.error('Get users error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get users', 500);
    }
}
async function updateUser(req, res) {
    try {
        const { id } = req.params;
        const { isActive, role } = req.body;
        const user = await client_1.prisma.user.update({
            where: { id },
            data: {
                isActive,
                role
            }
        });
        (0, response_1.successResponse)(res, user, 'User updated successfully');
    }
    catch (error) {
        console.error('Update user error:', error);
        (0, response_1.errorResponse)(res, 'Failed to update user', 500);
    }
}
async function getWorkers(req, res) {
    try {
        const { isActive, page = '1', limit = '20' } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const where = {};
        if (isActive !== undefined) {
            where.isActive = isActive === 'true';
        }
        const [workers, total] = await Promise.all([
            client_1.prisma.worker.findMany({
                where,
                include: {
                    _count: {
                        select: { bookings: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum
            }),
            client_1.prisma.worker.count({ where })
        ]);
        (0, response_1.successResponse)(res, {
            workers,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    }
    catch (error) {
        console.error('Get workers error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get workers', 500);
    }
}
async function createWorker(req, res) {
    try {
        const worker = await bookingDomainService.adminCreateWorker(req.body);
        (0, response_1.successResponse)(res, worker, 'Worker created successfully', 201);
    }
    catch (error) {
        if (error instanceof Error && error.message === 'WORKER_EMAIL_EXISTS') {
            (0, response_1.errorResponse)(res, 'Worker with this email already exists', 409);
            return;
        }
        console.error('Create worker error:', error);
        (0, response_1.errorResponse)(res, 'Failed to create worker', 500);
    }
}
async function updateWorker(req, res) {
    try {
        const { id } = req.params;
        const worker = await bookingDomainService.adminUpdateWorker(id, req.body);
        (0, response_1.successResponse)(res, worker, 'Worker updated successfully');
    }
    catch (error) {
        console.error('Update worker error:', error);
        (0, response_1.errorResponse)(res, 'Failed to update worker', 500);
    }
}
async function deleteWorker(req, res) {
    try {
        const { id } = req.params;
        try {
            await bookingDomainService.adminDeleteWorker(id);
            (0, response_1.successResponse)(res, null, 'Worker deleted successfully');
        }
        catch (error) {
            if (error instanceof Error && error.message === 'ACTIVE_BOOKINGS') {
                (0, response_1.errorResponse)(res, 'Cannot delete worker with active bookings', 400);
                return;
            }
            throw error;
        }
    }
    catch (error) {
        console.error('Delete worker error:', error);
        (0, response_1.errorResponse)(res, 'Failed to delete worker', 500);
    }
}
//# sourceMappingURL=adminController.js.map