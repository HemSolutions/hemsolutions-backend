"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAddressValidation = exports.changePasswordValidation = exports.updateProfileValidation = void 0;
exports.getProfile = getProfile;
exports.updateProfile = updateProfile;
exports.changePassword = changePassword;
exports.getAddresses = getAddresses;
exports.createAddress = createAddress;
exports.updateAddress = updateAddress;
exports.deleteAddress = deleteAddress;
const express_validator_1 = require("express-validator");
const client_1 = require("../prisma/client");
const password_1 = require("../utils/password");
const response_1 = require("../utils/response");
exports.updateProfileValidation = [
    (0, express_validator_1.body)('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
    (0, express_validator_1.body)('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
    (0, express_validator_1.body)('phone').optional().trim(),
    (0, express_validator_1.body)('avatar').optional().trim().isURL().withMessage('Avatar must be a valid URL')
];
exports.changePasswordValidation = [
    (0, express_validator_1.body)('currentPassword').notEmpty().withMessage('Current password is required'),
    (0, express_validator_1.body)('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
];
exports.createAddressValidation = [
    (0, express_validator_1.body)('label').trim().notEmpty().withMessage('Label is required'),
    (0, express_validator_1.body)('street').trim().notEmpty().withMessage('Street is required'),
    (0, express_validator_1.body)('city').trim().notEmpty().withMessage('City is required'),
    (0, express_validator_1.body)('zipCode').trim().notEmpty().withMessage('ZIP code is required'),
    (0, express_validator_1.body)('country').optional().trim(),
    (0, express_validator_1.body)('isDefault').optional().isBoolean()
];
async function getProfile(req, res) {
    try {
        const userId = req.user.userId;
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId },
            include: {
                addresses: true
            }
        });
        if (!user) {
            (0, response_1.errorResponse)(res, 'User not found', 404);
            return;
        }
        const response = {
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
        (0, response_1.successResponse)(res, { user: response, addresses: user.addresses });
    }
    catch (error) {
        console.error('Get profile error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get profile', 500);
    }
}
async function updateProfile(req, res) {
    try {
        const userId = req.user.userId;
        const { firstName, lastName, phone, avatar } = req.body;
        const user = await client_1.prisma.user.update({
            where: { id: userId },
            data: {
                firstName,
                lastName,
                phone,
                avatar
            }
        });
        const response = {
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
        (0, response_1.successResponse)(res, response, 'Profile updated successfully');
    }
    catch (error) {
        console.error('Update profile error:', error);
        (0, response_1.errorResponse)(res, 'Failed to update profile', 500);
    }
}
async function changePassword(req, res) {
    try {
        const userId = req.user.userId;
        const { currentPassword, newPassword } = req.body;
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            (0, response_1.errorResponse)(res, 'User not found', 404);
            return;
        }
        // Verify current password
        const { comparePassword } = await import('../utils/password.js');
        const isValid = await comparePassword(currentPassword, user.password);
        if (!isValid) {
            (0, response_1.errorResponse)(res, 'Current password is incorrect', 400);
            return;
        }
        // Hash new password
        const hashedPassword = await (0, password_1.hashPassword)(newPassword);
        // Update password
        await client_1.prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });
        (0, response_1.successResponse)(res, null, 'Password changed successfully');
    }
    catch (error) {
        console.error('Change password error:', error);
        (0, response_1.errorResponse)(res, 'Failed to change password', 500);
    }
}
// Address management
async function getAddresses(req, res) {
    try {
        const userId = req.user.userId;
        const addresses = await client_1.prisma.address.findMany({
            where: { userId },
            orderBy: { isDefault: 'desc' }
        });
        (0, response_1.successResponse)(res, addresses);
    }
    catch (error) {
        console.error('Get addresses error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get addresses', 500);
    }
}
async function createAddress(req, res) {
    try {
        const userId = req.user.userId;
        const { label, street, city, zipCode, country, isDefault, latitude, longitude } = req.body;
        // If setting as default, remove default from other addresses
        if (isDefault) {
            await client_1.prisma.address.updateMany({
                where: { userId, isDefault: true },
                data: { isDefault: false }
            });
        }
        const address = await client_1.prisma.address.create({
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
        (0, response_1.successResponse)(res, address, 'Address added successfully', 201);
    }
    catch (error) {
        console.error('Create address error:', error);
        (0, response_1.errorResponse)(res, 'Failed to add address', 500);
    }
}
async function updateAddress(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { label, street, city, zipCode, country, isDefault, latitude, longitude } = req.body;
        // Verify address belongs to user
        const existingAddress = await client_1.prisma.address.findFirst({
            where: { id, userId }
        });
        if (!existingAddress) {
            (0, response_1.errorResponse)(res, 'Address not found', 404);
            return;
        }
        // If setting as default, remove default from other addresses
        if (isDefault && !existingAddress.isDefault) {
            await client_1.prisma.address.updateMany({
                where: { userId, isDefault: true },
                data: { isDefault: false }
            });
        }
        const address = await client_1.prisma.address.update({
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
        (0, response_1.successResponse)(res, address, 'Address updated successfully');
    }
    catch (error) {
        console.error('Update address error:', error);
        (0, response_1.errorResponse)(res, 'Failed to update address', 500);
    }
}
async function deleteAddress(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        // Verify address belongs to user
        const existingAddress = await client_1.prisma.address.findFirst({
            where: { id, userId }
        });
        if (!existingAddress) {
            (0, response_1.errorResponse)(res, 'Address not found', 404);
            return;
        }
        // Check if address is used in any bookings
        const bookingsCount = await client_1.prisma.booking.count({
            where: { addressId: id }
        });
        if (bookingsCount > 0) {
            (0, response_1.errorResponse)(res, 'Cannot delete address used in bookings', 400);
            return;
        }
        await client_1.prisma.address.delete({
            where: { id }
        });
        (0, response_1.successResponse)(res, null, 'Address deleted successfully');
    }
    catch (error) {
        console.error('Delete address error:', error);
        (0, response_1.errorResponse)(res, 'Failed to delete address', 500);
    }
}
//# sourceMappingURL=userController.js.map