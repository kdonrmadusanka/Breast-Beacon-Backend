import jwt from "jsonwebtoken";
import crypto from "crypto";
import { AppError } from "../utils/errorHandler.js";

/**
 * Generate JWT access token
 * @param {Object} user - User object
 * @returns {String} JWT token
 */
const generateAccessToken = (user) => {
  try {
    return jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
  } catch (error) {
    throw new AppError("Failed to generate access token", 500);
  }
};

/**
 * Generate refresh token (random string)
 * @returns {String} Refresh token
 */
const generateRefreshToken = () => {
  try {
    return crypto.randomBytes(64).toString("hex");
  } catch (error) {
    throw new AppError("Failed to generate refresh token", 500);
  }
};

/**
 * Generate email verification token (random string)
 * @returns {Object} {token, expires}
 */
const generateEmailVerificationToken = () => {
  try {
    const token = crypto.randomBytes(32).toString("hex");
    return token;
  } catch (error) {
    throw new AppError("Failed to generate verification token", 500);
  }
};

/**
 * Generate password reset token (random string)
 * @returns {Object} {token, expires}
 */
const generatePasswordResetToken = () => {
  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = Date.now() + 60 * 60 * 1000; // 1 hour
    return { token, expires };
  } catch (error) {
    throw new AppError("Failed to generate reset token", 500);
  }
};

/**
 * Verify JWT token
 * @param {String} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new AppError("Token expired", 401);
    }
    if (error.name === "JsonWebTokenError") {
      throw new AppError("Invalid token", 401);
    }
    throw new AppError("Token verification failed", 500);
  }
};

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @returns {Object} {accessToken, refreshToken}
 */
const generateAuthTokens = (user) => {
  try {
    return {
      accessToken: generateAccessToken(user),
      refreshToken: generateRefreshToken(),
    };
  } catch (error) {
    throw new AppError("Failed to generate authentication tokens", 500);
  }
};

export {
  generateAccessToken,
  generateRefreshToken,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  verifyToken,
  generateAuthTokens,
};
