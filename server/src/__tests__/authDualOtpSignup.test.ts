import request from 'supertest';
import app from '../app';
import { prisma } from '../config/db';

describe('Auth: Dual OTP Signup Verification (Citizen & Authority)', () => {
  const existingUserEmail = 'existing_citizen@example.com';
  const existingUserPhone = '+91 9999988888';

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

  describe('1. Mobile Format & Duplicate Prevention', () => {
    it('rejects invalid mobile number format', async () => {
      const res = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Test Citizen',
          email: newCitizenEmail,
          phone: '12345',
          password: 'password123',
          role: 'CITIZEN',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Mobile number must be 10 digits');
    });

    it('rejects duplicate email address', async () => {
      const res = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Duplicate Email User',
          email: existingUserEmail,
          phone: '+91 9111122222',
          password: 'password123',
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
          password: 'password123',
          role: 'CITIZEN',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('mobile number already exists');
    });
  });

  describe('2. Dual OTP Issuance & Separate Delivery', () => {
    let sessionId: string;
    let emailOtp: string;
    let phoneOtp: string;

    it('issues two separate 6-digit OTPs for email and mobile', async () => {
      const res = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Fresh Citizen',
          email: newCitizenEmail,
          phone: newCitizenPhone,
          password: 'securePassword123',
          role: 'CITIZEN',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toBeDefined();
      expect(res.body.data.maskedEmail).toContain('@');
      expect(res.body.data.maskedPhone).toContain('7777');

      sessionId = res.body.data.sessionId;
      emailOtp = res.body.data.devOtpHints.emailOtp;
      phoneOtp = res.body.data.devOtpHints.phoneOtp;

      expect(emailOtp).toHaveLength(6);
      expect(phoneOtp).toHaveLength(6);
    });

    it('rejects completion before OTPs are verified', async () => {
      const res = await request(app)
        .post('/api/auth/signup/complete')
        .send({
          sessionId,
          name: 'Fresh Citizen',
          password: 'securePassword123',
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
          password: 'securePassword123',
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
          password: 'securePassword123',
          role: 'CITIZEN',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Account created successfully. Please sign in.');
      expect(res.body.data.user.email).toBe(newCitizenEmail);
      expect(res.body.data.user.role).toBe('CITIZEN');

      // Verify sign in works with new credentials
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: newCitizenEmail,
          password: 'securePassword123',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.token).toBeDefined();
    });
  });

  describe('3. Authority Account Dual OTP Registration', () => {
    it('creates an AUTHORITY account after verifying both OTPs', async () => {
      // 1. Start Authority Signup
      const startRes = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Ward 174 Superintendent',
          email: newAuthorityEmail,
          phone: newAuthorityPhone,
          password: 'authoritySecret2026',
          role: 'AUTHORITY',
        });

      expect(startRes.status).toBe(200);
      const { sessionId, devOtpHints } = startRes.body.data;

      // 2. Verify Email OTP
      await request(app)
        .post('/api/auth/signup/verify-otp')
        .send({
          sessionId,
          type: 'email',
          otp: devOtpHints.emailOtp,
        });

      // 3. Verify Phone OTP
      await request(app)
        .post('/api/auth/signup/verify-otp')
        .send({
          sessionId,
          type: 'phone',
          otp: devOtpHints.phoneOtp,
        });

      // 4. Complete Registration
      const compRes = await request(app)
        .post('/api/auth/signup/complete')
        .send({
          sessionId,
          name: 'Ward 174 Superintendent',
          password: 'authoritySecret2026',
          role: 'AUTHORITY',
        });

      expect(compRes.status).toBe(201);
      expect(compRes.body.data.user.role).toBe('AUTHORITY');

      // 5. Verify sign-in issues token with AUTHORITY role
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: newAuthorityEmail,
          password: 'authoritySecret2026',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.role).toBe('AUTHORITY');
    });
  });

  describe('4. Independent Resend Cooldowns', () => {
    it('enforces 30s cooldown per channel', async () => {
      const testEmail = 'cooldown_test@example.com';
      const testPhone = '+91 9777766666';

      const startRes = await request(app)
        .post('/api/auth/signup/start')
        .send({
          name: 'Cooldown User',
          email: testEmail,
          phone: testPhone,
          password: 'password123',
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
