import { Request, Response } from 'express';
import { body } from 'express-validator';
import { prisma } from '../prisma/client';
import { successResponse, errorResponse } from '../utils/response';
import { CreateServiceInput } from '../types';

export const createServiceValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('slug').trim().notEmpty().withMessage('Slug is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('duration').isInt({ min: 15 }).withMessage('Duration must be at least 15 minutes'),
  body('category').isIn(['RESIDENTIAL', 'COMMERCIAL', 'MOVE_IN_OUT', 'POST_CONSTRUCTION', 'SPECIALIZED']).withMessage('Invalid category')
];

export async function getServices(req: Request, res: Response): Promise<void> {
  try {
    const { category, popular, search } = req.query;

    const where: any = { isActive: true };

    if (category) {
      where.category = category;
    }

    if (popular === 'true') {
      where.isPopular = true;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const services = await prisma.service.findMany({
      where,
      orderBy: [
        { isPopular: 'desc' },
        { sortOrder: 'asc' },
        { name: 'asc' }
      ]
    });

    successResponse(res, services);
  } catch (error) {
    console.error('Get services error:', error);
    errorResponse(res, 'Failed to get services', 500);
  }
}

export async function getServiceBySlug(req: Request, res: Response): Promise<void> {
  try {
    const { slug } = req.params;

    const service = await prisma.service.findUnique({
      where: { slug, isActive: true }
    });

    if (!service) {
      errorResponse(res, 'Service not found', 404);
      return;
    }

    successResponse(res, service);
  } catch (error) {
    console.error('Get service error:', error);
    errorResponse(res, 'Failed to get service', 500);
  }
}

// Admin functions
export async function createService(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body as CreateServiceInput;

    // Check if slug exists
    const existing = await prisma.service.findUnique({
      where: { slug: data.slug }
    });

    if (existing) {
      errorResponse(res, 'Service with this slug already exists', 409);
      return;
    }

    const service = await prisma.service.create({
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

    successResponse(res, service, 'Service created successfully', 201);
  } catch (error) {
    console.error('Create service error:', error);
    errorResponse(res, 'Failed to create service', 500);
  }
}

export async function updateService(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const data = req.body;

    const service = await prisma.service.update({
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

    successResponse(res, service, 'Service updated successfully');
  } catch (error) {
    console.error('Update service error:', error);
    errorResponse(res, 'Failed to update service', 500);
  }
}

export async function deleteService(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Check if service has bookings
    const bookingsCount = await prisma.booking.count({
      where: { serviceId: id }
    });

    if (bookingsCount > 0) {
      // Soft delete - just mark as inactive
      await prisma.service.update({
        where: { id },
        data: { isActive: false }
      });
      successResponse(res, null, 'Service deactivated successfully');
      return;
    }

    await prisma.service.delete({
      where: { id }
    });

    successResponse(res, null, 'Service deleted successfully');
  } catch (error) {
    console.error('Delete service error:', error);
    errorResponse(res, 'Failed to delete service', 500);
  }
}
