import User, { AuditLog } from "../models/User.model.js";
import Session from "../models/session.model.js";
import {
  generateAuthTokens,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  verifyToken,
  isTokenBlacklisted,
  blacklistToken,
} from "../services/token.service.js";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangeNotification,
} from "../services/email.service.js";
import { successResponse, errorResponse } from "../utils/responseHandler.js";
import { AppError } from "../utils/errorHandler.js";
import { setAuthCookie } from "../middlewares/auth.middleware.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import speakeasy from "speakeasy";
import winston from "../middlewares/node_modules/winston/index.js";

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

/**
 * @desc    Register a new user, set auth cookie, and create session
 * @route   POST /api/auth/register
 * @access  Public
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const register = async (req, res, next) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth,
      role = "patient",
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      if (existingUser.emailVerified) {
        throw new AppError("Email already in use and verified", 409);
      }

      // Update verification token for unverified user
      const emailVerificationToken = generateEmailVerificationToken();
      const hashedToken = crypto
        .createHash("sha256")
        .update(emailVerificationToken)
        .digest("hex");
      const tokens = generateAuthTokens(existingUser);

      await User.updateOne(
        { email },
        {
          emailVerificationToken: hashedToken,
          emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
          refreshToken: tokens.refreshToken,
        }
      );

      // Create session
      await Session.create({
        userId: existingUser._id,
        refreshToken: tokens.refreshToken,
        deviceInfo: req.headers["user-agent"] || "Unknown",
        ipAddress: req.ip,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      await sendVerificationEmail(email, emailVerificationToken);

      // Fetch updated user without sensitive data
      const updatedUser = await User.findOne({ email })
        .select(
          "-password -emailVerificationToken -emailVerificationExpires -refreshToken -twoFactorSecret"
        )
        .lean();

      setAuthCookie(res, tokens.accessToken);
      return successResponse(
        res,
        { user: updatedUser, tokens },
        "Account exists but not verified. New verification email sent.",
        200
      );
    }

    // Create new user
    const emailVerificationToken = generateEmailVerificationToken();
    const hashedToken = crypto
      .createHash("sha256")
      .update(emailVerificationToken)
      .digest("hex");

    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth,
      role,
      emailVerificationToken: hashedToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
    });

    const tokens = generateAuthTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Create session
    await Session.create({
      userId: user._id,
      refreshToken: tokens.refreshToken,
      deviceInfo: req.headers["user-agent"] || "Unknown",
      ipAddress: req.ip,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    await sendVerificationEmail(email, emailVerificationToken);

    // Remove sensitive data
    const userResponse = await User.findById(user._id)
      .select(
        "-password -emailVerificationToken -emailVerificationExpires -refreshToken -twoFactorSecret"
      )
      .lean();

    setAuthCookie(res, tokens.accessToken);
    return successResponse(
      res,
      { user: userResponse, tokens },
      "Registration successful. Please check your email to verify your account.",
      201
    );
  } catch (error) {
    logger.error("Registration failed", {
      email: req.body.email,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Verify email address, set auth cookie, and update session
 * @route   GET /api/auth/verify-email/:token
 * @access  Public
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token) throw new AppError("Token is required", 400);

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      const alreadyVerified = await User.findOne({
        emailVerificationToken: hashedToken,
      }).lean();
      if (alreadyVerified?.emailVerified) {
        return successResponse(
          res,
          { user: { id: alreadyVerified._id, email: alreadyVerified.email } },
          "Email already verified",
          200
        );
      }
      throw new AppError("Invalid or expired token", 400);
    }

    user.status = "active";
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    const tokens = generateAuthTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Update or create session
    await Session.findOneAndUpdate(
      { userId: user._id, refreshToken: user.refreshToken },
      {
        refreshToken: tokens.refreshToken,
        deviceInfo: req.headers["user-agent"] || "Unknown",
        ipAddress: req.ip,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        lastActive: Date.now(),
      },
      { upsert: true }
    );

    // Create audit log for email verification
    await AuditLog.create({
      userId: user._id,
      action: "email_verified",
      details: { email: user.email },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for email verification", {
      userId: user._id,
    });

    const userResponse = await User.findById(user._id)
      .select(
        "-password -emailVerificationToken -emailVerificationExpires -refreshToken -twoFactorSecret"
      )
      .lean();

    setAuthCookie(res, tokens.accessToken);
    return successResponse(
      res,
      { user: userResponse, tokens, verified: true },
      "Email verified successfully",
      200
    );
  } catch (error) {
    logger.error("Email verification failed", {
      token: req.params.token,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Login user, verify 2FA if enabled, set auth cookie, and create session
 * @route   POST /api/auth/login
 * @access  Public
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const login = async (req, res, next) => {
  try {
    const { email, password, twoFactorCode } = req.body;

    const user = await User.findOne({ email }).select(
      "+password +refreshToken +twoFactorSecret +twoFactorEnabled"
    );
    if (!user || !(await user.comparePassword(password))) {
      throw new AppError("Invalid credentials", 401);
    }

    // Verify 2FA if enabled
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        throw new AppError("Two-factor authentication code required", 401);
      }
      const isValidCode = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: twoFactorCode,
        window: 1,
      });
      if (!isValidCode) {
        throw new AppError("Invalid two-factor authentication code", 401);
      }
    }

    const tokens = generateAuthTokens(user);
    user.refreshToken = tokens.refreshToken;
    user.lastLogin = new Date();
    await user.save();

    // Create session
    await Session.create({
      userId: user._id,
      refreshToken: tokens.refreshToken,
      deviceInfo: req.headers["user-agent"] || "Unknown",
      ipAddress: req.ip,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    // Create audit log for login
    await AuditLog.create({
      userId: user._id,
      action: "login",
      details: { email: user.email, twoFactorUsed: user.twoFactorEnabled },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for login", { userId: user._id });

    const userResponse = await User.findById(user._id)
      .select("-password -refreshToken -twoFactorSecret")
      .lean();

    setAuthCookie(res, tokens.accessToken);
    return successResponse(
      res,
      { user: userResponse, tokens },
      user.emailVerified
        ? "Login successful"
        : "Please verify your email to continue",
      user.emailVerified ? 200 : 403
    );
  } catch (error) {
    logger.error("Login failed", {
      email: req.body.email,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Refresh access token, set auth cookie, and update session
 * @route   POST /api/auth/refresh-token
 * @access  Private (requires refresh token)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError("Refresh token is required", 400);

    // Check if token is blacklisted
    if (await isTokenBlacklisted(refreshToken)) {
      throw new AppError("Refresh token is blacklisted", 401);
    }

    const user = await User.findOne({ refreshToken }).lean();
    if (!user) {
      throw new AppError("Invalid refresh token", 401);
    }

    try {
      verifyToken(refreshToken);
    } catch (error) {
      throw new AppError("Invalid refresh token", 401);
    }

    const tokens = generateAuthTokens(user);
    await User.updateOne(
      { _id: user._id },
      { refreshToken: tokens.refreshToken }
    );

    // Update session
    await Session.findOneAndUpdate(
      { userId: user._id, refreshToken },
      {
        refreshToken: tokens.refreshToken,
        deviceInfo: req.headers["user-agent"] || "Unknown",
        ipAddress: req.ip,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        lastActive: Date.now(),
      },
      { upsert: true }
    );

    setAuthCookie(res, tokens.accessToken);
    return successResponse(
      res,
      { accessToken: tokens.accessToken },
      "Token refreshed successfully"
    );
  } catch (error) {
    logger.error("Token refresh failed", { error: error.message });
    next(error);
  }
};

/**
 * @desc    Forgot password - Send reset email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email }).lean();
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const { token, expires } = generatePasswordResetToken();
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    await User.updateOne(
      { email },
      {
        passwordResetToken: hashedToken,
        passwordResetExpires: expires,
      }
    );

    await sendPasswordResetEmail(email, token);

    // Create audit log for password reset request
    await AuditLog.create({
      userId: user._id,
      action: "password_reset_requested",
      details: { email: user.email },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for password reset request", {
      userId: user._id,
    });

    return successResponse(res, null, "Password reset email sent");
  } catch (error) {
    logger.error("Forgot password failed", {
      email: req.body.email,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Reset password with optional 2FA verification
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password, twoFactorCode } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select("+twoFactorSecret +twoFactorEnabled");

    if (!user) {
      throw new AppError("Invalid or expired reset token", 400);
    }

    // Verify 2FA if enabled
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        throw new AppError("Two-factor authentication code required", 401);
      }
      const isValidCode = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: twoFactorCode,
        window: 1,
      });
      if (!isValidCode) {
        throw new AppError("Invalid two-factor authentication code", 401);
      }
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    await sendPasswordChangeNotification(user.email);

    // Create audit log for password reset
    await AuditLog.create({
      userId: user._id,
      action: "password_updated",
      details: { email: user.email, twoFactorUsed: user.twoFactorEnabled },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for password reset", { userId: user._id });

    return successResponse(res, null, "Password reset successful");
  } catch (error) {
    logger.error("Password reset failed", {
      token: req.params.token,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Logout user, clear auth cookie, and remove session
 * @route   POST /api/auth/logout
 * @access  Private
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const logout = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("+refreshToken");
    if (user.refreshToken) {
      // Blacklist the refresh token for 7 days
      await blacklistToken(
        user.refreshToken,
        Date.now() + 7 * 24 * 60 * 60 * 1000
      );
      // Remove all sessions for this user
      await Session.deleteMany({ userId: user._id });
    }
    await User.updateOne({ _id: user._id }, { refreshToken: undefined });

    // Create audit log for logout
    await AuditLog.create({
      userId: user._id,
      action: "logout",
      details: { email: user.email },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for logout", { userId: user._id });

    // Clear auth cookie
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    return successResponse(res, null, "Logout successful");
  } catch (error) {
    logger.error("Logout failed", {
      userId: req.user.id,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Resend verification email
 * @route   POST /api/auth/resend-verification
 * @access  Private
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const resendVerificationEmail = async (req, res, next) => {
  try {
    const user = req.user;
    if (user.emailVerified) {
      return successResponse(res, null, "Email already verified");
    }

    const emailVerificationToken = generateEmailVerificationToken();
    const hashedToken = crypto
      .createHash("sha256")
      .update(emailVerificationToken)
      .digest("hex");

    await User.updateOne(
      { _id: user._id },
      {
        emailVerificationToken: hashedToken,
        emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
      }
    );

    await sendVerificationEmail(user.email, emailVerificationToken);

    // Create audit log for resend verification
    await AuditLog.create({
      userId: user._id,
      action: "email_verification_resent",
      details: { email: user.email },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for resend verification", {
      userId: user._id,
    });

    return successResponse(res, null, "Verification email resent successfully");
  } catch (error) {
    logger.error("Resend verification failed", {
      userId: req.user.id,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Setup 2FA for user and return QR code URL
 * @route   POST /api/auth/setup-2fa
 * @access  Private
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const setupTwoFactor = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      "+twoFactorSecret +twoFactorEnabled"
    );
    if (user.twoFactorEnabled && user.twoFactorVerified) {
      throw new AppError("Two-factor authentication already enabled", 400);
    }

    // Generate 2FA secret
    const secret = speakeasy.generateSecret({
      length: 32,
      name: `Breast Beacon (${user.email})`,
    });

    user.twoFactorSecret = secret.base32;
    user.twoFactorEnabled = true;
    user.twoFactorVerified = false; // Requires verification
    await user.save();

    // Create audit log for 2FA setup
    await AuditLog.create({
      userId: user._id,
      action: "2fa_enabled",
      details: { email: user.email },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for 2FA setup", { userId: user._id });

    return successResponse(
      res,
      { qrCodeUrl: secret.otpauth_url },
      "Two-factor authentication setup initiated. Scan the QR code with your authenticator app."
    );
  } catch (error) {
    logger.error("2FA setup failed", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Verify 2FA setup with TOTP code
 * @route   POST /api/auth/verify-2fa
 * @access  Private
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const verifyTwoFactor = async (req, res, next) => {
  try {
    const { twoFactorCode } = req.body;
    if (!twoFactorCode) {
      throw new AppError("Two-factor authentication code required", 400);
    }

    const user = await User.findById(req.user._id).select(
      "+twoFactorSecret +twoFactorEnabled +twoFactorVerified"
    );
    if (!user.twoFactorEnabled) {
      throw new AppError("Two-factor authentication not enabled", 400);
    }
    if (user.twoFactorVerified) {
      throw new AppError("Two-factor authentication already verified", 400);
    }

    const isValidCode = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: twoFactorCode,
      window: 1,
    });

    if (!isValidCode) {
      throw new AppError("Invalid two-factor authentication code", 401);
    }

    user.twoFactorVerified = true;
    await user.save();

    // Create audit log for 2FA verification
    await AuditLog.create({
      userId: user._id,
      action: "2fa_verified",
      details: { email: user.email },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for 2FA verification", { userId: user._id });

    return successResponse(
      res,
      null,
      "Two-factor authentication verified successfully"
    );
  } catch (error) {
    logger.error("2FA verification failed", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
};

export {
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
};
