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
} from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import { check } from "express-validator";
import { authenticate } from "../middlewares/auth.middleware.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post(
  "/register",
  validate([
    check("email", "Please include a valid email").isEmail().normalizeEmail(),
    check("password", "Password must be at least 8 characters").isLength({
      min: 8,
    }),
    check("firstName", "First name is required").notEmpty().trim(),
    check("lastName", "Last name is required").notEmpty().trim(),
    check("phoneNumber", "Please include a valid phone number")
      .isMobilePhone()
      .trim(),
    check("dateOfBirth", "Please include a valid date of birth")
      .isISO8601()
      .toDate(),
    check("role", "Please specify a valid role")
      .optional()
      .isIn(["patient", "clinician", "admin"]),
  ]),
  register
);

// @route   GET /api/auth/verify-email/:token
// @desc    Verify email address
// @access  Public
router.get(
  "/verify-email/:token",
  validate([check("token", "Verification token is required").notEmpty()]),
  verifyEmail
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post(
  "/login",
  validate([
    check("email", "Please include a valid email").isEmail().normalizeEmail(),
    check("password", "Password is required").notEmpty(),
  ]),
  login
);

// @route   POST /api/auth/refresh-token
// @desc    Refresh access token
// @access  Private (requires refresh token)
router.post(
  "/refresh-token",
  validate([check("refreshToken", "Refresh token is required").notEmpty()]),
  refreshToken
);

// @route   POST /api/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post(
  "/forgot-password",
  validate([
    check("email", "Please include a valid email").isEmail().normalizeEmail(),
  ]),
  forgotPassword
);

// @route   POST /api/auth/reset-password/:token
// @desc    Reset password
// @access  Public
router.post(
  "/reset-password/:token",
  validate([
    check("token", "Reset token is required").notEmpty(),
    check("password", "Password must be at least 8 characters").isLength({
      min: 8,
    }),
  ]),
  resetPassword
);

// @route   POST /api/auth/logout
// @desc    Logout user (invalidate token)
// @access  Private
router.post("/logout", authenticate(), logout);

const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 requests per windowMs
  message: "Too many verification requests, please try again later",
});

router.post(
  "/resend-verification",
  resendVerificationLimiter,
  authenticate([], { allowPending: true, skipEmailVerification: true }),
  resendVerificationEmail
);

export default router;
