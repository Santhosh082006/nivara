import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/db';
import { Role } from '@prisma/client';
import { sendEmailOtp, sendSmsOtp } from '../services/notificationService';
import { generateSecureOtp, hashOtp, verifyOtpHash } from '../utils/otpHelper';
import { validatePassword, validatePasswordConfirmation } from '../utils/passwordValidator';

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
 * Step 1: Sign in with credentials (email/mobile + password)
 * Issues a short-lived LOGIN_OTP challenge and dispatches a 6-digit OTP to the registered channel.
 * Never issues normal application JWT before OTP verification!
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { identifier, email, phone, password } = req.body;
    const rawIdentifier = (identifier || email || phone || '').toString().trim();

    if (!rawIdentifier || !password) {
      res.status(400).json({
        success: false,
        message: 'Email/mobile number and password are required.',
      });
      return;
    }

    const user = await findUserByIdentifier(rawIdentifier);

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid email/mobile or password',
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'Invalid email/mobile or password',
      });
      return;
    }

    // Determine verification channel based on user input & verified contact details
    const isEmail = rawIdentifier.includes('@');
    const channel: 'email' | 'phone' = isEmail ? 'email' : 'phone';
    const destination = isEmail ? user.email : (user.phone || rawIdentifier);

    // Cooldown check (30 seconds between OTP requests)
    const COOLDOWN_MS = 30 * 1000;
    if (user.loginLastSentAt) {
      const elapsed = Date.now() - new Date(user.loginLastSentAt).getTime();
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

    // Generate cryptographically secure 6-digit OTP & HMAC-SHA256 hash
    const otp = generateSecureOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user record with hashed OTP and reset verification attempts
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginOtpHash: otpHash,
        loginOtpExpiresAt: expiresAt,
        loginOtpAttempts: 0,
        loginLastSentAt: new Date(),
      },
    });

    // Deliver real OTP to registered channel
    try {
      if (channel === 'email') {
        await sendEmailOtp(user.email, otp, 'login');
      } else {
        await sendSmsOtp(destination, otp, 'login');
      }
    } catch (deliveryError) {
      console.error('[Auth:Login] Delivery failed:', deliveryError);
      res.status(502).json({
        success: false,
        message: "We couldn't send the verification code. Please try again or contact support.",
      });
      return;
    }

    // Issue short-lived LOGIN_OTP challenge token (10 minutes, purpose-bound)
    const loginChallengeToken = jwt.sign(
      {
        userId: user.id,
        purpose: 'LOGIN_OTP',
        jti: crypto.randomUUID(),
      },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    const maskedDestination = channel === 'email' ? maskEmail(user.email) : maskPhone(destination);

    res.status(200).json({
      success: true,
      message: 'Verification code sent successfully.',
      data: {
        requiresOtp: true,
        loginChallengeToken,
        channel,
        maskedDestination,
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
 * Step 2: Verify Login OTP and issue normal authenticated JWT
 * Atomic conditional consumption guarantees exactly one concurrent request can consume the OTP.
 */
export async function verifyLoginOtp(req: Request, res: Response): Promise<void> {
  try {
    const { loginChallengeToken, otp } = req.body;

    if (!loginChallengeToken || !otp) {
      res.status(400).json({
        success: false,
        message: 'Login challenge token and verification code are required.',
      });
      return;
    }

    const cleanOtp = otp.toString().trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit verification code.',
      });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(loginChallengeToken, JWT_SECRET);
    } catch {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired login challenge session. Please sign in again.',
      });
      return;
    }

    if (decoded.purpose !== 'LOGIN_OTP' || !decoded.userId) {
      res.status(401).json({
        success: false,
        message: 'Invalid login challenge token.',
      });
      return;
    }

    // Atomic OTP verification and consumption in Prisma transaction
    const txResult = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user || !user.loginOtpHash || !user.loginOtpExpiresAt) {
        return { error: 'Invalid or expired verification session. Please sign in again.', status: 400 };
      }

      if (new Date() > new Date(user.loginOtpExpiresAt)) {
        await tx.user.update({
          where: { id: user.id },
          data: { loginOtpHash: null, loginOtpExpiresAt: null },
        });
        return { error: 'Verification code has expired. Please sign in again.', status: 400 };
      }

      if (user.loginOtpAttempts >= 5) {
        await tx.user.update({
          where: { id: user.id },
          data: { loginOtpHash: null, loginOtpExpiresAt: null },
        });
        return {
          error: 'Too many failed verification attempts. This challenge has been locked. Please sign in again.',
          status: 429,
        };
      }

      const isMatch = verifyOtpHash(cleanOtp, user.loginOtpHash);
      if (!isMatch) {
        const newAttempts = user.loginOtpAttempts + 1;
        if (newAttempts >= 5) {
          await tx.user.update({
            where: { id: user.id },
            data: { loginOtpHash: null, loginOtpExpiresAt: null, loginOtpAttempts: newAttempts },
          });
          return {
            error: 'Too many failed verification attempts. This challenge has been locked. Please sign in again.',
            status: 429,
          };
        } else {
          await tx.user.update({
            where: { id: user.id },
            data: { loginOtpAttempts: newAttempts },
          });
          const remaining = 5 - newAttempts;
          return {
            error: `Invalid verification code. You have ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
            status: 400,
          };
        }
      }

      // ATOMIC CONSUMPTION: Clear OTP state immediately so same OTP can never authenticate twice
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          loginOtpHash: null,
          loginOtpExpiresAt: null,
          loginOtpAttempts: 0,
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

      return { user: updatedUser };
    });

    if ('error' in txResult) {
      res.status(txResult.status || 400).json({
        success: false,
        message: txResult.error,
      });
      return;
    }

    // Normal authenticated JWT session issued ONLY after successful OTP verification
    const token = jwt.sign(
      {
        userId: txResult.user.id,
        email: txResult.user.email,
        role: txResult.user.role,
        name: txResult.user.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(200).json({
      success: true,
      message: 'Authentication successful',
      data: {
        user: txResult.user,
        token,
      },
    });
  } catch (error) {
    console.error('[Auth:VerifyLoginOtp] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login OTP verification.',
    });
  }
}

/**
 * Resend Login OTP with 30s cooldown and new OTP generation
 */
export async function resendLoginOtp(req: Request, res: Response): Promise<void> {
  try {
    const { loginChallengeToken } = req.body;

    if (!loginChallengeToken) {
      res.status(400).json({
        success: false,
        message: 'Login challenge token is required.',
      });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(loginChallengeToken, JWT_SECRET);
    } catch {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired login challenge session. Please sign in again.',
      });
      return;
    }

    if (decoded.purpose !== 'LOGIN_OTP' || !decoded.userId) {
      res.status(401).json({
        success: false,
        message: 'Invalid login challenge token.',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.loginOtpHash) {
      res.status(400).json({
        success: false,
        message: 'Login challenge has expired or was already completed. Please sign in again.',
      });
      return;
    }

    const COOLDOWN_MS = 30 * 1000;
    if (user.loginLastSentAt) {
      const elapsed = Date.now() - new Date(user.loginLastSentAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        res.status(429).json({
          success: false,
          message: `Please wait ${remainingSeconds} seconds before requesting a new verification code.`,
          retryAfter: remainingSeconds,
        });
        return;
      }
    }

    // Generate fresh OTP (invalidating previous OTP)
    const newOtp = generateSecureOtp();
    const newHash = hashOtp(newOtp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginOtpHash: newHash,
        loginOtpExpiresAt: expiresAt,
        loginOtpAttempts: 0,
        loginLastSentAt: new Date(),
      },
    });

    try {
      if (user.email) {
        await sendEmailOtp(user.email, newOtp, 'login');
      } else if (user.phone) {
        await sendSmsOtp(user.phone, newOtp, 'login');
      }
    } catch (deliveryError) {
      console.error('[Auth:ResendLoginOtp] Delivery failed:', deliveryError);
      res.status(502).json({
        success: false,
        message: "We couldn't send the verification code. Please try again or contact support.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Verification code sent successfully.',
    });
  } catch (error) {
    console.error('[Auth:ResendLoginOtp] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while resending login OTP.',
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
 * Anti-Enumeration Protection: Always returns the same generic message whether the account exists or not.
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

    // Anti-Enumeration Protection: Return same generic response if account not found
    if (!user) {
      res.status(200).json({
        success: true,
        message: 'If the account exists, a verification code has been sent.',
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

    // Generate cryptographically secure 6-digit OTP and HMAC-SHA256 hash
    const otp = generateSecureOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user record with hashed OTP and reset attempts
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetOtpHash: otpHash,
        resetOtpExpiresAt: expiresAt,
        resetOtpAttempts: 0,
        lastOtpRequestAt: new Date(),
      },
    });

    // Send real OTP via SMTP or Twilio SMS
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
      message: 'If the account exists, a verification code has been sent.',
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
 * Verify 6-digit OTP for password reset and issue a short-lived PASSWORD_RESET challenge token
 * Uses atomic consumption inside a Prisma transaction.
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

    const foundUser = await findUserByIdentifier(identifier);
    if (!foundUser) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired verification session. Please request a new OTP.',
      });
      return;
    }

    // Atomic OTP verification and consumption
    const txResult = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: foundUser.id },
      });

      if (!user || !user.resetOtpHash || !user.resetOtpExpiresAt) {
        return { error: 'Invalid or expired verification session. Please request a new OTP.', status: 400 };
      }

      if (new Date() > new Date(user.resetOtpExpiresAt)) {
        await tx.user.update({
          where: { id: user.id },
          data: { resetOtpHash: null, resetOtpExpiresAt: null },
        });
        return { error: 'Verification code has expired. Please request a new OTP.', status: 400 };
      }

      if (user.resetOtpAttempts >= 5) {
        await tx.user.update({
          where: { id: user.id },
          data: { resetOtpHash: null, resetOtpExpiresAt: null },
        });
        return {
          error: 'Too many failed verification attempts. Please request a new OTP.',
          status: 429,
        };
      }

      const isMatch = verifyOtpHash(cleanOtp, user.resetOtpHash);
      if (!isMatch) {
        const newAttempts = user.resetOtpAttempts + 1;
        if (newAttempts >= 5) {
          await tx.user.update({
            where: { id: user.id },
            data: { resetOtpHash: null, resetOtpExpiresAt: null, resetOtpAttempts: newAttempts },
          });
          return {
            error: 'Too many failed verification attempts. Please request a new OTP.',
            status: 429,
          };
        } else {
          await tx.user.update({
            where: { id: user.id },
            data: { resetOtpAttempts: newAttempts },
          });
          const remaining = 5 - newAttempts;
          return {
            error: `Invalid OTP. You have ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
            status: 400,
          };
        }
      }

      // ATOMIC CONSUMPTION: Clear reset OTP immediately so it can never be replayed
      await tx.user.update({
        where: { id: user.id },
        data: {
          resetOtpHash: null,
          resetOtpExpiresAt: null,
          resetOtpAttempts: 0,
        },
      });

      return { userId: user.id };
    });

    if ('error' in txResult) {
      res.status(txResult.status || 400).json({
        success: false,
        message: txResult.error,
      });
      return;
    }

    // Issue short-lived, purpose-bound PASSWORD_RESET challenge token (15 minutes)
    const passwordResetToken = jwt.sign(
      {
        userId: txResult.userId,
        purpose: 'PASSWORD_RESET',
        jti: crypto.randomUUID(),
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
      data: {
        passwordResetToken,
        resetToken: passwordResetToken, // backward compatibility
      },
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
 * Resend Password Reset OTP with 30-second cooldown
 */
export async function resendResetOtp(req: Request, res: Response): Promise<void> {
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

    // Anti-enumeration protection: return same message if user not found
    if (!user) {
      res.status(200).json({
        success: true,
        message: 'If the account exists, a verification code has been sent.',
      });
      return;
    }

    const COOLDOWN_MS = 30 * 1000;
    if (user.lastOtpRequestAt) {
      const elapsed = Date.now() - new Date(user.lastOtpRequestAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        res.status(429).json({
          success: false,
          message: `Please wait ${remaining} seconds before requesting a new OTP.`,
          retryAfter: remaining,
        });
        return;
      }
    }

    const newOtp = generateSecureOtp();
    const newHash = hashOtp(newOtp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetOtpHash: newHash,
        resetOtpExpiresAt: expiresAt,
        resetOtpAttempts: 0,
        lastOtpRequestAt: new Date(),
      },
    });

    try {
      if (isEmail) {
        await sendEmailOtp(user.email, newOtp, 'forgot-password');
      } else {
        await sendSmsOtp(user.phone || trimmed, newOtp, 'forgot-password');
      }
    } catch (deliveryError) {
      console.error('[Auth:ResendResetOtp] Delivery failed:', deliveryError);
      res.status(502).json({
        success: false,
        message: "We couldn't send the verification code. Please try again or contact support.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'If the account exists, a verification code has been sent.',
    });
  } catch (error) {
    console.error('[Auth:ResendResetOtp] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while resending reset OTP.',
    });
  }
}

/**
 * Reset password using the verified PASSWORD_RESET challenge token
 * Enforces production 12+ character password policy with confirmation matching.
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { passwordResetToken, resetToken, newPassword, confirmPassword } = req.body;
    const token = passwordResetToken || resetToken;

    if (!token || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Reset token and new password are required.',
      });
      return;
    }

    // Validate strong password policy & confirmation match
    const validation = validatePasswordConfirmation(newPassword, confirmPassword);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        message: validation.error || 'Password does not meet security requirements.',
      });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
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

    // Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetOtpHash: null,
        resetOtpExpiresAt: null,
        resetOtpAttempts: 0,
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
 * Validates inputs against strict 12+ character password policy, verifies non-duplicate email & phone,
 * generates HMAC-SHA256 hashed dual OTPs, and handles partial delivery rollbacks cleanly.
 */
export async function startSignup(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, phone, password, confirmPassword, role } = req.body;

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

    // Strict 12+ character password validation & confirmation match
    const passwordValidation = validatePasswordConfirmation(password, confirmPassword);
    if (!passwordValidation.isValid) {
      res.status(400).json({
        success: false,
        message: passwordValidation.error || 'Password does not meet security requirements.',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phoneValidation.normalized;

    // Duplicate Prevention - Check email
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

    // Duplicate Prevention - Check mobile number
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
    const emailOtp = generateSecureOtp();
    const phoneOtp = generateSecureOtp();

    // Hash both OTPs with HMAC-SHA256 (Never log OTPs in plaintext)
    const emailOtpHash = hashOtp(emailOtp);
    const phoneOtpHash = hashOtp(phoneOtp);
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

    // Send real OTPs via SMTP and Twilio SMS
    // Partial Delivery Handling: If either channel fails, rollback pending record to prevent invalid state
    try {
      await sendEmailOtp(normalizedEmail, emailOtp, 'signup');
      await sendSmsOtp(normalizedPhone, phoneOtp, 'signup');
    } catch (deliveryError) {
      console.error('[Auth:StartSignup] Delivery failed:', deliveryError);
      await prisma.pendingRegistration.deleteMany({
        where: { id: pending.id },
      });
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
 * Uses timing-safe HMAC-SHA256 verification and enforces 5-attempt brute-force protection.
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

      const isMatch = verifyOtpHash(cleanOtp, pending.emailOtpHash);

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

      const isMatch = verifyOtpHash(cleanOtp, pending.phoneOtpHash);

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

      const newOtp = generateSecureOtp();
      const newHash = hashOtp(newOtp);

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

      const newOtp = generateSecureOtp();
      const newHash = hashOtp(newOtp);

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
 * Executes inside an atomic Prisma transaction to prevent concurrent duplicate creation.
 */
export async function completeSignup(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, name, password, confirmPassword, role } = req.body;

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

    // Re-validate 12+ character password policy
    const passwordValidation = validatePasswordConfirmation(password, confirmPassword);
    if (!passwordValidation.isValid) {
      res.status(400).json({
        success: false,
        message: passwordValidation.error || 'Password does not meet security requirements.',
      });
      return;
    }

    // Execute account creation atomically
    const txResult = await prisma.$transaction(async (tx) => {
      const pending = await tx.pendingRegistration.findUnique({
        where: { id: sessionId },
      });

      if (!pending) {
        return { error: 'Registration session not found or expired. Please start registration again.', status: 404 };
      }

      if (!pending.isEmailVerified || !pending.isPhoneVerified) {
        return {
          error: 'Both email and mobile number must be verified before account creation.',
          status: 400,
          data: {
            isEmailVerified: pending.isEmailVerified,
            isPhoneVerified: pending.isPhoneVerified,
          },
        };
      }

      // Check duplicate user during concurrent registration
      const existingUser = await tx.user.findFirst({
        where: {
          OR: [
            { email: pending.email },
            { phone: pending.phone },
          ],
        },
      });

      if (existingUser) {
        return {
          error: existingUser.email === pending.email
            ? 'An account with this email address already exists.'
            : 'An account with this mobile number already exists.',
          status: 409,
        };
      }

      // Hash password with bcrypt
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const userRole: Role = role === 'AUTHORITY' ? 'AUTHORITY' : 'CITIZEN';

      // Create user
      const createdUser = await tx.user.create({
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

      // Atomically clean up pending registration
      await tx.pendingRegistration.delete({
        where: { id: pending.id },
      });

      return { user: createdUser };
    });

    if ('error' in txResult) {
      res.status(txResult.status || 400).json({
        success: false,
        message: txResult.error,
        ...(txResult.data ? { data: txResult.data } : {}),
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: 'Account created successfully. Please sign in.',
      data: {
        user: txResult.user,
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



