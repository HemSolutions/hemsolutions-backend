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
exports.createBookingValidation = void 0;
exports.createBooking = createBooking;
exports.getBookings = getBookings;
exports.getBookingById = getBookingById;
exports.cancelBooking = cancelBooking;
exports.assignWorker = assignWorker;
exports.getAllBookings = getAllBookings;
exports.updateBookingStatus = updateBookingStatus;
const express_validator_1 = require("express-validator");
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const response_1 = require("../utils/response");
const email_1 = require("../utils/email");
const jobQueue_1 = require("../services/jobs/jobQueue");
const bookingAutomationService = __importStar(require("../services/automation/bookingAutomationService"));
const workerAssignmentService = __importStar(require("../services/automation/workerAssignmentService"));
const invoiceAutomationService = __importStar(require("../services/automation/invoiceAutomationService"));
const notificationOrchestrator = __importStar(require("../services/automation/notificationOrchestrator"));
const adminSocketService = __importStar(require("../services/automation/adminSocketService"));
exports.createBookingValidation = [
    (0, express_validator_1.body)('serviceId').isUUID().withMessage('Valid service ID is required'),
    (0, express_validator_1.body)('addressId').isUUID().withMessage('Valid address ID is required'),
    (0, express_validator_1.body)('scheduledDate').isISO8601().withMessage('Valid date is required'),
    (0, express_validator_1.body)('scheduledTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time (HH:MM) is required'),
    (0, express_validator_1.body)('notes').optional().trim()
];
async function createBooking(req, res) {
    try {
        const userId = req.user.userId;
        const { serviceId, addressId, scheduledDate, scheduledTime, notes, extras } = req.body;
        // Verify service exists
        const service = await client_2.prisma.service.findUnique({
            where: { id: serviceId, isActive: true }
        });
        if (!service) {
            (0, response_1.errorResponse)(res, 'Service not found', 404);
            return;
        }
        // Verify address belongs to user
        const address = await client_2.prisma.address.findFirst({
            where: { id: addressId, userId }
        });
        if (!address) {
            (0, response_1.errorResponse)(res, 'Address not found', 404);
            return;
        }
        // Calculate prices
        const basePrice = service.price;
        const extrasList = Array.isArray(extras) ? extras : [];
        const extrasPrice = extrasList.length > 0 ? extrasList.length * 200 : 0; // 200 SEK per extra
        const totalPrice = basePrice + extrasPrice;
        // Create booking
        const booking = await client_2.prisma.booking.create({
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
        await client_2.prisma.invoice.create({
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
        await bookingAutomationService.ensureInitialMessageThread(booking.id, userId);
        (0, jobQueue_1.enqueueJob)({
            type: 'SEND_NOTIFICATION',
            payload: {
                userId,
                type: client_1.NotificationType.BOOKING_CREATED,
                title: 'Booking Confirmed',
                message: `Your ${service.name} has been scheduled for ${scheduledDate} at ${scheduledTime}`,
                data: { bookingId: booking.id },
            },
        });
        const user = await client_2.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, firstName: true },
        });
        if (user) {
            (0, jobQueue_1.enqueueJob)({
                type: 'SEND_EMAIL',
                payload: {
                    to: user.email,
                    subject: 'Your HemSolutions booking is confirmed',
                    html: (0, email_1.getBookingConfirmationEmailTemplate)(user.firstName, service.name, new Date(scheduledDate).toLocaleDateString('sv-SE'), scheduledTime),
                },
            });
        }
        const finalBooking = await client_2.prisma.booking.findUnique({
            where: { id: booking.id },
            include: {
                service: true,
                worker: { select: { firstName: true, lastName: true } }
            }
        });
        adminSocketService.emitAdminDashboardRefresh(req.app);
        const response = {
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
        (0, response_1.successResponse)(res, response, 'Booking created successfully', 201);
    }
    catch (error) {
        console.error('Create booking error:', error);
        (0, response_1.errorResponse)(res, 'Failed to create booking', 500);
    }
}
async function getBookings(req, res) {
    try {
        const userId = req.user.userId;
        const { status, page = '1', limit = '10' } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const where = { userId };
        if (status) {
            where.status = status;
        }
        const [bookings, total] = await Promise.all([
            client_2.prisma.booking.findMany({
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
            client_2.prisma.booking.count({ where })
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
        (0, response_1.paginatedResponse)(res, formatted, total, pageNum, limitNum);
    }
    catch (error) {
        console.error('Get bookings error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get bookings', 500);
    }
}
async function getBookingById(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const booking = await client_2.prisma.booking.findFirst({
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
            (0, response_1.errorResponse)(res, 'Booking not found', 404);
            return;
        }
        (0, response_1.successResponse)(res, booking);
    }
    catch (error) {
        console.error('Get booking error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get booking', 500);
    }
}
async function cancelBooking(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { reason } = req.body;
        const booking = await client_2.prisma.booking.findFirst({
            where: { id, userId },
            include: { service: true }
        });
        if (!booking) {
            (0, response_1.errorResponse)(res, 'Booking not found', 404);
            return;
        }
        // Only allow cancellation if booking is not already completed or cancelled
        if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
            (0, response_1.errorResponse)(res, 'Cannot cancel this booking', 400);
            return;
        }
        const updatedBooking = await client_2.prisma.booking.update({
            where: { id },
            data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancellationReason: reason || 'Cancelled by user'
            }
        });
        // Cancel associated invoice
        if (booking.paymentStatus !== 'PAID') {
            await client_2.prisma.invoice.updateMany({
                where: { bookingId: id },
                data: { status: 'CANCELLED' }
            });
        }
        await notificationOrchestrator.afterBookingCancelled({
            userId,
            booking: { ...updatedBooking, service: booking.service }
        });
        adminSocketService.emitAdminDashboardRefresh(req.app);
        (0, response_1.successResponse)(res, updatedBooking, 'Booking cancelled successfully');
    }
    catch (error) {
        console.error('Cancel booking error:', error);
        (0, response_1.errorResponse)(res, 'Failed to cancel booking', 500);
    }
}
// Admin: Assign worker to booking
async function assignWorker(req, res) {
    try {
        const { id } = req.params;
        const { workerId } = req.body;
        // Verify worker exists
        const worker = await client_2.prisma.worker.findUnique({
            where: { id: workerId, isActive: true }
        });
        if (!worker) {
            (0, response_1.errorResponse)(res, 'Worker not found', 404);
            return;
        }
        const booking = await client_2.prisma.booking.findUnique({
            where: { id },
            include: { user: true, service: true }
        });
        if (!booking) {
            (0, response_1.errorResponse)(res, 'Booking not found', 404);
            return;
        }
        await workerAssignmentService.assertNoCollision(workerId, booking);
        const updatedBooking = await client_2.prisma.booking.update({
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
        (0, response_1.successResponse)(res, updatedBooking, 'Worker assigned successfully');
    }
    catch (error) {
        console.error('Assign worker error:', error);
        (0, response_1.errorResponse)(res, 'Failed to assign worker', 500);
    }
}
// Get all bookings (admin)
async function getAllBookings(req, res) {
    try {
        const { status, page = '1', limit = '20' } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const where = {};
        if (status) {
            where.status = status;
        }
        const [bookings, total] = await Promise.all([
            client_2.prisma.booking.findMany({
                where,
                include: {
                    user: { select: { firstName: true, lastName: true, email: true } },
                    service: { select: { name: true } },
                    worker: { select: { firstName: true, lastName: true } },
                    address: true
                },
                orderBy: { scheduledDate: 'asc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum
            }),
            client_2.prisma.booking.count({ where })
        ]);
        (0, response_1.paginatedResponse)(res, bookings, total, pageNum, limitNum);
    }
    catch (error) {
        console.error('Get all bookings error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get bookings', 500);
    }
}
// Update booking status (admin/worker)
async function updateBookingStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const booking = await client_2.prisma.booking.findUnique({
            where: { id },
            include: { user: true, service: true }
        });
        if (!booking) {
            (0, response_1.errorResponse)(res, 'Booking not found', 404);
            return;
        }
        const updateData = { status };
        if (status === 'COMPLETED') {
            updateData.completedAt = new Date();
            // Update worker stats
            if (booking.workerId) {
                await client_2.prisma.worker.update({
                    where: { id: booking.workerId },
                    data: {
                        totalJobs: { increment: 1 }
                    }
                });
            }
        }
        const updatedBooking = await client_2.prisma.booking.update({
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
                notificationType: client_1.NotificationType.BOOKING_COMPLETED
            });
        }
        // Notify user of status change
        const statusMessages = {
            CONFIRMED: 'Your booking has been confirmed',
            IN_PROGRESS: 'Your cleaning is in progress',
        };
        const statusToType = {
            CONFIRMED: client_1.NotificationType.BOOKING_CONFIRMED,
            IN_PROGRESS: client_1.NotificationType.BOOKING_ASSIGNED,
        };
        if (statusMessages[status] && statusToType[status]) {
            (0, jobQueue_1.enqueueJob)({
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
        (0, response_1.successResponse)(res, updatedBooking, 'Status updated successfully');
    }
    catch (error) {
        console.error('Update booking status error:', error);
        (0, response_1.errorResponse)(res, 'Failed to update status', 500);
    }
}
//# sourceMappingURL=bookingController.js.map