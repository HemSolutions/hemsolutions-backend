"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServiceValidation = void 0;
exports.getServices = getServices;
exports.getServiceBySlug = getServiceBySlug;
exports.createService = createService;
exports.updateService = updateService;
exports.deleteService = deleteService;
const express_validator_1 = require("express-validator");
const client_1 = require("../prisma/client");
const response_1 = require("../utils/response");
exports.createServiceValidation = [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Name is required'),
    (0, express_validator_1.body)('slug').trim().notEmpty().withMessage('Slug is required'),
    (0, express_validator_1.body)('description').trim().notEmpty().withMessage('Description is required'),
    (0, express_validator_1.body)('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    (0, express_validator_1.body)('duration').isInt({ min: 15 }).withMessage('Duration must be at least 15 minutes'),
    (0, express_validator_1.body)('category').isIn(['RESIDENTIAL', 'COMMERCIAL', 'MOVE_IN_OUT', 'POST_CONSTRUCTION', 'SPECIALIZED']).withMessage('Invalid category')
];
async function getServices(req, res) {
    try {
        const { category, popular, search } = req.query;
        const where = { isActive: true };
        if (category) {
            where.category = category;
        }
        if (popular === 'true') {
            where.isPopular = true;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }
        const services = await client_1.prisma.service.findMany({
            where,
            orderBy: [
                { isPopular: 'desc' },
                { sortOrder: 'asc' },
                { name: 'asc' }
            ]
        });
        (0, response_1.successResponse)(res, services);
    }
    catch (error) {
        console.error('Get services error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get services', 500);
    }
}
async function getServiceBySlug(req, res) {
    try {
        const { slug } = req.params;
        const service = await client_1.prisma.service.findUnique({
            where: { slug, isActive: true }
        });
        if (!service) {
            (0, response_1.errorResponse)(res, 'Service not found', 404);
            return;
        }
        (0, response_1.successResponse)(res, service);
    }
    catch (error) {
        console.error('Get service error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get service', 500);
    }
}
// Admin functions
async function createService(req, res) {
    try {
        const data = req.body;
        // Check if slug exists
        const existing = await client_1.prisma.service.findUnique({
            where: { slug: data.slug }
        });
        if (existing) {
            (0, response_1.errorResponse)(res, 'Service with this slug already exists', 409);
            return;
        }
        const service = await client_1.prisma.service.create({
            data: {
                name: data.name,
                slug: data.slug,
                description: data.description,
                shortDesc: data.shortDesc,
                price: data.price,
                priceType: data.priceType || 'FIXED',
                duration: data.duration,
                category: data.category,
                image: data.image,
                features: data.features || []
            }
        });
        (0, response_1.successResponse)(res, service, 'Service created successfully', 201);
    }
    catch (error) {
        console.error('Create service error:', error);
        (0, response_1.errorResponse)(res, 'Failed to create service', 500);
    }
}
async function updateService(req, res) {
    try {
        const { id } = req.params;
        const data = req.body;
        const service = await client_1.prisma.service.update({
            where: { id },
            data: {
                name: data.name,
                description: data.description,
                shortDesc: data.shortDesc,
                price: data.price,
                priceType: data.priceType,
                duration: data.duration,
                category: data.category,
                image: data.image,
                features: data.features,
                isActive: data.isActive,
                isPopular: data.isPopular,
                sortOrder: data.sortOrder
            }
        });
        (0, response_1.successResponse)(res, service, 'Service updated successfully');
    }
    catch (error) {
        console.error('Update service error:', error);
        (0, response_1.errorResponse)(res, 'Failed to update service', 500);
    }
}
async function deleteService(req, res) {
    try {
        const { id } = req.params;
        // Check if service has bookings
        const bookingsCount = await client_1.prisma.booking.count({
            where: { serviceId: id }
        });
        if (bookingsCount > 0) {
            // Soft delete - just mark as inactive
            await client_1.prisma.service.update({
                where: { id },
                data: { isActive: false }
            });
            (0, response_1.successResponse)(res, null, 'Service deactivated successfully');
            return;
        }
        await client_1.prisma.service.delete({
            where: { id }
        });
        (0, response_1.successResponse)(res, null, 'Service deleted successfully');
    }
    catch (error) {
        console.error('Delete service error:', error);
        (0, response_1.errorResponse)(res, 'Failed to delete service', 500);
    }
}
//# sourceMappingURL=serviceController.js.map