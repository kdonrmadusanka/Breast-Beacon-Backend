import mongoose from "mongoose";
import bcrypt from "bcryptjs";
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
 * @desc Audit log schema for tracking user actions
 */
const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    action: {
      type: String,
      required: [true, "Action is required"],
      enum: [
        "user_created",
        "password_updated",
        "2fa_enabled",
        "2fa_disabled",
        "2fa_verified",
        "email_verified",
        "profile_updated",
        "account_deleted",
        "login",
        "logout",
        "password_reset_requested",
        "email_verification_resent",
      ],
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    deviceInfo: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * @desc User schema for MongoDB
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/,
        "Please provide a valid email address",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    phoneNumber: {
      type: String,
      trim: true,
      match: [/^\+?[\d\s-]{10,}$/, "Please provide a valid phone number"],
    },
    dateOfBirth: {
      type: Date,
      required: [true, "Date of birth is required"],
    },
    role: {
      type: String,
      enum: ["patient", "clinician", "admin"],
      default: "patient",
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    status: {
      type: String,
      enum: ["pending", "active", "suspended"],
      default: "pending",
    },
    lastLogin: {
      type: Date,
    },
    twoFactorSecret: {
      type: String,
      select: false,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpires;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.refreshToken;
        delete ret.twoFactorSecret;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Hash password before saving - REMOVED AUDIT LOG CREATION FROM HERE
userSchema.pre("save", async function (next) {
  try {
    // Only hash the password if it's been modified
    if (this.isModified("password")) {
      this.password = await bcrypt.hash(this.password, 10);
    }

    // DO NOT hash twoFactorSecret - it needs to be stored as plain text for TOTP verification
    // The secret from speakeasy is already encoded properly

    next();
  } catch (error) {
    logger.error("Failed to process user save", {
      userId: this._id,
      error: error.message,
    });
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove the compareTwoFactorSecret method since we're not hashing the 2FA secret anymore

const User = mongoose.model("User", userSchema);
const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default User;
export { AuditLog };
