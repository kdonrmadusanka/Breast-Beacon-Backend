import jwt from "jsonwebtoken";
import winston from "winston";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, existsSync } from "fs";
import { AppError } from "../utils/errorHandler.js";
import User from "../models/User.model.js";
import { verifyToken } from "../services/token.service.js";

// Create logs directory if it doesn't exist
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logsDir = join(__dirname, "../logs");

if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.AUTH_LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: join(logsDir, "auth-error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: join(logsDir, "auth-combined.log"),
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ level, message, timestamp, stack }) =>
            `${timestamp} ${level}: ${message}${stack ? `\n${stack}` : ""}`
        )
      ),
    }),
  ],
});

/**
 * Authentication middleware
 * @param {string[]} [requiredRoles=[]] - Array of required roles for the route
 * @param {Object} [options={}] - Additional options
 * @param {boolean} [options.allowPending=false] - Allow pending users
 * @param {boolean} [options.skipEmailVerification=false] - Skip email verification
 * @param {boolean} [options.requireRefreshToken=false] - Require refresh token validation
 * @returns {Function} Express middleware
 */
export const authenticate = (requiredRoles = [], options = {}) => {
  return async (req, res, next) => {
    try {
      // Token extraction from multiple sources
      const tokenSources = [
        () =>
          req.headers.authorization?.startsWith("Bearer ")
            ? req.headers.authorization.split(" ")[1]
            : null,
        () => req.cookies?.accessToken,
        () => req.query?.token,
        () => req.signedCookies?.accessToken,
      ];

      const token = tokenSources.reduce(
        (foundToken, source) => foundToken || source(),
        null
      );

      if (!token) {
        throw new AppError("Authentication token required", 401, {
          authMethod: "Bearer Token or Cookie",
          attemptedAccess: req.originalUrl,
        });
      }

      // Verify token with additional security checks
      const decoded = verifyToken(token);
      if (!decoded?.id) {
        throw new AppError("Invalid token payload", 401);
      }

      // Find user with additional security considerations
      const user = await User.findById(decoded.id)
        .select("+refreshToken +lastPasswordChange")
        .lean({ virtuals: true });

      if (!user) {
        throw new AppError("User not found or account deleted", 401);
      }

      // Check if token was issued before password change
      if (decoded.iat && user.lastPasswordChange) {
        const passwordChangedAt = Math.floor(
          user.lastPasswordChange.getTime() / 1000
        );
        if (decoded.iat < passwordChangedAt) {
          throw new AppError("Token expired due to password change", 401);
        }
      }

      // Check email verification if required
      if (!options.skipEmailVerification && !user.emailVerified) {
        throw new AppError("Email verification required", 403, {
          userId: user._id,
          email: user.email,
        });
      }

      // Check user status with more detailed error
      if (!options.allowPending && user.status !== "active") {
        throw new AppError(`Account is ${user.status}`, 403, {
          currentStatus: user.status,
          requiredStatus: "active",
        });
      }

      // Role-based access control with detailed logging
      if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
        logger.warn("Unauthorized role attempt", {
          userId: user._id,
          userRole: user.role,
          requiredRoles,
          attemptedEndpoint: req.originalUrl,
        });
        throw new AppError("Insufficient permissions", 403, {
          requiredRoles,
          userRole: user.role,
        });
      }

      // Refresh token validation if required
      if (options.requireRefreshToken && !user.refreshToken) {
        throw new AppError("Refresh token required", 401);
      }

      // Attach minimal user information to request
      req.user = {
        _id: user._id,
        email: user.email,
        role: user.role,
        status: user.status,
        ...(options.requireRefreshToken && { refreshToken: user.refreshToken }),
      };

      // Detailed success logging
      logger.info("Authentication successful", {
        userId: user._id,
        email: user.email,
        role: user.role,
        status: user.status,
        request: {
          method: req.method,
          url: req.originalUrl,
          ip: req.ip,
        },
        authType: options.requireRefreshToken
          ? "Refresh Token"
          : "Access Token",
      });

      next();
    } catch (error) {
      // Enhanced error logging
      logger.error("Authentication failed", {
        error: {
          message: error.message,
          stack: error.stack,
          ...(error.details && { details: error.details }),
        },
        request: {
          method: req.method,
          url: req.originalUrl,
          ip: req.ip,
          headers: {
            "user-agent": req.headers["user-agent"],
            origin: req.headers.origin,
          },
        },
        timestamp: new Date().toISOString(),
      });

      next(error);
    }
  };
};

/**
 * Set authentication token in secure cookie
 * @param {Object} res - Express response object
 * @param {string} token - JWT access token
 * @param {Object} [options={}] - Cookie options
 * @returns {void}
 */
export const setAuthCookie = (res, token, options = {}) => {
  const defaultOptions = {
    maxAge: process.env.JWT_COOKIE_EXPIRES_IN
      ? parseInt(process.env.JWT_COOKIE_EXPIRES_IN)
      : 7 * 24 * 60 * 60 * 1000, // 7 days default
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
    domain: process.env.COOKIE_DOMAIN || undefined,
    signed: true,
  };

  const cookieOptions = { ...defaultOptions, ...options };

  res.cookie("accessToken", token, cookieOptions);

  logger.info("Authentication cookie set", {
    options: {
      ...cookieOptions,
      domain: cookieOptions.domain || "default",
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
    },
    timestamp: new Date().toISOString(),
  });
};

/**
 * Clear authentication cookie
 * @param {Object} res - Express response object
 * @returns {void}
 */
export const clearAuthCookie = (res) => {
  res.clearCookie("accessToken", {
    path: "/",
    domain: process.env.COOKIE_DOMAIN || undefined,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  logger.info("Authentication cookie cleared", {
    timestamp: new Date().toISOString(),
  });
};
