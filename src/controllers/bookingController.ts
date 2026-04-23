import { Request, Response } from 'express';
import { body } from 'express-validator';
import { NotificationType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';
import { getBookingConfirmationEmailTemplate } from '../utils/email';
import { enqueueJob } from '../services/jobs/jobQueue';
import * as bookingAutomationService from '../services/automation/bookingAutomationService';
import * as workerAssignmentService from '../services/automation/workerAssignmentService';
import * as invoiceAutomationService from '../services/automation/invoiceAutomationService';
import * as notificationOrchestrator from '../services/automation/notificationOrchestrator';
import * as adminSocketService from '../services/automation/adminSocketService';
import { CreateBookingInput, BookingResponse } from '../types';
import { hashPassword } from '../utils/password';
import crypto from 'crypto';

export const createBookingValidation = [
  body('serviceId').isUUID().withMessage('Valid service ID is required'),
  body('addressId').isUUID().withMessage('Valid address ID is required'),
  body('scheduledDate').isISO8601().withMessage('Valid date is required'),
  body('scheduledTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time (HH:MM) is required'),
  body('notes').optional().trim()
];

export async function createBooking(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { serviceId, addressId, scheduledDate, scheduledTime, notes, extras } = req.body as CreateBookingInput;

    // Verify service exists
    const service = await prisma.service.findUnique({
      where: { id: serviceId, isActive: true }
    });

    if (!service) {
      errorResponse(res, 'Service not found', 404);
      return;
    }

    // Verify address belongs to user
    const address = await prisma.address.findFirst({
      where: { id: addressId, userId }
    });

    if (!address) {
      errorResponse(res, 'Address not found', 404);
      return;
    }

    // Calculate prices
    const basePrice = service.price;
    const extrasList = Array.isArray(extras) ? extras : [];
    const extrasPrice = extrasList.length > 0 ? extrasList.length * 200 : 0; // 200 SEK per extra
    const totalPrice = basePrice + extrasPrice;

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        userId,
        serviceId,
        addressId,
        scheduledDate: new Date(scheduledDate),
        scheduledTime,
        duration: service.duration,
        basePrice,
        extrasPrice,
        totalPrice,
        notes,
        status: 'PENDING',
        paymentStatus: 'PENDING'
      },
      include: {
        service: true,
        address: true
      }
    });

    await bookingAutomationService.runAfterBookingPersisted(booking);

    // Create invoice
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const taxRate = 0.25;
    const subtotal = totalPrice / (1 + taxRate);
    const taxAmount = totalPrice - subtotal;

    await prisma.invoice.create({
      data: {
        bookingId: booking.id,
        userId,
        invoiceNumber,
        subtotal,
        taxRate,
        taxAmount,
        total: totalPrice,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        items: {
          create: [
            {
              description: service.name,
              quantity: 1,
              unitPrice: basePrice,
              total: basePrice
            },
            ...(extrasList.length > 0
              ? [
                  {
                    description: `Extras: ${extrasList.join(', ')}`,
                    quantity: extrasList.length,
                    unitPrice: 200,
                    total: extrasPrice,
                  },
                ]
              : [])
          ]
        }
      }
    });
    await prisma.invoice.updateMany({
      where: { bookingId: booking.id },
      data: { pdfUrl: `/api/compat/pdf/invoice?id=${booking.id}` },
    });

    await bookingAutomationService.ensureInitialMessageThread(booking.id, userId);

    enqueueJob({
      type: 'SEND_NOTIFICATION',
      payload: {
        userId,
        type: NotificationType.BOOKING_CREATED,
        title: 'Booking Confirmed',
        message: `Your ${service.name} has been scheduled for ${scheduledDate} at ${scheduledTime}`,
        data: { bookingId: booking.id },
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    if (user) {
      enqueueJob({
        type: 'SEND_EMAIL',
        payload: {
          to: user.email,
          subject: 'Your HemSolutions booking is confirmed',
          html: getBookingConfirmationEmailTemplate(
            user.firstName,
            service.name,
            new Date(scheduledDate).toLocaleDateString('sv-SE'),
            scheduledTime
          ),
        },
      });
    }

    const finalBooking = await prisma.booking.findUnique({
      where: { id: booking.id },
      include: {
        service: true,
        worker: { select: { firstName: true, lastName: true } }
      }
    });

    adminSocketService.emitAdminDashboardRefresh(req.app);

    const response: BookingResponse = {
      id: booking.id,
      userId: booking.userId,
      serviceId: booking.serviceId,
      serviceName: booking.service.name,
      workerId: finalBooking?.workerId ?? null,
      workerName: finalBooking?.worker
        ? `${finalBooking.worker.firstName} ${finalBooking.worker.lastName}`
        : null,
      scheduledDate: booking.scheduledDate,
      scheduledTime: booking.scheduledTime,
      status: finalBooking?.status ?? booking.status,
      totalPrice: booking.totalPrice,
      paymentStatus: booking.paymentStatus,
      notes: booking.notes,
      createdAt: booking.createdAt
    };

    successResponse(res, response, 'Booking created successfully', 201);
  } catch (error) {
    console.error('Create booking error:', error);
    errorResponse(res, 'Failed to create booking', 500);
  }
}

export async function getBookings(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { status, page = '1', limit = '10' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          service: { select: { name: true } },
          worker: { select: { firstName: true, lastName: true } },
          invoice: { select: { status: true, total: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.booking.count({ where })
    ]);

    const formatted = bookings.map(booking => ({
      id: booking.id,
      serviceName: booking.service.name,
      workerName: booking.worker ? `${booking.worker.firstName} ${booking.worker.lastName}` : null,
      scheduledDate: booking.scheduledDate,
      scheduledTime: booking.scheduledTime,
      status: booking.status,
      totalPrice: booking.totalPrice,
      paymentStatus: booking.paymentStatus,
      createdAt: booking.createdAt
    }));

    paginatedResponse(res, formatted, total, pageNum, limitNum);
  } catch (error) {
    console.error('Get bookings error:', error);
    errorResponse(res, 'Failed to get bookings', 500);
  }
}

export async function getBookingById(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const booking = await prisma.booking.findFirst({
      where: { id, userId },
      include: {
        service: true,
        address: true,
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            phone: true,
            rating: true,
            totalJobs: true
          }
        },
        invoice: {
          include: { items: true }
        }
      }
    });

    if (!booking) {
      errorResponse(res, 'Booking not found', 404);
      return;
    }

    successResponse(res, booking);
  } catch (error) {
    console.error('Get booking error:', error);
    errorResponse(res, 'Failed to get booking', 500);
  }
}

export async function cancelBooking(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { reason } = req.body;

    const booking = await prisma.booking.findFirst({
      where: { id, userId },
      include: { service: true }
    });

    if (!booking) {
      errorResponse(res, 'Booking not found', 404);
      return;
    }

    // Only allow cancellation if booking is not already completed or cancelled
    if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
      errorResponse(res, 'Cannot cancel this booking', 400);
      return;
    }

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason || 'Cancelled by user'
      }
    });

    // Cancel associated invoice
    if (booking.paymentStatus !== 'PAID') {
      await prisma.invoice.updateMany({
        where: { bookingId: id },
        data: { status: 'CANCELLED' }
      });
    }

    await notificationOrchestrator.afterBookingCancelled({
      userId,
      booking: { ...updatedBooking, service: booking.service }
    });

    adminSocketService.emitAdminDashboardRefresh(req.app);

    successResponse(res, updatedBooking, 'Booking cancelled successfully');
  } catch (error) {
    console.error('Cancel booking error:', error);
    errorResponse(res, 'Failed to cancel booking', 500);
  }
}

// Admin: Assign worker to booking
export async function assignWorker(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { workerId } = req.body;

    // Verify worker exists
    const worker = await prisma.worker.findUnique({
      where: { id: workerId, isActive: true }
    });

    if (!worker) {
      errorResponse(res, 'Worker not found', 404);
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { user: true, service: true }
    });

    if (!booking) {
      errorResponse(res, 'Booking not found', 404);
      return;
    }

    await workerAssignmentService.assertNoCollision(workerId, booking);

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        workerId,
        status: 'ASSIGNED'
      },
      include: {
        worker: true
      }
    });

    await notificationOrchestrator.afterWorkerAssigned({
      userId: booking.userId,
      bookingId: id,
      worker,
      serviceName: booking.service.name
    });

    successResponse(res, updatedBooking, 'Worker assigned successfully');
  } catch (error) {
    console.error('Assign worker error:', error);
    errorResponse(res, 'Failed to assign worker', 500);
  }
}

// Get all bookings (admin)
export async function getAllBookings(req: Request, res: Response): Promise<void> {
  try {
    const { status, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          service: { select: { id: true, name: true } },
          worker: { select: { id: true, firstName: true, lastName: true } },
          address: true
        },
        orderBy: { scheduledDate: 'asc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.booking.count({ where })
    ]);

    paginatedResponse(res, bookings, total, pageNum, limitNum);
  } catch (error) {
    console.error('Get all bookings error:', error);
    errorResponse(res, 'Failed to get bookings', 500);
  }
}

// Update booking status (admin/worker)
export async function updateBookingStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { user: true, service: true }
    });

    if (!booking) {
      errorResponse(res, 'Booking not found', 404);
      return;
    }

    const updateData: any = { status };

    if (status === 'COMPLETED') {
      updateData.completedAt = new Date();
      
      // Update worker stats
      if (booking.workerId) {
        await prisma.worker.update({
          where: { id: booking.workerId },
          data: {
            totalJobs: { increment: 1 }
          }
        });
      }
    }

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: updateData
    });

    if (status === 'COMPLETED') {
      await invoiceAutomationService.onBookingCompleted(id, booking.userId);
      await notificationOrchestrator.afterBookingStatusChange({
        userId: booking.userId,
        bookingId: id,
        status,
        message: 'Your cleaning has been completed',
        notificationType: NotificationType.BOOKING_COMPLETED
      });
    }

    // Notify user of status change
    const statusMessages: Record<string, string> = {
      CONFIRMED: 'Your booking has been confirmed',
      IN_PROGRESS: 'Your cleaning is in progress',
    };

    const statusToType: Record<string, NotificationType> = {
      CONFIRMED: NotificationType.BOOKING_CONFIRMED,
      IN_PROGRESS: NotificationType.BOOKING_ASSIGNED,
    };
    if (statusMessages[status] && statusToType[status]) {
      enqueueJob({
        type: 'SEND_NOTIFICATION',
        payload: {
          userId: booking.userId,
          type: statusToType[status],
          title: status.replace('_', ' '),
          message: statusMessages[status],
          data: { bookingId: id },
        },
      });
    }

    successResponse(res, updatedBooking, 'Status updated successfully');
  } catch (error) {
    console.error('Update booking status error:', error);
    errorResponse(res, 'Failed to update status', 500);
  }
}

export async function createPublicBooking(req: Request, res: Response): Promise<void> {
  try {
    const {
      serviceSlug,
      postcode,
      address,
      scheduledDate,
      scheduledTime,
      firstName,
      lastName,
      email,
      phone,
      notes,
    } = req.body as Record<string, string>;

    if (!serviceSlug || !address || !scheduledDate || !scheduledTime || !firstName || !lastName || !email) {
      errorResponse(res, 'Missing required booking fields', 400);
      return;
    }

    const service =
      (await prisma.service.findFirst({ where: { slug: serviceSlug, isActive: true } })) ||
      (await prisma.service.findFirst({ where: { isActive: true, name: { contains: serviceSlug, mode: 'insensitive' } } }));

    if (!service) {
      errorResponse(res, 'Service not found', 404);
      return;
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const generatedPassword = crypto.randomBytes(12).toString('hex');
      const hashedPassword = await hashPassword(generatedPassword);
      user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
        },
      });
    }

    const bookingAddress = await prisma.address.create({
      data: {
        userId: user.id,
        label: 'Bokningsadress',
        street: address,
        city: 'Stockholm',
        zipCode: postcode || '00000',
        isDefault: false,
      },
    });

    const basePrice = service.price;
    const totalPrice = basePrice;
    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        serviceId: service.id,
        addressId: bookingAddress.id,
        scheduledDate: new Date(scheduledDate),
        scheduledTime,
        duration: service.duration,
        basePrice,
        extrasPrice: 0,
        totalPrice,
        notes: notes || 'Created from website public form',
        status: 'PENDING',
        paymentStatus: 'PENDING',
      },
    });

    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const taxRate = 0.25;
    const subtotal = totalPrice / (1 + taxRate);
    const taxAmount = totalPrice - subtotal;

    await prisma.invoice.create({
      data: {
        bookingId: booking.id,
        userId: user.id,
        invoiceNumber,
        subtotal,
        taxRate,
        taxAmount,
        total: totalPrice,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        items: {
          create: [{ description: service.name, quantity: 1, unitPrice: basePrice, total: basePrice }],
        },
      },
    });
    await prisma.invoice.updateMany({
      where: { bookingId: booking.id },
      data: { pdfUrl: `/api/compat/pdf/invoice?id=${booking.id}` },
    });

    enqueueJob({
      type: 'SEND_EMAIL',
      payload: {
        to: 'info@hemsolutions.se',
        subject: `Ny bokning: ${service.name}`,
        html: `
          <h2>Ny bokning inkom</h2>
          <p><strong>Namn:</strong> ${firstName} ${lastName}</p>
          <p><strong>E-post:</strong> ${email}</p>
          <p><strong>Telefon:</strong> ${phone || '-'}</p>
          <p><strong>Adress:</strong> ${address}, ${postcode || '-'}</p>
          <p><strong>Tjänst:</strong> ${service.name}</p>
          <p><strong>Datum/Tid:</strong> ${scheduledDate} ${scheduledTime}</p>
        `,
      },
    });

    successResponse(res, { bookingId: booking.id }, 'Booking submitted successfully', 201);
  } catch (error) {
    console.error('Create public booking error:', error);
    errorResponse(res, 'Failed to create public booking', 500);
  }
}

export async function rescheduleBooking(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { scheduledDate, scheduledTime, duration } = req.body as {
      scheduledDate?: string;
      scheduledTime?: string;
      duration?: number;
    };

    if (!scheduledDate || !scheduledTime) {
      errorResponse(res, 'scheduledDate and scheduledTime are required', 400);
      return;
    }

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      errorResponse(res, 'Booking not found', 404);
      return;
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        scheduledDate: new Date(scheduledDate),
        scheduledTime,
        duration: typeof duration === 'number' && duration > 0 ? duration : booking.duration,
      },
      include: {
        service: { select: { name: true } },
        worker: { select: { firstName: true, lastName: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    });

    successResponse(res, updated, 'Booking rescheduled successfully');
  } catch (error) {
    console.error('Reschedule booking error:', error);
    errorResponse(res, 'Failed to reschedule booking', 500);
  }
}
