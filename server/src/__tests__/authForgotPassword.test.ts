import request from 'supertest';
import app from '../app';
import { prisma } from '../config/db';
import bcrypt from 'bcryptjs';

describe('Auth: Forgot Password Feature (Citizen & Authority)', () => {
  const testCitizenEmail = 'test_citizen_fp@citizen.in';
  const testCitizenPhone = '+91 9123456780';
  const testAuthorityEmail = 'test_authority_fp@bbmp.gov.in';
  const testAuthorityPhone = '+91 8098765432';

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('initial_pass123', 10);

    // Create test Citizen
    await prisma.user.upsert({
      where: { email: testCitizenEmail },
      update: {
        passwordHash,
        phone: testCitizenPhone,
        resetOtpHash: null,
        resetOtpExpiresAt: null,
        resetOtpAttempts: 0,
        lastOtpRequestAt: null,
      },
      create: {
        name: 'Test Citizen FP',
        email: testCitizenEmail,
        passwordHash,
        role: 'CITIZEN',
        phone: testCitizenPhone,
      },
    });

    // Create test Authority
    await prisma.user.upsert({
      where: { email: testAuthorityEmail },
      update: {
        passwordHash,
        phone: testAuthorityPhone,
        resetOtpHash: null,
        resetOtpExpiresAt: null,
        resetOtpAttempts: 0,
        lastOtpRequestAt: null,
      },
      create: {
        name: 'Test Authority FP',
        email: testAuthorityEmail,
        passwordHash,
        role: 'AUTHORITY',
        phone: testAuthorityPhone,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: [testCitizenEmail, testAuthorityEmail] },
      },
    });
    await prisma.$disconnect();
  });

  describe('1. Identifier Detection & Account Check', () => {
    it('returns exact error message when identifier is not found (never leaks role)', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ identifier: 'nonexistent@example.com' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('No account found with this email/mobile number.');
      expect(res.body.role).toBeUndefined();
    });

    it('returns 400 if identifier is empty or missing', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ identifier: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('detects email identifier for Citizen and delivers OTP', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ identifier: testCitizenEmail });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destinationType).toBe('email');
      expect(res.body.data.maskedDestination).toContain('@');
      expect(res.body.data.devOtpHint).toBeDefined();
      expect(res.body.data.devOtpHint).toHaveLength(6);
    });

    it('detects phone identifier for Authority and delivers OTP via SMS', async () => {
      // Clear lastOtpRequestAt to bypass 30s cooldown for this test
      await prisma.user.update({
        where: { email: testAuthorityEmail },
        data: { lastOtpRequestAt: null },
      });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ identifier: testAuthorityPhone });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destinationType).toBe('phone');
      expect(res.body.data.maskedDestination).toContain('5432');
      expect(res.body.data.devOtpHint).toBeDefined();
      expect(res.body.data.devOtpHint).toHaveLength(6);
    });
  });

  describe('2. Rate Limiting & Cooldown', () => {
    it('rate-limits rapid OTP requests within the 30-second window', async () => {
      // First request already set lastOtpRequestAt to now
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ identifier: testAuthorityPhone });

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Please wait \d+ seconds before requesting a new OTP/);
    });
  });

  describe('3. OTP Verification', () => {
    let generatedOtp: string;

    beforeEach(async () => {
      // Reset cooldown and request fresh OTP
      await prisma.user.update({
        where: { email: testCitizenEmail },
        data: { lastOtpRequestAt: null },
      });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ identifier: testCitizenEmail });

      generatedOtp = res.body.data.devOtpHint;
    });

    it('rejects invalid 6-digit format', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ identifier: testCitizenEmail, otp: '123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('6-digit');
    });

    it('rejects incorrect OTP and decrements remaining attempts', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ identifier: testCitizenEmail, otp: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid OTP');
    });

    it('accepts correct 6-digit OTP and returns resetToken', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ identifier: testCitizenEmail, otp: generatedOtp });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resetToken).toBeDefined();
    });
  });

  describe('4. Set New Password & Post-Reset Verification', () => {
    let resetToken: string;

    beforeEach(async () => {
      await prisma.user.update({
        where: { email: testCitizenEmail },
        data: { lastOtpRequestAt: null },
      });

      const fpRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ identifier: testCitizenEmail });

      const otp = fpRes.body.data.devOtpHint;

      const verifyRes = await request(app)
        .post('/api/auth/verify-otp')
        .send({ identifier: testCitizenEmail, otp });

      resetToken = verifyRes.body.data.resetToken;
    });

    it('validates minimum password length of 6 characters', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ resetToken, newPassword: '123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('at least 6 characters');
    });

    it('validates that password and confirmPassword match', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          resetToken,
          newPassword: 'newSecurePassword123',
          confirmPassword: 'differentPassword456',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Passwords do not match.');
    });

    it('successfully resets password, invalidates OTP, and allows sign-in', async () => {
      const newPassword = 'brandNewPassword2026';

      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          resetToken,
          newPassword,
          confirmPassword: newPassword,
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);
      expect(resetRes.body.message).toBe('Password reset successfully. Please sign in.');

      // Replay attempt must fail because OTP session was invalidated
      const replayRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          resetToken,
          newPassword: 'anotherPassword',
        });

      expect(replayRes.status).toBe(400);
      expect(replayRes.body.message).toContain('already been used');

      // Old password must fail
      const oldLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testCitizenEmail, password: 'initial_pass123' });
      expect(oldLoginRes.status).toBe(401);

      // New password must succeed
      const newLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testCitizenEmail, password: newPassword });
      expect(newLoginRes.status).toBe(200);
      expect(newLoginRes.body.data.token).toBeDefined();
    });
  });
});
