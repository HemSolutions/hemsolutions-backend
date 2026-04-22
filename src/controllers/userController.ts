import { Request, Response } from 'express';
import { body } from 'express-validator';
import { prisma } from '../prisma/client';
import { hashPassword } from '../utils/password';
import { successResponse, errorResponse } from '../utils/response';
import { UpdateProfileInput, CreateAddressInput, UserResponse } from '../types';

export const updateProfileValidation = [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional().trim(),
  body('avatar').optional().trim().isURL().withMessage('Avatar must be a valid URL')
];

export const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
];

export const createAddressValidation = [
  body('label').trim().notEmpty().withMessage('Label is required'),
  body('street').trim().notEmpty().withMessage('Street is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('zipCode').trim().notEmpty().withMessage('ZIP code is required'),
  body('country').optional().trim(),
  body('isDefault').optional().isBoolean()
];

export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: true
      }
    });

    if (!user) {
      errorResponse(res, 'User not found', 404);
      return;
    }

    const response: UserResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      isVerified: user.isVerified,
      avatar: user.avatar,
      createdAt: user.createdAt
    };

    successResponse(res, { user: response, addresses: user.addresses });
  } catch (error) {
    console.error('Get profile error:', error);
    errorResponse(res, 'Failed to get profile', 500);
  }
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { firstName, lastName, phone, avatar } = req.body as UpdateProfileInput;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        phone,
        avatar
      }
    });

    const response: UserResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      isVerified: user.isVerified,
      avatar: user.avatar,
      createdAt: user.createdAt
    };

    successResponse(res, response, 'Profile updated successfully');
  } catch (error) {
    console.error('Update profile error:', error);
    errorResponse(res, 'Failed to update profile', 500);
  }
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      errorResponse(res, 'User not found', 404);
      return;
    }

    // Verify current password
    const { comparePassword } = await import('../utils/password.js');
    const isValid = await comparePassword(currentPassword, user.password);

    if (!isValid) {
      errorResponse(res, 'Current password is incorrect', 400);
      return;
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    successResponse(res, null, 'Password changed successfully');
  } catch (error) {
    console.error('Change password error:', error);
    errorResponse(res, 'Failed to change password', 500);
  }
}

// Address management
export async function getAddresses(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const addresses = await prisma.address.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' }
    });

    successResponse(res, addresses);
  } catch (error) {
    console.error('Get addresses error:', error);
    errorResponse(res, 'Failed to get addresses', 500);
  }
}

export async function createAddress(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { label, street, city, zipCode, country, isDefault, latitude, longitude } = req.body as CreateAddressInput;

    // If setting as default, remove default from other addresses
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false }
      });
    }

    const address = await prisma.address.create({
      data: {
        userId,
        label,
        street,
        city,
        zipCode,
        country: country || 'Sweden',
        isDefault: isDefault || false,
        latitude,
        longitude
      }
    });

    successResponse(res, address, 'Address added successfully', 201);
  } catch (error) {
    console.error('Create address error:', error);
    errorResponse(res, 'Failed to add address', 500);
  }
}

export async function updateAddress(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { label, street, city, zipCode, country, isDefault, latitude, longitude } = req.body;

    // Verify address belongs to user
    const existingAddress = await prisma.address.findFirst({
      where: { id, userId }
    });

    if (!existingAddress) {
      errorResponse(res, 'Address not found', 404);
      return;
    }

    // If setting as default, remove default from other addresses
    if (isDefault && !existingAddress.isDefault) {
      await prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false }
      });
    }

    const address = await prisma.address.update({
      where: { id },
      data: {
        label,
        street,
        city,
        zipCode,
        country,
        isDefault,
        latitude,
        longitude
      }
    });

    successResponse(res, address, 'Address updated successfully');
  } catch (error) {
    console.error('Update address error:', error);
    errorResponse(res, 'Failed to update address', 500);
  }
}

export async function deleteAddress(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    // Verify address belongs to user
    const existingAddress = await prisma.address.findFirst({
      where: { id, userId }
    });

    if (!existingAddress) {
      errorResponse(res, 'Address not found', 404);
      return;
    }

    // Check if address is used in any bookings
    const bookingsCount = await prisma.booking.count({
      where: { addressId: id }
    });

    if (bookingsCount > 0) {
      errorResponse(res, 'Cannot delete address used in bookings', 400);
      return;
    }

    await prisma.address.delete({
      where: { id }
    });

    successResponse(res, null, 'Address deleted successfully');
  } catch (error) {
    console.error('Delete address error:', error);
    errorResponse(res, 'Failed to delete address', 500);
  }
}
