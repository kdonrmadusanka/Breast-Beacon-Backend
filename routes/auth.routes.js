import express from "express";
import {
  register,
  verifyEmail,
  login,
  refreshToken,
  forgotPassword,
  resetPassword,
  logout,
  resendVerificationEmail,
  setupTwoFactor,
  verifyTwoFactor,
} from "../controllers/auth.controller.js";
import {
  validate,
  validationSchemas,
} from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import winston from "winston";

// Configure Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/auth.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

const router = express.Router();

// Apply security headers
router.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", process.env.FRONTEND_URL],
    },
  })
);

// Rate limiters for sensitive routes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 login attempts per window
  message: "Too many login attempts, please try again after 15 minutes",
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit to 3 registration attempts per window
  message: "Too many registration attempts, please try again after 1 hour",
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit to 3 password reset requests per window
  message: "Too many password reset requests, please try again after 1 hour",
});

const twoFactorSetupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit to 3 2FA setup attempts per window
  message: "Too many 2FA setup attempts, please try again after 15 minutes",
});

const twoFactorVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 2FA verification attempts per window
  message:
    "Too many 2FA verification attempts, please try again after 15 minutes",
});

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
router.post(
  "/register",
  registerLimiter,
  validate([
    validationSchemas.email,
    validationSchemas.password,
    validationSchemas.firstName,
    validationSchemas.lastName,
    validationSchemas.phoneNumber,
    validationSchemas.dateOfBirth,
    validationSchemas.role.optional(),
  ]),
  (req, res, next) => {
    logger.info("Route accessed: POST /api/auth/register", {
      email: req.body.email,
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    register(req, res, next);
  }
);

/**
 * @desc    Verify email address
 * @route   GET /api/auth/verify-email/:token
 * @access  Public
 */
router.get("/verify-email/:token", (req, res, next) => {
  logger.info("Route accessed: GET /api/auth/verify-email/:token", {
    token: req.params.token,
    ipAddress: req.ip,
    deviceInfo: req.headers["user-agent"] || "Unknown",
  });
  verifyEmail(req, res, next);
});

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
router.post(
  "/login",
  loginLimiter,
  validate([
    validationSchemas.email,
    validationSchemas.password,
    validationSchemas.twoFactorCode.optional(),
  ]),
  (req, res, next) => {
    logger.info("Route accessed: POST /api/auth/login", {
      email: req.body.email,
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    login(req, res, next);
  }
);

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh-token
 * @access  Private
 */
router.post(
  "/refresh-token",
  validate([validationSchemas.refreshToken]),
  (req, res, next) => {
    logger.info("Route accessed: POST /api/auth/refresh-token", {
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    refreshToken(req, res, next);
  }
);

/**
 * @desc    Forgot password - Send reset email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validate([validationSchemas.email]),
  (req, res, next) => {
    logger.info("Route accessed: POST /api/auth/forgot-password", {
      email: req.body.email,
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    forgotPassword(req, res, next);
  }
);

/**
 * @desc    Reset password
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 */
router.post(
  "/reset-password/:token",
  validate([
    validationSchemas.password,
    validationSchemas.twoFactorCode.optional(),
  ]),
  (req, res, next) => {
    logger.info("Route accessed: POST /api/auth/reset-password/:token", {
      token: req.params.token,
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    resetPassword(req, res, next);
  }
);

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
router.post("/logout", authenticate(), (req, res, next) => {
  logger.info("Route accessed: POST /api/auth/logout", {
    userId: req.user._id,
    ipAddress: req.ip,
    deviceInfo: req.headers["user-agent"] || "Unknown",
  });
  logout(req, res, next);
});

/**
 * @desc    Resend verification email
 * @route   POST /api/auth/resend-verification
 * @access  Private
 */
router.post(
  "/resend-verification",
  authenticate({ skipEmailVerification: true }),
  (req, res, next) => {
    logger.info("Route accessed: POST /api/auth/resend-verification", {
      userId: req.user._id,
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    resendVerificationEmail(req, res, next);
  }
);

/**
 * @desc    Setup 2FA and return QR code URL
 * @route   POST /api/auth/setup-2fa
 * @access  Private
 */
router.post(
  "/setup-2fa",
  authenticate(),
  twoFactorSetupLimiter,
  (req, res, next) => {
    logger.info("Route accessed: POST /api/auth/setup-2fa", {
      userId: req.user._id,
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    setupTwoFactor(req, res, next);
  }
);

/**
 * @desc    Verify 2FA setup with TOTP code
 * @route   POST /api/auth/verify-2fa
 * @access  Private
 */
router.post(
  "/verify-2fa",
  authenticate(),
  twoFactorVerifyLimiter,
  validate([validationSchemas.twoFactorCode]),
  (req, res, next) => {
    logger.info("Route accessed: POST /api/auth/verify-2fa", {
      userId: req.user._id,
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    verifyTwoFactor(req, res, next);
  }
);

export default router;
