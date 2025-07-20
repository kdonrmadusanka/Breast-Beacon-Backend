import jwt from "jsonwebtoken";
import User from "../models/User.model.js";
import asyncHandler from "express-async-handler";
import { AppError } from "../utils/errorHandler.js";

/**
 * Authentication middleware that verifies JWT tokens
 * and attaches user to request object
 */
const authenticate = (roles = [], options = {}) => {
  return asyncHandler(async (req, res, next) => {
    let token;

    // 1. Check for token
    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new AppError("Not authorized - No token provided", 401);
    }

    try {
      // 2. Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 3. Get user from database
      const user = await User.findById(decoded.id).select(
        "-password -refreshToken -emailVerificationToken -passwordResetToken"
      );

      if (!user) {
        throw new AppError("Not authorized - User not found", 401);
      }

      // 4. Modified: Skip status check if explicitly allowed
      if (!options.allowPending && user.status !== "active") {
        throw new AppError(
          `Account is ${user.status}. Please contact support.`,
          403
        );
      }

      // 5. Modified: Skip email verification check if explicitly allowed
      if (
        !options.skipEmailVerification &&
        process.env.REQUIRE_EMAIL_VERIFICATION === "true" &&
        !user.emailVerified
      ) {
        throw new AppError(
          "Please verify your email before accessing this resource",
          403
        );
      }

      // 6. Check role permissions
      if (roles.length > 0 && !roles.includes(user.role)) {
        throw new AppError("Not authorized - Insufficient permissions", 403);
      }

      // 7. Attach user to request
      req.user = user;
      next();
    } catch (error) {
      console.error("Authentication error:", error.message);
      if (error.name === "TokenExpiredError") {
        throw new AppError("Session expired. Please log in again.", 401);
      } else if (error.name === "JsonWebTokenError") {
        throw new AppError("Invalid authentication token", 401);
      }
      next(error);
    }
  });
};

/**
 * Middleware to check if profile is complete
 */
const checkProfileComplete = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select("profileCompleted");

  if (!user.profileCompleted) {
    throw new AppError(
      "Please complete your profile before accessing this resource",
      403
    );
  }

  next();
});

/**
 * Role-specific middleware shortcuts
 */
const requirePatient = authenticate(["patient"]);
const requireClinician = authenticate(["clinician"]);
const requireAdmin = authenticate(["admin"]);

export {
  authenticate,
  checkProfileComplete,
  requirePatient,
  requireClinician,
  requireAdmin,
};
