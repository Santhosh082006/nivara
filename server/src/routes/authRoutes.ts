import { Router } from 'express';
import {
  register,
  login,
  getMe,
  requestPasswordReset,
  verifyResetOtp,
  resetPassword,
} from '../controllers/authController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, getMe);

// Forgot Password Flow
router.post('/forgot-password', requestPasswordReset);
router.post('/verify-otp', verifyResetOtp);
router.post('/reset-password', resetPassword);

export default router;
