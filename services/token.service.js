import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";
import { AppError } from "../utils/errorHandler.js";

// Schema for blacklisted tokens
const tokenBlacklistSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: "1d" } },
  },
  { timestamps: true }
);

const TokenBlacklist = mongoose.model("TokenBlacklist", tokenBlacklistSchema);

/**
 * Generate JWT access token
 * @param {Object} user - User object containing _id, email, role, and status
 * @returns {string} JWT access token
 * @throws {AppError} If token generation fails
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
    throw new AppError("Failed to generate access token", 500, {
      error: error.message,
    });
  }
};

/**
 * Generate refresh token
 * @returns {string} Refresh token
 * @throws {AppError} If token generation fails
 */
const generateRefreshToken = () => {
  try {
    return crypto.randomBytes(64).toString("hex");
  } catch (error) {
    throw new AppError("Failed to generate refresh token", 500, {
      error: error.message,
    });
  }
};

/**
 * Generate email verification token
 * @returns {string} Email verification token
 * @throws {AppError} If token generation fails
 */
const generateEmailVerificationToken = () => {
  try {
    return crypto.randomBytes(32).toString("hex");
  } catch (error) {
    throw new AppError("Failed to generate email verification token", 500, {
      error: error.message,
    });
  }
};

/**
 * Generate password reset token
 * @returns {Object} Object containing token and expiration time
 * @returns {string} token - Password reset token
 * @returns {number} expires - Expiration timestamp
 * @throws {AppError} If token generation fails
 */
const generatePasswordResetToken = () => {
  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = Date.now() + 60 * 60 * 1000; // 1 hour
    return { token, expires };
  } catch (error) {
    throw new AppError("Failed to generate password reset token", 500, {
      error: error.message,
    });
  }
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {AppError} If token verification fails
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new AppError("Token expired", 401, { error: error.message });
    }
    if (error.name === "JsonWebTokenError") {
      throw new AppError("Invalid token", 401, { error: error.message });
    }
    throw new AppError("Token verification failed", 500, {
      error: error.message,
    });
  }
};

/**
 * Blacklist a refresh token
 * @param {string} token - Refresh token to blacklist
 * @param {Date} expiresAt - Token expiration date
 * @returns {Promise<void>}
 * @throws {AppError} If blacklisting fails
 */
const blacklistToken = async (token, expiresAt) => {
  try {
    await TokenBlacklist.create({ token, expiresAt: new Date(expiresAt) });
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error
      return; // Token already blacklisted
    }
    throw new AppError("Failed to blacklist token", 500, {
      error: error.message,
    });
  }
};

/**
 * Check if a token is blacklisted
 * @param {string} token - Refresh token to check
 * @returns {Promise<boolean>} True if token is blacklisted, false otherwise
 * @throws {AppError} If query fails
 */
const isTokenBlacklisted = async (token) => {
  try {
    const blacklisted = await TokenBlacklist.findOne({ token });
    return !!blacklisted;
  } catch (error) {
    throw new AppError("Failed to check token blacklist", 500, {
      error: error.message,
    });
  }
};

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @returns {Object} Object containing accessToken and refreshToken
 * @throws {AppError} If token generation fails
 */
const generateAuthTokens = (user) => {
  try {
    return {
      accessToken: generateAccessToken(user),
      refreshToken: generateRefreshToken(),
    };
  } catch (error) {
    throw new AppError("Failed to generate authentication tokens", 500, {
      error: error.message,
    });
  }
};

export {
  generateAccessToken,
  generateRefreshToken,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  verifyToken,
  blacklistToken,
  isTokenBlacklisted,
  generateAuthTokens,
};
