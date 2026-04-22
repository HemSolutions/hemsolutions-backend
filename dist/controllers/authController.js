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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordValidation = exports.forgotPasswordValidation = exports.loginValidation = exports.registerValidation = void 0;
exports.register = register;
exports.login = login;
exports.logout = logout;
exports.refresh = refresh;
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;
const express_validator_1 = require("express-validator");
const client_1 = require("../prisma/client");
const password_1 = require("../utils/password");
const jwt_1 = require("../utils/jwt");
const response_1 = require("../utils/response");
const email_1 = require("../utils/email");
const jobQueue_1 = require("../services/jobs/jobQueue");
const config_1 = require("../config");
const crypto_1 = __importDefault(require("crypto"));
exports.registerValidation = [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    (0, express_validator_1.body)('firstName').trim().notEmpty().withMessage('First name is required'),
    (0, express_validator_1.body)('lastName').trim().notEmpty().withMessage('Last name is required'),
    (0, express_validator_1.body)('phone').optional().trim()
];
exports.loginValidation = [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('password').notEmpty().withMessage('Password is required')
];
exports.forgotPasswordValidation = [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().withMessage('Valid email is required')
];
exports.resetPasswordValidation = [
    (0, express_validator_1.body)('token').notEmpty().withMessage('Token is required'),
    (0, express_validator_1.body)('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];
async function register(req, res) {
    try {
        const { email, password, firstName, lastName, phone } = req.body;
        // Check if user exists
        const existingUser = await client_1.prisma.user.findUnique({
            where: { email }
        });
        if (existingUser) {
            (0, response_1.errorResponse)(res, 'Email already registered', 409);
            return;
        }
        // Hash password
        const hashedPassword = await (0, password_1.hashPassword)(password);
        // Create user
        const user = await client_1.prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                firstName,
                lastName,
                phone
            }
        });
        // Generate tokens
        const accessToken = (0, jwt_1.generateAccessToken)({
            userId: user.id,
            email: user.email,
            role: user.role
        });
        const refreshToken = (0, jwt_1.generateRefreshToken)({
            userId: user.id,
            email: user.email,
            role: user.role
        });
        // Update last login
        await client_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
        });
        const response = {
            user: {
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
            },
            accessToken,
            refreshToken
        };
        (0, response_1.successResponse)(res, response, 'Registration successful', 201);
    }
    catch (error) {
        console.error('Register error:', error);
        (0, response_1.errorResponse)(res, 'Failed to register user', 500);
    }
}
async function login(req, res) {
    try {
        const { email, password } = req.body;
        // Find user
        const user = await client_1.prisma.user.findUnique({
            where: { email }
        });
        if (!user) {
            (0, response_1.errorResponse)(res, 'Invalid credentials', 401);
            return;
        }
        // Check if account is active
        if (!user.isActive) {
            (0, response_1.errorResponse)(res, 'Account is deactivated', 401);
            return;
        }
        // Verify password
        const isValidPassword = await (0, password_1.comparePassword)(password, user.password);
        if (!isValidPassword) {
            (0, response_1.errorResponse)(res, 'Invalid credentials', 401);
            return;
        }
        // Generate tokens
        const accessToken = (0, jwt_1.generateAccessToken)({
            userId: user.id,
            email: user.email,
            role: user.role
        });
        const refreshToken = (0, jwt_1.generateRefreshToken)({
            userId: user.id,
            email: user.email,
            role: user.role
        });
        // Update last login
        await client_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
        });
        const response = {
            user: {
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
            },
            accessToken,
            refreshToken
        };
        (0, response_1.successResponse)(res, response, 'Login successful');
    }
    catch (error) {
        console.error('Login error:', error);
        (0, response_1.errorResponse)(res, 'Failed to login', 500);
    }
}
async function logout(_req, res) {
    // In a stateless JWT system, logout is handled client-side
    // But we could implement token blacklisting with Redis for enhanced security
    (0, response_1.successResponse)(res, null, 'Logout successful');
}
async function refresh(req, res) {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            (0, response_1.errorResponse)(res, 'Refresh token required', 400);
            return;
        }
        // Verify refresh token
        const { verifyRefreshToken } = await Promise.resolve().then(() => __importStar(require('../utils/jwt')));
        const payload = verifyRefreshToken(refreshToken);
        // Check if user still exists and is active
        const user = await client_1.prisma.user.findUnique({
            where: { id: payload.userId }
        });
        if (!user || !user.isActive) {
            (0, response_1.errorResponse)(res, 'Invalid refresh token', 401);
            return;
        }
        // Generate new access token
        const newAccessToken = (0, jwt_1.generateAccessToken)({
            userId: user.id,
            email: user.email,
            role: user.role
        });
        (0, response_1.successResponse)(res, { accessToken: newAccessToken }, 'Token refreshed');
    }
    catch (error) {
        if (error instanceof Error && error.name === 'TokenExpiredError') {
            (0, response_1.errorResponse)(res, 'Refresh token expired', 401);
            return;
        }
        (0, response_1.errorResponse)(res, 'Invalid refresh token', 401);
    }
}
async function forgotPassword(req, res) {
    try {
        const { email } = req.body;
        const user = await client_1.prisma.user.findUnique({
            where: { email }
        });
        // Always return success to prevent email enumeration
        if (!user) {
            (0, response_1.successResponse)(res, null, 'If an account exists, a reset link has been sent');
            return;
        }
        // Generate reset token
        const token = crypto_1.default.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        // Save reset token
        await client_1.prisma.passwordReset.create({
            data: {
                email,
                token,
                expiresAt
            }
        });
        // Send email
        const resetUrl = `${config_1.config.frontend.url}/reset-password?token=${token}`;
        (0, jobQueue_1.enqueueJob)({
            type: 'SEND_EMAIL',
            payload: {
                to: email,
                subject: 'Reset your HemSolutions password',
                html: (0, email_1.getPasswordResetEmailTemplate)(resetUrl, user.firstName),
            },
        });
        (0, response_1.successResponse)(res, null, 'If an account exists, a reset link has been sent');
    }
    catch (error) {
        console.error('Forgot password error:', error);
        (0, response_1.errorResponse)(res, 'Failed to process request', 500);
    }
}
async function resetPassword(req, res) {
    try {
        const { token, password } = req.body;
        // Find valid reset token
        const resetToken = await client_1.prisma.passwordReset.findFirst({
            where: {
                token,
                expiresAt: { gt: new Date() },
                usedAt: null
            }
        });
        if (!resetToken) {
            (0, response_1.errorResponse)(res, 'Invalid or expired token', 400);
            return;
        }
        // Hash new password
        const hashedPassword = await (0, password_1.hashPassword)(password);
        // Update user password
        await client_1.prisma.user.update({
            where: { email: resetToken.email },
            data: { password: hashedPassword }
        });
        // Mark token as used
        await client_1.prisma.passwordReset.update({
            where: { id: resetToken.id },
            data: { usedAt: new Date() }
        });
        (0, response_1.successResponse)(res, null, 'Password reset successful');
    }
    catch (error) {
        console.error('Reset password error:', error);
        (0, response_1.errorResponse)(res, 'Failed to reset password', 500);
    }
}
//# sourceMappingURL=authController.js.map