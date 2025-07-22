import User, { AuditLog } from "../models/User.model.js";
import Session from "../models/session.model.js";
import { successResponse } from "../utils/responseHandler.js";
import { AppError } from "../utils/errorHandler.js";
import winston from "winston";

// Configure Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/user.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

/**
 * @desc    Get current user's profile
 * @route   GET /api/users/profile
 * @access  Private
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select(
        "-password -refreshToken -emailVerificationToken -emailVerificationExpires -passwordResetToken -passwordResetExpires -twoFactorSecret"
      )
      .lean();

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Create audit log for profile retrieval
    await AuditLog.create({
      userId: user._id,
      action: "profile_retrieved",
      details: { email: user.email },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for profile retrieval", {
      userId: user._id,
    });

    logger.info("User profile retrieved", { userId: user._id });
    return successResponse(res, { user }, "Profile retrieved successfully");
  } catch (error) {
    logger.error("Failed to retrieve user profile", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Update current user's profile
 * @route   PUT /api/users/profile
 * @access  Private
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const updateUserProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, phoneNumber, dateOfBirth } = req.body;

    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .select(
        "-password -refreshToken -emailVerificationToken -emailVerificationExpires -passwordResetToken -passwordResetExpires -twoFactorSecret"
      )
      .lean();

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Create audit log for profile update
    await AuditLog.create({
      userId: user._id,
      action: "profile_updated",
      details: { email: user.email, updatedFields: Object.keys(updateData) },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for profile update", { userId: user._id });

    logger.info("User profile updated", { userId: user._id });
    return successResponse(res, { user }, "Profile updated successfully");
  } catch (error) {
    logger.error("Failed to update user profile", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Delete current user's account and sessions
 * @route   DELETE /api/users/profile
 * @access  Private
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const deleteUserAccount = async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.user._id);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Delete all sessions for this user
    await Session.deleteMany({ userId: req.user._id });

    // Create audit log for account deletion
    await AuditLog.create({
      userId: user._id,
      action: "account_deleted",
      details: { email: user.email },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for account deletion", { userId: user._id });

    logger.info("User account deleted", { userId: req.user._id });
    return successResponse(res, null, "Account deleted successfully");
  } catch (error) {
    logger.error("Failed to delete user account", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Get all users (admin only)
 * @route   GET /api/users
 * @access  Private (admin)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find()
      .select(
        "-password -refreshToken -emailVerificationToken -emailVerificationExpires -passwordResetToken -passwordResetExpires -twoFactorSecret"
      )
      .lean();

    // Create audit log for retrieving all users
    await AuditLog.create({
      userId: req.user._id,
      action: "users_retrieved",
      details: { userCount: users.length },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for retrieving all users", {
      userId: req.user._id,
    });

    logger.info("All users retrieved", {
      userId: req.user._id,
      userCount: users.length,
    });
    return successResponse(res, { users }, "Users retrieved successfully");
  } catch (error) {
    logger.error("Failed to retrieve all users", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Get active sessions for current user
 * @route   GET /api/users/sessions
 * @access  Private
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getUserSessions = async (req, res, next) => {
  try {
    const sessions = await Session.find({ userId: req.user._id })
      .select("-refreshToken")
      .lean();

    // Create audit log for session retrieval
    await AuditLog.create({
      userId: req.user._id,
      action: "sessions_retrieved",
      details: { sessionCount: sessions.length },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for session retrieval", {
      userId: req.user._id,
    });

    logger.info("User sessions retrieved", {
      userId: req.user._id,
      sessionCount: sessions.length,
    });
    return successResponse(
      res,
      { sessions },
      "Sessions retrieved successfully"
    );
  } catch (error) {
    logger.error("Failed to retrieve user sessions", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Revoke a session
 * @route   DELETE /api/users/sessions/:sessionId
 * @access  Private
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const revokeSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOneAndDelete({
      _id: sessionId,
      userId: req.user._id,
    });

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    // Create audit log for session revocation
    await AuditLog.create({
      userId: req.user._id,
      action: "session_revoked",
      details: { sessionId, email: req.user.email },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for session revocation", {
      userId: req.user._id,
      sessionId,
    });

    logger.info("Session revoked", { userId: req.user._id, sessionId });
    return successResponse(res, null, "Session revoked successfully");
  } catch (error) {
    logger.error("Failed to revoke session", {
      userId: req.user._id,
      sessionId: req.params.sessionId,
      error: error.message,
    });
    next(error);
  }
};

export {
  getUserProfile,
  updateUserProfile,
  deleteUserAccount,
  getAllUsers,
  getUserSessions,
  revokeSession,
};
