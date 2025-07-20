import User from "../models/User.model.js";
import {
  generateAccessToken,
  generateRefreshToken,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  verifyToken,
} from "../services/token.service.js";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../services/email.service.js";
import { successResponse, errorResponse } from "../utils/responseHandler.js";
import { AppError } from "../utils/errorHandler.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
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
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError("Email already in use", 409);
    }

    // Create verification token
    const emailVerificationToken = generateEmailVerificationToken();
    const emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Create new user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth,
      role,
      emailVerificationToken: crypto
        .createHash("sha256")
        .update(emailVerificationToken)
        .digest("hex"),
      emailVerificationExpires,
    });

    // Send verification email
    await sendVerificationEmail(email, emailVerificationToken);

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save();

    // Remove sensitive data before sending response
    user.password = undefined;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    user.refreshToken = undefined;

    return successResponse(
      res,
      {
        user,
        tokens: {
          accessToken,
          refreshToken,
        },
      },
      "Registration successful. Please check your email to verify your account.",
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify email address
 * @route   GET /api/auth/verify-email/:token
 * @access  Public
 */

/**
 * @desc    Verify email address
 * @route   GET /api/auth/verify-email/:token
 * @access  Public
 */
// In your verifyEmail controller
const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      // Check if user is already verified
      const alreadyVerified = await User.findOne({
        emailVerificationToken: hashedToken,
      });

      if (alreadyVerified?.emailVerified) {
        return res.status(200).json({
          message: "Email already verified",
          verified: true,
          user: {
            id: alreadyVerified._id,
            email: alreadyVerified.email,
          },
        });
      }

      return res.status(400).json({
        message: "Invalid or expired token",
        verified: false,
      });
    }

    // Mark as verified
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save();

    return res.status(200).json({
      message: "Email verified successfully",
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      tokens: { accessToken, refreshToken },
      verified: true,
    });
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email }).select(
      "+password +refreshToken"
    );
    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError("Invalid credentials", 401);
    }

    // Check if email is verified
    if (!user.emailVerified) {
      // Generate new tokens but don't allow full access
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken();

      // Save refresh token and update last login
      user.refreshToken = refreshToken;
      user.lastLogin = new Date();
      await user.save();

      // Remove sensitive data before sending response
      user.password = undefined;
      user.refreshToken = undefined;

      return successResponse(
        res,
        {
          user,
          tokens: {
            accessToken,
            refreshToken,
          },
        },
        "Please verify your email to continue",
        403
      );
    }

    // Check if account is active
    if (user.status !== "active") {
      throw new AppError(
        `Account is ${user.status}. Please verify your email.`,
        403
      );
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    // Save refresh token and update last login
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    // Remove sensitive data before sending response
    user.password = undefined;
    user.refreshToken = undefined;

    return successResponse(
      res,
      {
        user,
        tokens: {
          accessToken,
          refreshToken,
        },
      },
      "Login successful"
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh-token
 * @access  Private (requires refresh token)
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    // Find user by refresh token
    const user = await User.findOne({ refreshToken });
    if (!user) {
      throw new AppError("Invalid refresh token", 401);
    }

    // Verify refresh token
    try {
      verifyToken(refreshToken);
    } catch (error) {
      throw new AppError("Invalid refresh token", 401);
    }

    // Generate new access token
    const accessToken = generateAccessToken(user);

    return successResponse(
      res,
      {
        accessToken,
      },
      "Token refreshed successfully"
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Forgot password - Send reset email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Generate reset token
    const resetToken = generatePasswordResetToken();
    const passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour

    // Save hashed token to user
    user.passwordResetToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    user.passwordResetExpires = passwordResetExpires;
    await user.save();

    // Send reset email
    await sendPasswordResetEmail(email, resetToken);

    return successResponse(res, null, "Password reset email sent");
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Hash the token
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find user by token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw new AppError("Invalid or expired reset token", 400);
    }

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return successResponse(res, null, "Password reset successful");
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = async (req, res, next) => {
  try {
    // Remove refresh token
    await User.findByIdAndUpdate(req.user.id, {
      refreshToken: undefined,
    });

    return successResponse(res, null, "Logout successful");
  } catch (error) {
    next(error);
  }
};

const resendVerificationEmail = async (req, res, next) => {
  try {
    // Extract user from request (already verified by auth middleware)
    const user = req.user;

    // Check if email is already verified
    if (user.emailVerified) {
      return successResponse(res, null, "Email already verified");
    }

    // Generate new verification token
    const emailVerificationToken = generateEmailVerificationToken();

    // Update user with new token and expiration
    user.emailVerificationToken = crypto
      .createHash("sha256")
      .update(emailVerificationToken)
      .digest("hex");
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();

    // Send verification email to the user's email
    await sendVerificationEmail(user.email, emailVerificationToken);

    return successResponse(res, null, "Verification email resent successfully");
  } catch (error) {
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
};
