import crypto from 'crypto';

/**
 * Dedicated secret for HMAC-SHA256 OTP hashing.
 * Strictly decoupled from JWT_SECRET to ensure independent key rotation and security isolation.
 */
export function getOtpSecret(): string {
  const secret = process.env.OTP_SECRET;
  if (!secret) {
    throw new Error(
      '[SecurityError] OTP_SECRET is not configured. A dedicated 32-byte secret is required for HMAC-SHA256 OTP hashing.'
    );
  }
  return secret;
}

/**
 * Generate a cryptographically secure 6-digit numeric OTP.
 * Uses crypto.randomInt for uniform distribution and unpredictability.
 */
export function generateSecureOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hash an OTP using HMAC-SHA256 with the dedicated OTP_SECRET pepper.
 * Prevents rainbow table / offline brute-forcing of the 1,000,000 6-digit keyspace.
 */
export function hashOtp(otp: string): string {
  const cleanOtp = (otp || '').trim();
  const secret = getOtpSecret();
  return crypto.createHmac('sha256', secret).update(cleanOtp).digest('hex');
}

/**
 * Constant-time verification of an input OTP against the stored HMAC-SHA256 hash.
 * Protects against timing side-channel attacks.
 */
export function verifyOtpHash(inputOtp: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !inputOtp) {
    return false;
  }

  const computedHash = hashOtp(inputOtp);
  const computedBuffer = Buffer.from(computedHash, 'utf8');
  const storedBuffer = Buffer.from(storedHash, 'utf8');

  if (computedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, storedBuffer);
}
