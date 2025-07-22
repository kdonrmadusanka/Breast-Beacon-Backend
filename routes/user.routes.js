import express from "express";
import {
  getUserProfile,
  updateUserProfile,
  deleteUserAccount,
  getAllUsers,
  getUserSessions,
  revokeSession,
} from "../controllers/user.controller.js";
import {
  validate,
  validationSchemas,
} from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { check } from "express-validator";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

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
const updateProfileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 profile updates per window
  message:
    "Too many profile update attempts, please try again after 15 minutes",
});

const deleteAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit to 3 account deletion attempts per window
  message:
    "Too many account deletion attempts, please try again after 15 minutes",
});

const revokeSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 session revocation attempts per window
  message:
    "Too many session revocation attempts, please try again after 15 minutes",
});

/**
 * @desc    Get current user's profile
 * @route   GET /api/users/profile
 * @access  Private
 */
router.get("/profile", authenticate(), getUserProfile);

/**
 * @desc    Update current user's profile
 * @route   PUT /api/users/profile
 * @access  Private
 */
router.put(
  "/profile",
  authenticate(),
  updateProfileLimiter,
  validate([
    validationSchemas.firstName.optional(),
    validationSchemas.lastName.optional(),
    validationSchemas.phoneNumber.optional(),
    validationSchemas.dateOfBirth.optional(),
  ]),
  updateUserProfile
);

/**
 * @desc    Delete current user's account
 * @route   DELETE /api/users/profile
 * @access  Private
 */
router.delete(
  "/profile",
  authenticate(),
  deleteAccountLimiter,
  deleteUserAccount
);

/**
 * @desc    Get all users (admin only)
 * @route   GET /api/users
 * @access  Private (admin)
 */
router.get("/", authenticate(["admin"]), getAllUsers);

/**
 * @desc    Get active sessions for current user
 * @route   GET /api/users/sessions
 * @access  Private
 */
router.get("/sessions", authenticate(), getUserSessions);

/**
 * @desc    Revoke a session
 * @route   DELETE /api/users/sessions/:sessionId
 * @access  Private
 */
router.delete(
  "/sessions/:sessionId",
  authenticate(),
  revokeSessionLimiter,
  validate([check("sessionId").isMongoId().withMessage("Invalid session ID")]),
  revokeSession
);

export default router;
