import { Router } from 'express';
import {
  register,
  login,
  getMe,
  requestPasswordReset,
  verifyResetOtp,
  resetPassword,
  startSignup,
  verifySignupOtp,
  resendSignupOtp,
  completeSignup,
} from '../controllers/authController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// Legacy direct registration (backward-compatibility)
router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, getMe);

// Dual OTP Signup Verification Flow
router.post('/signup/start', startSignup);
router.post('/signup/verify-otp', verifySignupOtp);
router.post('/signup/resend-otp', resendSignupOtp);
router.post('/signup/complete', completeSignup);

// Forgot Password Flow
router.post('/forgot-password', requestPasswordReset);
router.post('/verify-otp', verifyResetOtp);
router.post('/reset-password', resetPassword);

export default router;
