import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * Authentication middleware that verifies JWT token and attaches user to request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const authenticate = async (req, res, next) => {
  try {
    // 1. Get token from header or cookies
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "You are not logged in. Please log in to get access.",
      });
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Check if user still exists
    const currentUser = await User.findById(decoded._id).select("+tokens");
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        error: "The user belonging to this token no longer exists.",
      });
    }

    // 4. Check if user changed password after token was issued
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        success: false,
        error: "User recently changed password. Please log in again.",
      });
    }

    // 5. Check if token exists in user's tokens array (for active sessions)
    const tokenExists = currentUser.tokens.some((t) => t.token === token);
    if (!tokenExists) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired token. Please log in again.",
      });
    }

    // 6. Check if user is verified
    if (!currentUser.isVerified && currentUser.role !== "patient") {
      return res.status(403).json({
        success: false,
        error: "Please verify your email before accessing this resource.",
      });
    }

    // Grant access to protected route
    req.user = currentUser;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        error: "Invalid token. Please log in again.",
      });
    }
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Your token has expired. Please log in again.",
      });
    }

    console.error("Authentication error:", err);
    res.status(500).json({
      success: false,
      error: "Something went wrong during authentication",
    });
  }
};

/**
 * Role-based authorization middleware
 * @param {...String} roles - Allowed roles for the route
 * @returns {Function} Express middleware function
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    try {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: `Access denied. Requires one of these roles: ${roles.join(
            ", "
          )}`,
          yourRole: req.user.role,
        });
      }
      next();
    } catch (err) {
      console.error("Authorization error:", err);
      res.status(500).json({
        success: false,
        error: "Authorization check failed",
      });
    }
  };
};

/**
 * Middleware to check if user is the owner of the resource or has admin privileges
 * @param {String} resourceUserId - ID of the resource owner
 */
export const authorizeOwnerOrAdmin = (resourceUserId) => {
  return (req, res, next) => {
    try {
      if (req.user.role !== "admin" && req.user.id !== resourceUserId) {
        return res.status(403).json({
          success: false,
          error: "Access denied. You are not the owner of this resource",
        });
      }
      next();
    } catch (err) {
      console.error("Ownership authorization error:", err);
      res.status(500).json({
        success: false,
        error: "Ownership verification failed",
      });
    }
  };
};
