"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchDashboardStats = fetchDashboardStats;
exports.fetchDashboardStatsPhpCompat = fetchDashboardStatsPhpCompat;
const client_1 = require("../../prisma/client");
/**
 * Admin dashboard KPIs for GET /admin/dashboard (see adminController.getDashboardStats).
 */
async function fetchDashboardStats() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const [totalBookings, bookingsToday, paidRevenue, activeWorkers, pendingInvoices] = await Promise.all([
        client_1.prisma.booking.count(),
        client_1.prisma.booking.count({
            where: {
                scheduledDate: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
        }),
        client_1.prisma.invoice.aggregate({
            where: { status: 'PAID' },
            _sum: { total: true },
        }),
        client_1.prisma.worker.count({ where: { isActive: true } }),
        client_1.prisma.invoice.count({
            where: {
                status: { in: ['DRAFT', 'SENT', 'OVERDUE'] },
            },
        }),
    ]);
    const totalRevenue = paidRevenue._sum.total ?? 0;
    return {
        totalBookings,
        bookingsToday,
        totalRevenue,
        activeWorkers,
        pendingInvoices,
    };
}
/** Shape expected by `hemsolutions/app` DashboardStats (snake_case, PHP compat). */
async function fetchDashboardStatsPhpCompat() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const startYear = new Date(Date.UTC(y, 0, 1));
    const startMonth = new Date(Date.UTC(y, m, 1));
    const nextMonth = new Date(Date.UTC(y, m + 1, 1));
    const paidInRange = (from, to) => ({
        status: 'PAID',
        OR: [
            { paidAt: { gte: from, lt: to } },
            { paidAt: null, updatedAt: { gte: from, lt: to } },
        ],
    });
    const [totalSalesYear, totalSalesMonth, outstanding, overdue, invoiceCount, paidInvoiceCount,] = await Promise.all([
        client_1.prisma.invoice.aggregate({
            where: paidInRange(startYear, new Date(Date.UTC(y + 1, 0, 1))),
            _sum: { total: true },
        }),
        client_1.prisma.invoice.aggregate({
            where: paidInRange(startMonth, nextMonth),
            _sum: { total: true },
        }),
        client_1.prisma.invoice.aggregate({
            where: { status: { in: ['DRAFT', 'SENT'] } },
            _sum: { total: true },
        }),
        client_1.prisma.invoice.aggregate({
            where: { status: 'OVERDUE' },
            _sum: { total: true },
        }),
        client_1.prisma.invoice.count(),
        client_1.prisma.invoice.count({ where: { status: 'PAID' } }),
    ]);
    return {
        total_sales_year: totalSalesYear._sum.total ?? 0,
        total_sales_month: totalSalesMonth._sum.total ?? 0,
        outstanding_amount: outstanding._sum.total ?? 0,
        overdue_amount: overdue._sum.total ?? 0,
        invoice_count: invoiceCount,
        paid_invoice_count: paidInvoiceCount,
    };
}
//# sourceMappingURL=adminMetricsService.js.map