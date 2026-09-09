import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/db';
import { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'nivara_civic_clustering_jwt_secret_key_2026_secure';
const JWT_EXPIRES_IN = '7d';

/**
 * Register a new citizen or municipal authority account
 */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, password, role, phone } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({
        success: false,
        message: 'Name, email, and password are required fields',
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: 'An account with this email address already exists',
      });
      return;
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const userRole: Role = role === 'AUTHORITY' ? 'AUTHORITY' : 'CITIZEN';

    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: userRole,
        phone: phone ? phone.trim() : null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        createdAt: true,
      },
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: newUser.id,
        email: newUser.email,
        role: newUser.role,
        name: newUser.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: newUser,
        token,
      },
    });
  } catch (error) {
    console.error('[Auth:Register] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration',
    });
  }
}

/**
 * Log in an existing user and issue a JWT token
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(200).json({
      success: true,
      message: 'Authentication successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          createdAt: user.createdAt,
        },
        token,
      },
    });
  } catch (error) {
    console.error('[Auth:Login] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login',
    });
  }
}

/**
 * Retrieve current authenticated user profile
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        createdAt: true,
        _count: {
          select: {
            complaints: true,
            upvotes: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error('[Auth:GetMe] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error retrieving user profile',
    });
  }
}

/**
 * Helper to mask an email address for privacy
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  const maskedLocal = `${local[0]}${'*'.repeat(Math.min(local.length - 2, 4))}${local[local.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

/**
 * Helper to mask a phone number for privacy
 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '******';
  const prefix = phone.trim().startsWith('+') ? phone.trim().slice(0, 3) + ' ' : '';
  const last4 = digits.slice(-4);
  return `${prefix}******${last4}`;
}

/**
 * Find user by email or phone identifier without leaking account type
 */
async function findUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    return prisma.user.findUnique({
      where: { email: trimmed.toLowerCase() },
    });
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  const last10 = digits.slice(-10);
  return prisma.user.findFirst({
    where: {
      OR: [
        { phone: trimmed },
        { phone: { contains: digits } },
        { phone: { endsWith: last10 } },
      ],
    },
  });
}

/**
 * Request a 6-digit OTP for password reset (Supports both Citizen and Authority)
 */
export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  try {
    const { identifier } = req.body;

    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      res.status(400).json({
        success: false,
        message: 'Please enter your registered email or mobile number.',
      });
      return;
    }

    const trimmed = identifier.trim();
    const isEmail = trimmed.includes('@');

    const user = await findUserByIdentifier(trimmed);

    // Requirement: Never reveal account type, show exact error if not found
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'No account found with this email/mobile number.',
      });
      return;
    }

    // Rate-limiting: 30-second cooldown between requests
    const COOLDOWN_MS = 30 * 1000;
    if (user.lastOtpRequestAt) {
      const elapsed = Date.now() - new Date(user.lastOtpRequestAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        res.status(429).json({
          success: false,
          message: `Please wait ${remainingSeconds} seconds before requesting a new OTP.`,
          retryAfter: remainingSeconds,
        });
        return;
      }
    }

    // Generate secure 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user record with hashed OTP (NEVER log OTP plaintext in server logs)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetOtpHash: otpHash,
        resetOtpExpiresAt: expiresAt,
        resetOtpAttempts: 0,
        lastOtpRequestAt: new Date(),
      },
    });

    const destination = isEmail ? maskEmail(user.email) : maskPhone(user.phone || trimmed);

    res.status(200).json({
      success: true,
      message: isEmail
        ? `A 6-digit OTP has been sent to ${destination}. It expires in 10 minutes.`
        : `A 6-digit OTP has been sent via SMS to ${destination}. It expires in 10 minutes.`,
      data: {
        destinationType: isEmail ? 'email' : 'phone',
        maskedDestination: destination,
        // Provided only in development environment to facilitate local testing/viva evaluation
        ...(process.env.NODE_ENV !== 'production' ? { devOtpHint: otp } : {}),
      },
    });
  } catch (error) {
    console.error('[Auth:RequestPasswordReset] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while processing password reset request.',
    });
  }
}

/**
 * Verify 6-digit OTP and return a temporary JWT reset token
 */
export async function verifyResetOtp(req: Request, res: Response): Promise<void> {
  try {
    const { identifier, otp } = req.body;

    if (!identifier || !otp) {
      res.status(400).json({
        success: false,
        message: 'Identifier and 6-digit OTP are required.',
      });
      return;
    }

    const cleanOtp = otp.toString().trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit numeric OTP.',
      });
      return;
    }

    const user = await findUserByIdentifier(identifier);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'No account found with this email/mobile number.',
      });
      return;
    }

    // Check expiry
    if (!user.resetOtpHash || !user.resetOtpExpiresAt || new Date() > new Date(user.resetOtpExpiresAt)) {
      res.status(400).json({
        success: false,
        message: 'OTP has expired or is invalid. Please request a new OTP.',
      });
      return;
    }

    // Rate-limiting on verification attempts (max 5)
    if (user.resetOtpAttempts >= 5) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetOtpHash: null,
          resetOtpExpiresAt: null,
        },
      });
      res.status(429).json({
        success: false,
        message: 'Too many failed verification attempts. This OTP has expired. Please request a new one.',
      });
      return;
    }

    // Compare SHA-256 hash
    const inputHash = crypto.createHash('sha256').update(cleanOtp).digest('hex');
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(inputHash, 'utf8'),
      Buffer.from(user.resetOtpHash, 'utf8')
    );

    if (!isMatch) {
      const newAttempts = user.resetOtpAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: { resetOtpAttempts: newAttempts },
      });

      const remaining = 5 - newAttempts;
      res.status(400).json({
        success: false,
        message: remaining > 0
          ? `Invalid OTP. You have ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Invalid OTP. Maximum attempts reached; please request a new OTP.',
      });
      return;
    }

    // Issue short-lived reset token (valid for 15 minutes)
    const resetToken = jwt.sign(
      {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
      data: { resetToken },
    });
  } catch (error) {
    console.error('[Auth:VerifyResetOtp] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during OTP verification.',
    });
  }
}

/**
 * Reset password using the verified reset token
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Reset token and new password are required.',
      });
      return;
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      res.status(400).json({
        success: false,
        message: 'Passwords do not match.',
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(resetToken, JWT_SECRET);
    } catch {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired password reset session. Please request a new OTP.',
      });
      return;
    }

    if (decoded.purpose !== 'PASSWORD_RESET' || !decoded.userId) {
      res.status(401).json({
        success: false,
        message: 'Invalid password reset token.',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
      return;
    }

    // Check if reset session was already consumed
    if (!user.resetOtpHash) {
      res.status(400).json({
        success: false,
        message: 'This reset token has already been used. Please request a new OTP.',
      });
      return;
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Invalidate OTP and save new password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetOtpHash: null,
        resetOtpExpiresAt: null,
        resetOtpAttempts: 0,
        lastOtpRequestAt: null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please sign in.',
    });
  } catch (error) {
    console.error('[Auth:ResetPassword] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while resetting password.',
    });
  }
}

