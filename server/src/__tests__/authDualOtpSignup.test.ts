import request from 'supertest';
import app from '../app';
import { prisma } from '../config/db';
import { __testNotificationStore } from '../services/notificationService';

describe('Auth: Dual OTP Signup Verification (Citizen & Authority)', () => {
  const existingUserEmail = 'existing_citizen@example.com';
  const existingUserPhone = '+91 9999988888';
  const secureTestPassword = 'Nivara@Secure2026';

  const newCitizenEmail = 'fresh_citizen_test@example.com';
  const newCitizenPhone = '+91 9888877777';

  const newAuthorityEmail = 'fresh_authority_test@example.com';
  const newAuthorityPhone = '+91 8011223344';

  beforeAll(async () => {
    // Ensure clean state
    await prisma.pendingRegistration.deleteMany({
      where: {
        email: { in: [existingUserEmail, newCitizenEmail, newAuthorityEmail] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: { in: [existingUserEmail, newCitizenEmail, newAuthorityEmail] },
      },
    });

    // Create an existing user for duplicate checking
    await prisma.user.create({
      data: {
        name: 'Existing User',
        email: existingUserEmail,
        phone: existingUserPhone,
        passwordHash: 'dummy_hash',
        role: 'CITIZEN',
      },
    });
  });

  afterAll(async () => {
    await prisma.pendingRegistration.deleteMany({
      where: {
        email: { in: [existingUserEmail, newCitizenEmail, newAuthorityEmail] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: { in: [existingUserEmail, newCitizenEmail, newAuthorityEmail] },
      },
    });
    await prisma.$disconnect();
  });

  describe('1. Mobile Format, Password Policy & Duplicate Prevention', () => {
    it('rejects invalid mobile number format', async () => {
      const res = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Test Citizen',
          email: newCitizenEmail,
          phone: '12345',
          password: secureTestPassword,
          role: 'CITIZEN',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Mobile number must be 10 digits');
    });

    it('rejects weak password failing 12+ char security policy', async () => {
      const res = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Weak Password Citizen',
          email: 'weak_citizen@example.com',
          phone: '+91 9123412345',
          password: 'weak',
          role: 'CITIZEN',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('at least 12 characters');
    });

    it('rejects password confirmation mismatch', async () => {
      const res = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Mismatch Citizen',
          email: 'mismatch_citizen@example.com',
          phone: '+91 9123412345',
          password: secureTestPassword,
          confirmPassword: 'DifferentPassword@2026',
          role: 'CITIZEN',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('match');
    });

    it('rejects duplicate email address', async () => {
      const res = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Duplicate Email User',
          email: existingUserEmail,
          phone: '+91 9111122222',
          password: secureTestPassword,
          role: 'CITIZEN',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('email address already exists');
    });

    it('rejects duplicate mobile number', async () => {
      const res = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Duplicate Phone User',
          email: 'unique_email@example.com',
          phone: existingUserPhone,
          password: secureTestPassword,
          role: 'CITIZEN',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('mobile number already exists');
    });
  });

  describe('2. Delivery Fallback & Error Handling', () => {
    it('returns clear error when external notification service fails', async () => {
      process.env.TEST_SIMULATE_DELIVERY_FAILURE = 'true';
      try {
        const res = await request(app)
          .post('/api/auth/signup/start')
          .send({
            name: 'Failure Test Citizen',
            email: 'fail_test@example.com',
            phone: '+91 9123412345',
            password: secureTestPassword,
            role: 'CITIZEN',
          });

        expect(res.status).toBe(502);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe("We couldn't send the verification code. Please try again or contact support.");
      } finally {
        delete process.env.TEST_SIMULATE_DELIVERY_FAILURE;
      }
    });
  });

  describe('3. Dual OTP Issuance & Separate Delivery', () => {
    let sessionId: string;
    let emailOtp: string;
    let phoneOtp: string;

    it('issues two separate 6-digit OTPs dispatched via real services (no on-screen dev leaks)', async () => {
      const res = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Fresh Citizen',
          email: newCitizenEmail,
          phone: newCitizenPhone,
          password: secureTestPassword,
          role: 'CITIZEN',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toBeDefined();
      expect(res.body.data.maskedEmail).toContain('@');
      expect(res.body.data.maskedPhone).toContain('7777');

      // Demo OTP hints removed from client response
      expect(res.body.data.devOtpHints).toBeUndefined();

      sessionId = res.body.data.sessionId;
      emailOtp = __testNotificationStore.emails[newCitizenEmail];
      phoneOtp = __testNotificationStore.sms[newCitizenPhone];

      expect(emailOtp).toHaveLength(6);
      expect(phoneOtp).toHaveLength(6);
      expect(emailOtp).not.toBe(phoneOtp);
    });

    it('rejects completion before OTPs are verified', async () => {
      const res = await request(app)
        .post('/api/auth/signup/complete')
        .send({
          sessionId,
          name: 'Fresh Citizen',
          password: secureTestPassword,
          role: 'CITIZEN',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Both email and mobile number must be verified');
    });

    it('verifies Email OTP independently', async () => {
      const res = await request(app)
        .post('/api/auth/signup/verify-otp')
        .send({
          sessionId,
          type: 'email',
          otp: emailOtp,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isEmailVerified).toBe(true);
      expect(res.body.data.isPhoneVerified).toBe(false);
      expect(res.body.data.bothVerified).toBe(false);
    });

    it('still blocks completion when only email is verified', async () => {
      const res = await request(app)
        .post('/api/auth/signup/complete')
        .send({
          sessionId,
          name: 'Fresh Citizen',
          password: secureTestPassword,
          role: 'CITIZEN',
        });

      expect(res.status).toBe(400);
      expect(res.body.data.isEmailVerified).toBe(true);
      expect(res.body.data.isPhoneVerified).toBe(false);
    });

    it('verifies Mobile OTP independently and marks bothVerified true', async () => {
      const res = await request(app)
        .post('/api/auth/signup/verify-otp')
        .send({
          sessionId,
          type: 'phone',
          otp: phoneOtp,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isEmailVerified).toBe(true);
      expect(res.body.data.isPhoneVerified).toBe(true);
      expect(res.body.data.bothVerified).toBe(true);
    });

    it('completes account creation and creates user in database', async () => {
      const res = await request(app)
        .post('/api/auth/signup/complete')
        .send({
          sessionId,
          name: 'Fresh Citizen',
          password: secureTestPassword,
          role: 'CITIZEN',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Account created successfully. Please sign in.');
      expect(res.body.data.user.email).toBe(newCitizenEmail);
      expect(res.body.data.user.role).toBe('CITIZEN');

      // Verify two-step sign in works with new credentials
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: newCitizenEmail,
          password: secureTestPassword,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.requiresOtp).toBe(true);
      expect(loginRes.body.data.loginChallengeToken).toBeDefined();

      const loginOtp = __testNotificationStore.emails[newCitizenEmail];
      const verifyRes = await request(app)
        .post('/api/auth/login/verify-otp')
        .send({
          loginChallengeToken: loginRes.body.data.loginChallengeToken,
          otp: loginOtp,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.token).toBeDefined();
    });
  });

  describe('4. Authority Account Dual OTP Registration', () => {
    it('creates an AUTHORITY account after verifying both real OTPs', async () => {
      // 1. Start Authority Signup
      const startRes = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Ward 174 Superintendent',
          email: newAuthorityEmail,
          phone: newAuthorityPhone,
          password: 'Authority@Secure2026',
          role: 'AUTHORITY',
        });

      expect(startRes.status).toBe(200);
      const { sessionId } = startRes.body.data;
      const authorityEmailOtp = __testNotificationStore.emails[newAuthorityEmail];
      const authorityPhoneOtp = __testNotificationStore.sms[newAuthorityPhone];

      // 2. Verify Email OTP
      await request(app)
        .post('/api/auth/signup/verify-otp')
        .send({
          sessionId,
          type: 'email',
          otp: authorityEmailOtp,
        });

      // 3. Verify Phone OTP
      await request(app)
        .post('/api/auth/signup/verify-otp')
        .send({
          sessionId,
          type: 'phone',
          otp: authorityPhoneOtp,
        });

      // 4. Complete Registration
      const compRes = await request(app)
        .post('/api/auth/signup/complete')
        .send({
          sessionId,
          name: 'Ward 174 Superintendent',
          password: 'Authority@Secure2026',
          role: 'AUTHORITY',
        });

      expect(compRes.status).toBe(201);
      expect(compRes.body.data.user.role).toBe('AUTHORITY');

      // 5. Verify sign-in flow with AUTHORITY role
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: newAuthorityEmail,
          password: 'Authority@Secure2026',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.requiresOtp).toBe(true);

      const loginOtp = __testNotificationStore.emails[newAuthorityEmail];
      const verifyRes = await request(app)
        .post('/api/auth/login/verify-otp')
        .send({
          loginChallengeToken: loginRes.body.data.loginChallengeToken,
          otp: loginOtp,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.user.role).toBe('AUTHORITY');
    });
  });

  describe('5. Independent Resend Cooldowns', () => {
    it('enforces 30s cooldown per channel', async () => {
      const testEmail = 'cooldown_test@example.com';
      const testPhone = '+91 9777766666';

      const startRes = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Cooldown User',
          email: testEmail,
          phone: testPhone,
          password: secureTestPassword,
          role: 'CITIZEN',
        });

      const { sessionId } = startRes.body.data;

      // Immediate resend should be blocked with 429
      const resendRes = await request(app)
        .post('/api/auth/signup/resend-otp')
        .send({
          sessionId,
          type: 'email',
        });

      expect(resendRes.status).toBe(429);
      expect(resendRes.body.message).toMatch(/Please wait \d+ seconds before requesting a new email OTP/);

      // Cleanup
      await prisma.pendingRegistration.deleteMany({ where: { id: sessionId } });
    });
  });
});
