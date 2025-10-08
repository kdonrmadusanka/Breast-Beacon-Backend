// middleware/rateLimiter.js
import rateLimit from 'express-rate-limit';

// Rate limiter for resend verification emails
export const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 requests per windowMs
  message: {
    success: false,
    message:
      'Too many verification email requests. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
