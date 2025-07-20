import User from "../models/User.model.js";
import asyncHandler from "express-async-handler";
import { errorResponse } from "../utils/responseHandler.js";
import { AppError } from "../utils/errorHandler.js";

// @desc    Get current user profile
// @route   GET /api/users/me
// @access  Private
const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select(
    "-password -refreshToken"
  );

  if (!user) {
    return errorResponse(res, "User not found", 404);
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Update user profile
// @route   PUT /api/users/me
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user.id,
    {
      $set: {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phoneNumber: req.body.phoneNumber,
        dateOfBirth: req.body.dateOfBirth,
        profileCompleted: true,
      },
    },
    { new: true, runValidators: true }
  ).select("-password -refreshToken");

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    data: user,
  });
});

// @desc    Check profile completion status
// @route   GET /api/users/check-completion
// @access  Private
const checkProfileCompletion = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("profileCompleted");

  res.status(200).json({
    success: true,
    data: {
      completed: user.profileCompleted,
    },
  });
});

// @desc    Verify admin key
// @route   POST /api/users/verify-admin-key
// @access  Private/Admin
const verifyAdminKey = asyncHandler(async (req, res) => {
  const { adminKey } = req.body;

  if (adminKey !== process.env.ADMIN_KEY) {
    return errorResponse(res, "Invalid admin key", 401);
  }

  res.status(200).json({
    success: true,
    message: "Admin key verified",
  });
});

// @desc    Get role requirements
// @route   GET /api/users/role-requirements
// @access  Public
const getRoleRequirements = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      patient: ["basic profile completion"],
      clinician: ["medical license verification", "specialty certification"],
      admin: ["admin key verification"],
    },
  });
});

const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return errorResponse(res, "User not found", 404);
    }

    if (user.emailVerified) {
      return successResponse(res, null, "Email already verified");
    }

    // Generate new token
    const newToken = generateEmailVerificationToken();
    user.emailVerificationToken = crypto
      .createHash("sha256")
      .update(newToken)
      .digest("hex");
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();

    await sendVerificationEmail(email, newToken);

    return successResponse(res, null, "Verification email resent successfully");
  } catch (error) {
    next(error);
  }
};

export {
  getCurrentUser,
  updateProfile,
  checkProfileCompletion,
  verifyAdminKey,
  getRoleRequirements,
};
