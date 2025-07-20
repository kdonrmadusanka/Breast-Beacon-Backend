import express from "express";
import {
  getCurrentUser,
  updateProfile,
  checkProfileCompletion,
  verifyAdminKey,
  getRoleRequirements,
} from "../controllers/user.controller.js";
import {
  authenticate,
  checkProfileComplete,
} from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { check } from "express-validator";

const router = express.Router();

// @route   GET /api/users/me
// @desc    Get current user profile
// @access  Private
router.get("/me", authenticate(), getCurrentUser);

// @route   PUT /api/users/me
// @desc    Update user profile
// @access  Private
router.put(
  "/me",
  authenticate(),
  validate([
    check("firstName", "First name is required").notEmpty().trim(),
    check("lastName", "Last name is required").notEmpty().trim(),
    check("phoneNumber", "Valid phone number is required")
      .isMobilePhone()
      .trim(),
    check("dateOfBirth", "Valid date of birth is required")
      .isISO8601()
      .toDate(),
  ]),
  updateProfile
);

// @route   GET /api/users/check-completion
// @desc    Check profile completion status
// @access  Private
router.get("/check-completion", authenticate(), checkProfileCompletion);

// @route   POST /api/users/verify-admin-key
// @desc    Verify admin key
// @access  Private/Admin
router.post(
  "/verify-admin-key",
  authenticate(["admin"]),
  checkProfileComplete,
  validate([check("adminKey", "Admin key is required").notEmpty().trim()]),
  verifyAdminKey
);

// @route   GET /api/users/role-requirements
// @desc    Get requirements for each role
// @access  Public
router.get("/role-requirements", getRoleRequirements);

export default router;
