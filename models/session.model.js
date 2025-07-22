import mongoose from "mongoose";
import crypto from "crypto";
import winston from "winston";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, existsSync } from "fs";

// Create logs directory if it doesn't exist
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logsDir = join(__dirname, "../logs");

if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.SESSION_LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: join(logsDir, "session-error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: join(logsDir, "session-combined.log"),
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
 * @desc Session schema for MongoDB
 * @typedef {Object} Session
 */
const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
      immutable: true,
    },
    refreshToken: {
      type: String,
      required: [true, "Refresh token is required"],
      select: false,
      immutable: true,
    },
    deviceInfo: {
      type: new mongoose.Schema(
        {
          os: { type: String, trim: true },
          browser: { type: String, trim: true },
          device: { type: String, trim: true },
          userAgent: { type: String, trim: true },
        },
        { _id: false }
      ),
      required: [true, "Device info is required"],
    },
    ipAddress: {
      type: String,
      required: [true, "IP address is required"],
      trim: true,
      validate: {
        validator: function (v) {
          // Simple IP validation (IPv4 or IPv6)
          return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(
            v
          );
        },
        message: (props) => `${props.value} is not a valid IP address!`,
      },
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiration date is required"],
      index: { expires: "7d" }, // TTL index for 7 days
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.refreshToken;
        delete ret.__v;
        delete ret._id;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Index for faster queries
sessionSchema.index({ userId: 1, expiresAt: 1 });
sessionSchema.index({ ipAddress: 1, deviceInfo: 1 });

// Hash refresh token before saving
sessionSchema.pre("save", async function (next) {
  if (!this.isModified("refreshToken")) return next();

  try {
    this.refreshToken = crypto
      .createHash("sha256")
      .update(this.refreshToken)
      .digest("hex");

    logger.info("Session token hashed", {
      userId: this.userId,
      action: "token_hash",
    });
    next();
  } catch (error) {
    logger.error("Token hashing failed", {
      userId: this.userId,
      error: error.message,
      stack: error.stack,
    });
    next(new Error("Failed to hash token"));
  }
});

// Log after session creation
sessionSchema.post("save", function (doc, next) {
  logger.info("Session created successfully", {
    sessionId: doc._id,
    userId: doc.userId,
    device: doc.deviceInfo,
    ip: doc.ipAddress,
    expiresAt: doc.expiresAt,
  });
  next();
});

// Method to compare refresh tokens
sessionSchema.methods.compareRefreshToken = async function (candidateToken) {
  try {
    const hashedToken = crypto
      .createHash("sha256")
      .update(candidateToken)
      .digest("hex");

    const isMatch = hashedToken === this.refreshToken;

    logger.debug("Refresh token comparison", {
      sessionId: this._id,
      userId: this.userId,
      isMatch,
      action: "token_compare",
    });

    return isMatch;
  } catch (error) {
    logger.error("Token comparison failed", {
      sessionId: this._id,
      userId: this.userId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

// Method to revoke session
sessionSchema.methods.revoke = async function () {
  try {
    this.isRevoked = true;
    await this.save();

    logger.info("Session revoked", {
      sessionId: this._id,
      userId: this.userId,
      action: "revoke",
    });

    return this;
  } catch (error) {
    logger.error("Failed to revoke session", {
      sessionId: this._id,
      userId: this.userId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

// Static method to clean expired sessions
sessionSchema.statics.cleanExpired = async function () {
  try {
    const result = await this.deleteMany({
      expiresAt: { $lt: new Date() },
    });

    logger.info("Expired sessions cleaned", {
      deletedCount: result.deletedCount,
      action: "cleanup",
    });

    return result;
  } catch (error) {
    logger.error("Failed to clean expired sessions", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

const Session = mongoose.model("Session", sessionSchema);

export default Session;
