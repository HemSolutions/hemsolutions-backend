import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { successResponse, errorResponse } from '../utils/response';
import * as adminMetricsService from '../services/automation/adminMetricsService';
import * as bookingDomainService from '../domain/bookingDomainService';
import { DashboardStats, AnalyticsData } from '../types';

export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  try {
    const stats: DashboardStats = await adminMetricsService.fetchDashboardStats();

    successResponse(res, stats);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    errorResponse(res, 'Failed to get dashboard stats', 500);
  }
}

export async function getAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    // Bookings by month
    const bookingsByMonth = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('month', "scheduledDate") as month,
        COUNT(*) as count
      FROM bookings
      WHERE "scheduledDate" >= ${sixMonthsAgo}
      GROUP BY DATE_TRUNC('month', "scheduledDate")
      ORDER BY month ASC
    ` as { month: Date; count: bigint }[];

    // Revenue by month
    const revenueByMonth = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('month', "paidAt") as month,
        SUM(total) as amount
      FROM invoices
      WHERE "paidAt" >= ${sixMonthsAgo} AND status = 'PAID'
      GROUP BY DATE_TRUNC('month', "paidAt")
      ORDER BY month ASC
    ` as { month: Date; amount: number }[];

    // Service popularity
    const servicePopularity = await prisma.booking.groupBy({
      by: ['serviceId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10
    });

    const services = await prisma.service.findMany({
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

    const analytics: AnalyticsData = {
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

    successResponse(res, analytics);
  } catch (error) {
    console.error('Get analytics error:', error);
    errorResponse(res, 'Failed to get analytics', 500);
  }
}

export async function getUsers(req: Request, res: Response): Promise<void> {
  try {
    const { role, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where: any = {};
    if (role) {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
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
      prisma.user.count({ where })
    ]);

    successResponse(res, {
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    errorResponse(res, 'Failed to get users', 500);
  }
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { isActive, role } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        isActive,
        role
      }
    });

    successResponse(res, user, 'User updated successfully');
  } catch (error) {
    console.error('Update user error:', error);
    errorResponse(res, 'Failed to update user', 500);
  }
}

export async function getWorkers(req: Request, res: Response): Promise<void> {
  try {
    const { isActive, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where: any = {};
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [workers, total] = await Promise.all([
      prisma.worker.findMany({
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
      prisma.worker.count({ where })
    ]);

    successResponse(res, {
      workers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get workers error:', error);
    errorResponse(res, 'Failed to get workers', 500);
  }
}

export async function createWorker(req: Request, res: Response): Promise<void> {
  try {
    const worker = await bookingDomainService.adminCreateWorker(req.body as Record<string, unknown>);
    successResponse(res, worker, 'Worker created successfully', 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'WORKER_EMAIL_EXISTS') {
      errorResponse(res, 'Worker with this email already exists', 409);
      return;
    }
    console.error('Create worker error:', error);
    errorResponse(res, 'Failed to create worker', 500);
  }
}

export async function updateWorker(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const worker = await bookingDomainService.adminUpdateWorker(id, req.body as Record<string, unknown>);

    successResponse(res, worker, 'Worker updated successfully');
  } catch (error) {
    console.error('Update worker error:', error);
    errorResponse(res, 'Failed to update worker', 500);
  }
}

export async function deleteWorker(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    try {
      await bookingDomainService.adminDeleteWorker(id);
      successResponse(res, null, 'Worker deleted successfully');
    } catch (error) {
      if (error instanceof Error && error.message === 'ACTIVE_BOOKINGS') {
        errorResponse(res, 'Cannot delete worker with active bookings', 400);
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error('Delete worker error:', error);
    errorResponse(res, 'Failed to delete worker', 500);
  }
}
