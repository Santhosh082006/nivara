import { Router } from 'express';
import {
  register,
  login,
  verifyLoginOtp,
  resendLoginOtp,
  getMe,
  requestPasswordReset,
  verifyResetOtp,
  resendResetOtp,
  resetPassword,
  startSignup,
  verifySignupOtp,
  resendSignupOtp,
  completeSignup,
} from '../controllers/authController';
import { requireAuth } from '../middleware/authMiddleware';
import { otpDispatchRateLimiter, otpVerifyRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Legacy direct registration (backward-compatibility)
router.post('/register', register);
router.get('/me', requireAuth, getMe);

// Two-Step Sign In Flow with Real OTP Challenge
router.post('/login', otpDispatchRateLimiter(5, 10 * 60 * 1000), login);
router.post('/login/verify-otp', otpVerifyRateLimiter(10, 10 * 60 * 1000), verifyLoginOtp);
router.post('/login/resend-otp', otpDispatchRateLimiter(5, 10 * 60 * 1000), resendLoginOtp);

// Dual OTP Signup Verification Flow
router.post('/signup/start', otpDispatchRateLimiter(5, 10 * 60 * 1000), startSignup);
router.post('/signup/verify-otp', otpVerifyRateLimiter(10, 10 * 60 * 1000), verifySignupOtp);
router.post('/signup/resend-otp', otpDispatchRateLimiter(5, 10 * 60 * 1000), resendSignupOtp);
router.post('/signup/complete', completeSignup);

// Dedicated Password Reset Flow
router.post('/password-reset/request', otpDispatchRateLimiter(5, 10 * 60 * 1000), requestPasswordReset);
router.post('/password-reset/verify-otp', otpVerifyRateLimiter(10, 10 * 60 * 1000), verifyResetOtp);
router.post('/password-reset/resend-otp', otpDispatchRateLimiter(5, 10 * 60 * 1000), resendResetOtp);
router.post('/password-reset/reset', resetPassword);

// Backward-compatible aliases for forgot password
router.post('/forgot-password', otpDispatchRateLimiter(5, 10 * 60 * 1000), requestPasswordReset);
router.post('/verify-otp', otpVerifyRateLimiter(10, 10 * 60 * 1000), verifyResetOtp);
router.post('/reset-password', resetPassword);

export default router;
