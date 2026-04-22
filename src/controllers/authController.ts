import { Request, Response } from 'express';
import { body } from 'express-validator';
import { prisma } from '../prisma/client';
import { hashPassword, comparePassword } from '../utils/password';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { successResponse, errorResponse } from '../utils/response';
import { getPasswordResetEmailTemplate } from '../utils/email';
import { enqueueJob } from '../services/jobs/jobQueue';
import { config } from '../config';
import crypto from 'crypto';
import { AuthResponse, CreateUserInput, LoginInput } from '../types';

export const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('phone').optional().trim()
];

export const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

export const forgotPasswordValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
];

export const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, firstName, lastName, phone } = req.body as CreateUserInput;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      errorResponse(res, 'Email already registered', 409);
      return;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone
      }
    });

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const response: AuthResponse = {
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

    successResponse(res, response, 'Registration successful', 201);
  } catch (error) {
    console.error('Register error:', error);
    errorResponse(res, 'Failed to register user', 500);
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as LoginInput;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      errorResponse(res, 'Invalid credentials', 401);
      return;
    }

    // Check if account is active
    if (!user.isActive) {
      errorResponse(res, 'Account is deactivated', 401);
      return;
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password);

    if (!isValidPassword) {
      errorResponse(res, 'Invalid credentials', 401);
      return;
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const response: AuthResponse = {
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

    successResponse(res, response, 'Login successful');
  } catch (error) {
    console.error('Login error:', error);
    errorResponse(res, 'Failed to login', 500);
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  // In a stateless JWT system, logout is handled client-side
  // But we could implement token blacklisting with Redis for enhanced security
  successResponse(res, null, 'Logout successful');
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      errorResponse(res, 'Refresh token required', 400);
      return;
    }

    // Verify refresh token
    const { verifyRefreshToken } = await import('../utils/jwt.js');
    const payload = verifyRefreshToken(refreshToken);

    // Check if user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    if (!user || !user.isActive) {
      errorResponse(res, 'Invalid refresh token', 401);
      return;
    }

    // Generate new access token
    const newAccessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    successResponse(res, { accessToken: newAccessToken }, 'Token refreshed');
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      errorResponse(res, 'Refresh token expired', 401);
      return;
    }
    errorResponse(res, 'Invalid refresh token', 401);
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    // Always return success to prevent email enumeration
    if (!user) {
      successResponse(res, null, 'If an account exists, a reset link has been sent');
      return;
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save reset token
    await prisma.passwordReset.create({
      data: {
        email,
        token,
        expiresAt
      }
    });

    // Send email
    const resetUrl = `${config.frontend.url}/reset-password?token=${token}`;
    enqueueJob({
      type: 'SEND_EMAIL',
      payload: {
        to: email,
        subject: 'Reset your HemSolutions password',
        html: getPasswordResetEmailTemplate(resetUrl, user.firstName),
      },
    });

    successResponse(res, null, 'If an account exists, a reset link has been sent');
  } catch (error) {
    console.error('Forgot password error:', error);
    errorResponse(res, 'Failed to process request', 500);
  }
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { token, password } = req.body;

    // Find valid reset token
    const resetToken = await prisma.passwordReset.findFirst({
      where: {
        token,
        expiresAt: { gt: new Date() },
        usedAt: null
      }
    });

    if (!resetToken) {
      errorResponse(res, 'Invalid or expired token', 400);
      return;
    }

    // Hash new password
    const hashedPassword = await hashPassword(password);

    // Update user password
    await prisma.user.update({
      where: { email: resetToken.email },
      data: { password: hashedPassword }
    });

    // Mark token as used
    await prisma.passwordReset.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() }
    });

    successResponse(res, null, 'Password reset successful');
  } catch (error) {
    console.error('Reset password error:', error);
    errorResponse(res, 'Failed to reset password', 500);
  }
}
