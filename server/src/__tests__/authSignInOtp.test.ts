import request from 'supertest';
import app from '../app';
import { prisma } from '../config/db';
import bcrypt from 'bcryptjs';
import { __testNotificationStore } from '../services/notificationService';

describe('Auth: Two-Step Sign-In with Real-Time OTP Verification', () => {
  const citizenEmail = 'signin_citizen@example.com';
  const citizenPhone = '+91 9988776655';
  const citizenPassword = 'ValidCitizenPassword@123';

  const authorityEmail = 'signin_authority@example.com';
  const authorityPhone = '+91 9123456789';
  const authorityPassword = 'ValidAuthorityPassword@123';

  beforeAll(async () => {
    const citizenPasswordHash = await bcrypt.hash(citizenPassword, 10);
    const authorityPasswordHash = await bcrypt.hash(authorityPassword, 10);

    // Clean up any leftovers
    await prisma.user.deleteMany({
      where: {
        email: { in: [citizenEmail, authorityEmail] },
      },
    });

    // Create Citizen
    await prisma.user.create({
      data: {
        name: 'SignIn Citizen User',
        email: citizenEmail,
        phone: citizenPhone,
        passwordHash: citizenPasswordHash,
        role: 'CITIZEN',
      },
    });

    // Create Authority
    await prisma.user.create({
      data: {
        name: 'SignIn Authority User',
        email: authorityEmail,
        phone: authorityPhone,
        passwordHash: authorityPasswordHash,
        role: 'AUTHORITY',
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: [citizenEmail, authorityEmail] },
      },
    });
    await prisma.$disconnect();
  });

  describe('1. Step 1: Credential Validation & Challenge Issuance', () => {
    it('rejects invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: citizenEmail,
          password: 'IncorrectPassword@999',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid email/i);
    });

    it('rejects non-existent account', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent_account@example.com',
          password: citizenPassword,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid email/i);
    });

    it('dispatches OTP to email channel when logging in via email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: citizenEmail,
          password: citizenPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.requiresOtp).toBe(true);
      expect(res.body.data.channel).toBe('email');
      expect(res.body.data.maskedDestination).toContain('@');
      expect(res.body.data.loginChallengeToken).toBeDefined();

      // Verify real notification service stored the OTP in test store
      const dispatchedOtp = __testNotificationStore.emails[citizenEmail];
      expect(dispatchedOtp).toBeDefined();
      expect(dispatchedOtp).toHaveLength(6);
    });

    it('dispatches OTP to mobile channel when logging in via phone identifier', async () => {
      // Clear cooldown
      await prisma.user.update({
        where: { email: citizenEmail },
        data: { loginLastSentAt: null },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          identifier: citizenPhone,
          password: citizenPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.requiresOtp).toBe(true);
      expect(res.body.data.channel).toBe('phone');
      expect(res.body.data.maskedDestination).toContain('6655');
      expect(res.body.data.loginChallengeToken).toBeDefined();

      const dispatchedOtp = __testNotificationStore.sms[citizenPhone];
      expect(dispatchedOtp).toBeDefined();
      expect(dispatchedOtp).toHaveLength(6);
    });
  });

  describe('2. Step 2: Login OTP Verification & Session Issuance', () => {
    let challengeToken: string;
    let validOtp: string;

    beforeEach(async () => {
      await prisma.user.update({
        where: { email: citizenEmail },
        data: { loginLastSentAt: null, loginOtpAttempts: 0 },
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: citizenEmail,
          password: citizenPassword,
        });

      challengeToken = loginRes.body.data.loginChallengeToken;
      validOtp = __testNotificationStore.emails[citizenEmail];
    });

    it('rejects invalid OTP format', async () => {
      const res = await request(app)
        .post('/api/auth/login/verify-otp')
        .send({
          loginChallengeToken: challengeToken,
          otp: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('6-digit');
    });

    it('rejects incorrect OTP and counts attempts', async () => {
      const res = await request(app)
        .post('/api/auth/login/verify-otp')
        .send({
          loginChallengeToken: challengeToken,
          otp: '000000',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid verification code');
    });

    it('locks verification session after 5 failed attempts', async () => {
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post('/api/auth/login/verify-otp')
          .send({
            loginChallengeToken: challengeToken,
            otp: '000000',
          });
      }

      // 5th failed attempt should trigger lockout
      const lockRes = await request(app)
        .post('/api/auth/login/verify-otp')
        .send({
          loginChallengeToken: challengeToken,
          otp: '000000',
        });

      expect(lockRes.status).toBe(429);
      expect(lockRes.body.message).toContain('Too many failed verification attempts');

      // Even correct OTP is now rejected because OTP session was cleared
      const followUpRes = await request(app)
        .post('/api/auth/login/verify-otp')
        .send({
          loginChallengeToken: challengeToken,
          otp: validOtp,
        });

      expect(followUpRes.status).toBe(400);
      expect(followUpRes.body.message).toContain('Invalid or expired');
    });

    it('accepts valid OTP and issues session token and user info', async () => {
      const res = await request(app)
        .post('/api/auth/login/verify-otp')
        .send({
          loginChallengeToken: challengeToken,
          otp: validOtp,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe(citizenEmail);
      expect(res.body.data.user.role).toBe('CITIZEN');

      // Replay attempt must fail (atomic single-use consumption)
      const replayRes = await request(app)
        .post('/api/auth/login/verify-otp')
        .send({
          loginChallengeToken: challengeToken,
          otp: validOtp,
        });

      expect(replayRes.status).toBe(400);
      expect(replayRes.body.message).toContain('Invalid or expired');
    });
  });

  describe('3. Login OTP Resend & Cooldown', () => {
    it('enforces 30-second cooldown on resending login OTP', async () => {
      await prisma.user.update({
        where: { email: authorityEmail },
        data: { loginLastSentAt: null },
      });

      const initialRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: authorityEmail,
          password: authorityPassword,
        });

      const challengeToken = initialRes.body.data.loginChallengeToken;

      // Immediate resend should be rate-limited (429)
      const resendRes = await request(app)
        .post('/api/auth/login/resend-otp')
        .send({ loginChallengeToken: challengeToken });

      expect(resendRes.status).toBe(429);
      expect(resendRes.body.message).toMatch(/Please wait \d+ seconds/);
    });

    it('generates new OTP upon resend and invalidates previous OTP', async () => {
      await prisma.user.update({
        where: { email: authorityEmail },
        data: { loginLastSentAt: null },
      });

      const initialRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: authorityEmail,
          password: authorityPassword,
        });

      const challengeToken = initialRes.body.data.loginChallengeToken;
      const initialOtp = __testNotificationStore.emails[authorityEmail];

      // Artificially bypass cooldown for test
      await prisma.user.update({
        where: { email: authorityEmail },
        data: { loginLastSentAt: new Date(Date.now() - 35000) },
      });

      const resendRes = await request(app)
        .post('/api/auth/login/resend-otp')
        .send({ loginChallengeToken: challengeToken });

      expect(resendRes.status).toBe(200);
      expect(resendRes.body.success).toBe(true);

      const newOtp = __testNotificationStore.emails[authorityEmail];
      expect(newOtp).toHaveLength(6);

      // Previous OTP should now fail
      const oldVerifyRes = await request(app)
        .post('/api/auth/login/verify-otp')
        .send({
          loginChallengeToken: challengeToken,
          otp: initialOtp,
        });

      if (initialOtp !== newOtp) {
        expect(oldVerifyRes.status).toBe(400);
        expect(oldVerifyRes.body.message).toContain('Invalid verification code');
      }

      // New OTP succeeds
      const newVerifyRes = await request(app)
        .post('/api/auth/login/verify-otp')
        .send({
          loginChallengeToken: challengeToken,
          otp: newOtp,
        });

      expect(newVerifyRes.status).toBe(200);
      expect(newVerifyRes.body.data.user.role).toBe('AUTHORITY');
    });
  });
});
