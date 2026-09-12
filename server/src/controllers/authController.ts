import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/db';
import { Role } from '@prisma/client';
import { sendEmailOtp, sendSmsOtp } from '../services/notificationService';

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

    // Send real OTP via SMTP or Twilio SMS (Requirement 1, 2 & 5)
    try {
      if (isEmail) {
        await sendEmailOtp(user.email, otp, 'forgot-password');
      } else {
        await sendSmsOtp(user.phone || trimmed, otp, 'forgot-password');
      }
    } catch (deliveryError) {
      console.error('[Auth:ForgotPassword] Real delivery failed:', deliveryError);
      res.status(502).json({
        success: false,
        message: "We couldn't send the verification code. Please try again or contact support.",
      });
      return;
    }

    const destination = isEmail ? maskEmail(user.email) : maskPhone(user.phone || trimmed);

    res.status(200).json({
      success: true,
      message: isEmail
        ? `A 6-digit OTP has been sent to ${destination}. It expires in 10 minutes.`
        : `A 6-digit OTP has been sent via SMS to ${destination}. It expires in 10 minutes.`,
      data: {
        destinationType: isEmail ? 'email' : 'phone',
        maskedDestination: destination,
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

/**
 * Validate phone number format (10-13 digits with optional country code prefix)
 */
function validatePhoneNumber(phone: string): { valid: boolean; normalized: string; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, normalized: '', error: 'Mobile number is required.' };
  }
  const cleaned = phone.trim().replace(/[\s\-]/g, '');
  if (!/^\+?[0-9]{10,13}$/.test(cleaned)) {
    return {
      valid: false,
      normalized: '',
      error: 'Mobile number must be 10 digits (with optional country code, e.g. +91 9845012345).',
    };
  }
  return { valid: true, normalized: cleaned };
}

/**
 * Validate email format
 */
function validateEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase().trim());
}

/**
 * Step 1: Start dual OTP signup verification
 * Validates inputs, verifies email & phone are not duplicates, generates dual OTPs,
 * and saves in PendingRegistration table.
 */
export async function startSignup(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, phone, password, role } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({
        success: false,
        message: 'Full name is required (minimum 2 characters).',
      });
      return;
    }

    if (!email || !validateEmailFormat(email)) {
      res.status(400).json({
        success: false,
        message: 'A valid email address is required.',
      });
      return;
    }

    const phoneValidation = validatePhoneNumber(phone);
    if (!phoneValidation.valid) {
      res.status(400).json({
        success: false,
        message: phoneValidation.error || 'Invalid mobile number format.',
      });
      return;
    }

    if (!password || password.length < 6) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phoneValidation.normalized;

    // Requirement 5: Duplicate Prevention - Check email
    const existingEmailUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingEmailUser) {
      res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
      return;
    }

    // Requirement 5: Duplicate Prevention - Check mobile number
    const last10Digits = normalizedPhone.replace(/\D/g, '').slice(-10);
    const existingPhoneUser = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { phone: { endsWith: last10Digits } },
        ],
      },
    });
    if (existingPhoneUser) {
      res.status(409).json({
        success: false,
        message: 'An account with this mobile number already exists.',
      });
      return;
    }

    // Check rate limit on existing pending registration (30s cooldown)
    const existingPending = await prisma.pendingRegistration.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { phone: normalizedPhone }],
      },
    });

    if (existingPending) {
      const emailElapsed = Date.now() - new Date(existingPending.emailLastSentAt).getTime();
      const phoneElapsed = Date.now() - new Date(existingPending.phoneLastSentAt).getTime();
      if (emailElapsed < 30000 || phoneElapsed < 30000) {
        const waitTime = Math.ceil((30000 - Math.min(emailElapsed, phoneElapsed)) / 1000);
        res.status(429).json({
          success: false,
          message: `Please wait ${waitTime} seconds before requesting new verification codes.`,
          retryAfter: waitTime,
        });
        return;
      }
    }

    // Generate separate 6-digit OTPs
    const emailOtp = crypto.randomInt(100000, 1000000).toString();
    const phoneOtp = crypto.randomInt(100000, 1000000).toString();

    // Hash both OTPs with SHA-256 (Never log OTPs in plaintext)
    const emailOtpHash = crypto.createHash('sha256').update(emailOtp).digest('hex');
    const phoneOtpHash = crypto.createHash('sha256').update(phoneOtp).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Clean up any previous pending records for this email or phone
    await prisma.pendingRegistration.deleteMany({
      where: {
        OR: [{ email: normalizedEmail }, { phone: normalizedPhone }],
      },
    });

    // Create new pending registration record
    const pending = await prisma.pendingRegistration.create({
      data: {
        email: normalizedEmail,
        phone: normalizedPhone,
        emailOtpHash,
        phoneOtpHash,
        emailOtpExpiresAt: expiresAt,
        phoneOtpExpiresAt: expiresAt,
        isEmailVerified: false,
        isPhoneVerified: false,
        emailAttempts: 0,
        phoneAttempts: 0,
        emailLastSentAt: new Date(),
        phoneLastSentAt: new Date(),
      },
    });

    // Send real OTPs via SMTP and Twilio SMS (Requirement 1, 2 & 5)
    try {
      await sendEmailOtp(normalizedEmail, emailOtp, 'signup');
      await sendSmsOtp(normalizedPhone, phoneOtp, 'signup');
    } catch (deliveryError) {
      console.error('[Auth:StartSignup] Real delivery failed:', deliveryError);
      res.status(502).json({
        success: false,
        message: "We couldn't send the verification code. Please try again or contact support.",
      });
      return;
    }

    const maskedEmail = maskEmail(normalizedEmail);
    const maskedPhone = maskPhone(normalizedPhone);

    res.status(200).json({
      success: true,
      message: `Verification codes sent: email OTP to ${maskedEmail} and SMS OTP to ${maskedPhone}.`,
      data: {
        sessionId: pending.id,
        maskedEmail,
        maskedPhone,
      },
    });
  } catch (error) {
    console.error('[Auth:StartSignup] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while starting registration.',
    });
  }
}

/**
 * Step 2: Verify either Email OTP or Mobile OTP
 */
export async function verifySignupOtp(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, type, otp } = req.body;

    if (!sessionId || !type || !otp) {
      res.status(400).json({
        success: false,
        message: 'Session ID, verification type (email or phone), and 6-digit OTP are required.',
      });
      return;
    }

    if (type !== 'email' && type !== 'phone') {
      res.status(400).json({
        success: false,
        message: 'Verification type must be either "email" or "phone".',
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

    const pending = await prisma.pendingRegistration.findUnique({
      where: { id: sessionId },
    });

    if (!pending) {
      res.status(404).json({
        success: false,
        message: 'Registration session not found or expired. Please start registration again.',
      });
      return;
    }

    const inputHash = crypto.createHash('sha256').update(cleanOtp).digest('hex');

    if (type === 'email') {
      if (pending.isEmailVerified) {
        res.status(200).json({
          success: true,
          message: 'Email is already verified.',
          data: {
            isEmailVerified: true,
            isPhoneVerified: pending.isPhoneVerified,
            bothVerified: pending.isPhoneVerified,
          },
        });
        return;
      }

      if (new Date() > new Date(pending.emailOtpExpiresAt)) {
        res.status(400).json({
          success: false,
          message: 'Email OTP has expired. Please request a new code.',
        });
        return;
      }

      if (pending.emailAttempts >= 5) {
        res.status(429).json({
          success: false,
          message: 'Too many failed email OTP attempts. Please request a new code.',
        });
        return;
      }

      const isMatch = crypto.timingSafeEqual(
        Buffer.from(inputHash, 'utf8'),
        Buffer.from(pending.emailOtpHash, 'utf8')
      );

      if (!isMatch) {
        const newAttempts = pending.emailAttempts + 1;
        await prisma.pendingRegistration.update({
          where: { id: pending.id },
          data: { emailAttempts: newAttempts },
        });

        const remaining = 5 - newAttempts;
        res.status(400).json({
          success: false,
          message: remaining > 0
            ? `Invalid email OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Invalid email OTP. Maximum attempts reached. Please request a new code.',
        });
        return;
      }

      const updated = await prisma.pendingRegistration.update({
        where: { id: pending.id },
        data: { isEmailVerified: true },
      });

      res.status(200).json({
        success: true,
        message: 'Email verified successfully.',
        data: {
          isEmailVerified: true,
          isPhoneVerified: updated.isPhoneVerified,
          bothVerified: updated.isPhoneVerified,
        },
      });
      return;
    } else {
      // type === 'phone'
      if (pending.isPhoneVerified) {
        res.status(200).json({
          success: true,
          message: 'Mobile number is already verified.',
          data: {
            isEmailVerified: pending.isEmailVerified,
            isPhoneVerified: true,
            bothVerified: pending.isEmailVerified,
          },
        });
        return;
      }

      if (new Date() > new Date(pending.phoneOtpExpiresAt)) {
        res.status(400).json({
          success: false,
          message: 'Mobile OTP has expired. Please request a new code.',
        });
        return;
      }

      if (pending.phoneAttempts >= 5) {
        res.status(429).json({
          success: false,
          message: 'Too many failed mobile OTP attempts. Please request a new code.',
        });
        return;
      }

      const isMatch = crypto.timingSafeEqual(
        Buffer.from(inputHash, 'utf8'),
        Buffer.from(pending.phoneOtpHash, 'utf8')
      );

      if (!isMatch) {
        const newAttempts = pending.phoneAttempts + 1;
        await prisma.pendingRegistration.update({
          where: { id: pending.id },
          data: { phoneAttempts: newAttempts },
        });

        const remaining = 5 - newAttempts;
        res.status(400).json({
          success: false,
          message: remaining > 0
            ? `Invalid mobile OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Invalid mobile OTP. Maximum attempts reached. Please request a new code.',
        });
        return;
      }

      const updated = await prisma.pendingRegistration.update({
        where: { id: pending.id },
        data: { isPhoneVerified: true },
      });

      res.status(200).json({
        success: true,
        message: 'Mobile number verified successfully.',
        data: {
          isEmailVerified: updated.isEmailVerified,
          isPhoneVerified: true,
          bothVerified: updated.isEmailVerified,
        },
      });
      return;
    }
  } catch (error) {
    console.error('[Auth:VerifySignupOtp] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while verifying signup OTP.',
    });
  }
}

/**
 * Step 3: Resend individual OTP (email or phone) with independent 30s cooldown
 */
export async function resendSignupOtp(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, type } = req.body;

    if (!sessionId || !type) {
      res.status(400).json({
        success: false,
        message: 'Session ID and verification type (email or phone) are required.',
      });
      return;
    }

    if (type !== 'email' && type !== 'phone') {
      res.status(400).json({
        success: false,
        message: 'Type must be either "email" or "phone".',
      });
      return;
    }

    const pending = await prisma.pendingRegistration.findUnique({
      where: { id: sessionId },
    });

    if (!pending) {
      res.status(404).json({
        success: false,
        message: 'Registration session not found or expired. Please start registration again.',
      });
      return;
    }

    const COOLDOWN_MS = 30 * 1000;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    if (type === 'email') {
      const elapsed = Date.now() - new Date(pending.emailLastSentAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        res.status(429).json({
          success: false,
          message: `Please wait ${remaining} seconds before requesting a new email OTP.`,
          retryAfter: remaining,
        });
        return;
      }

      const newOtp = crypto.randomInt(100000, 1000000).toString();
      const newHash = crypto.createHash('sha256').update(newOtp).digest('hex');

      await prisma.pendingRegistration.update({
        where: { id: pending.id },
        data: {
          emailOtpHash: newHash,
          emailOtpExpiresAt: expiresAt,
          emailAttempts: 0,
          emailLastSentAt: new Date(),
          isEmailVerified: false,
        },
      });

      // Send real email OTP via SMTP (Requirement 1 & 5)
      try {
        await sendEmailOtp(pending.email, newOtp, 'signup');
      } catch (deliveryError) {
        console.error('[Auth:ResendSignupOtp] Email delivery failed:', deliveryError);
        res.status(502).json({
          success: false,
          message: "We couldn't send the verification code. Please try again or contact support.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `New verification code sent to ${maskEmail(pending.email)}.`,
      });
      return;
    } else {
      // type === 'phone'
      const elapsed = Date.now() - new Date(pending.phoneLastSentAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        res.status(429).json({
          success: false,
          message: `Please wait ${remaining} seconds before requesting a new mobile OTP.`,
          retryAfter: remaining,
        });
        return;
      }

      const newOtp = crypto.randomInt(100000, 1000000).toString();
      const newHash = crypto.createHash('sha256').update(newOtp).digest('hex');

      await prisma.pendingRegistration.update({
        where: { id: pending.id },
        data: {
          phoneOtpHash: newHash,
          phoneOtpExpiresAt: expiresAt,
          phoneAttempts: 0,
          phoneLastSentAt: new Date(),
          isPhoneVerified: false,
        },
      });

      // Send real mobile OTP via Twilio SMS (Requirement 2 & 5)
      try {
        await sendSmsOtp(pending.phone, newOtp, 'signup');
      } catch (deliveryError) {
        console.error('[Auth:ResendSignupOtp] SMS delivery failed:', deliveryError);
        res.status(502).json({
          success: false,
          message: "We couldn't send the verification code. Please try again or contact support.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `New verification code sent via SMS to ${maskPhone(pending.phone)}.`,
      });
      return;
    }
  } catch (error) {
    console.error('[Auth:ResendSignupOtp] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while resending OTP.',
    });
  }
}

/**
 * Step 4: Complete account creation after both Email and Mobile OTPs are verified
 */
export async function completeSignup(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, name, password, role } = req.body;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: 'Registration session ID is required.',
      });
      return;
    }

    if (!name || name.trim().length < 2) {
      res.status(400).json({
        success: false,
        message: 'Full name is required (minimum 2 characters).',
      });
      return;
    }

    if (!password || password.length < 6) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
      return;
    }

    const pending = await prisma.pendingRegistration.findUnique({
      where: { id: sessionId },
    });

    if (!pending) {
      res.status(404).json({
        success: false,
        message: 'Registration session not found or expired. Please start registration again.',
      });
      return;
    }

    // Requirements 3 & 6: User must have verified BOTH email and mobile OTPs
    if (!pending.isEmailVerified || !pending.isPhoneVerified) {
      res.status(400).json({
        success: false,
        message: 'Both email and mobile number must be verified before account creation.',
        data: {
          isEmailVerified: pending.isEmailVerified,
          isPhoneVerified: pending.isPhoneVerified,
        },
      });
      return;
    }

    // Final duplicate checks before writing to users table
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: pending.email },
          { phone: pending.phone },
        ],
      },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: existingUser.email === pending.email
          ? 'An account with this email address already exists.'
          : 'An account with this mobile number already exists.',
      });
      return;
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const userRole: Role = role === 'AUTHORITY' ? 'AUTHORITY' : 'CITIZEN';

    // Create user in database with verified email and mobile number
    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: pending.email,
        phone: pending.phone,
        passwordHash,
        role: userRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    // Clean up pending registration record
    await prisma.pendingRegistration.delete({
      where: { id: pending.id },
    });

    // Requirement 6: Redirect to sign-in with success message
    res.status(201).json({
      success: true,
      message: 'Account created successfully. Please sign in.',
      data: {
        user: newUser,
      },
    });
  } catch (error) {
    console.error('[Auth:CompleteSignup] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during account creation.',
    });
  }
}


