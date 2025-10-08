import express from 'express';
import {
  verifyEmail,
  resendVerificationEmail,
} from '../controllers/user.controller.js';
import { resendVerificationLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Email verification route
router.get('/verify-email', verifyEmail);
// Resend verification email route
router.post(
  '/resend-verification',
  resendVerificationLimiter,
  resendVerificationEmail,
);

export default router;
