import nodemailer from "nodemailer";
import Queue from "bull";
import { AuditLog } from "../models/User.model.js";
import winston from "winston";
import Redis from "ioredis";

// Configure Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/email.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Initialize Redis client to check connection
const redisClient = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Check Redis connection status
let isRedisConnected = false;
redisClient.on("connect", () => {
  isRedisConnected = true;
  logger.info("Redis connected successfully", {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
  });
});
redisClient.on("error", (error) => {
  isRedisConnected = false;
  logger.error("Redis connection failed", { error: error.message });
});

// Initialize email queue with Redis (if connected)
let emailQueue;
if (isRedisConnected) {
  try {
    emailQueue = new Queue("email-queue", {
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      },
    });
  } catch (error) {
    logger.error("Failed to initialize email queue", { error: error.message });
    isRedisConnected = false;
  }
}

// Configure Nodemailer transport
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.example.com",
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Email templates
const emailTemplates = {
  verification: (email, token) => ({
    from: `"Breast Beacon" <${process.env.EMAIL_FROM || "no-reply@breastbeacon.com"}>`,
    to: email,
    subject: "Verify Your Email Address",
    text: `Please verify your email by using the following token: ${token}`,
    html: `<p>Please verify your email by using the following token: <strong>${token}</strong></p>`,
  }),
  passwordReset: (email, token) => ({
    from: `"Breast Beacon" <${process.env.EMAIL_FROM || "no-reply@breastbeacon.com"}>`,
    to: email,
    subject: "Password Reset Request",
    text: `You requested a password reset. Use this token: ${token}. It expires in 1 hour.`,
    html: `<p>You requested a password reset. Use this token: <strong>${token}</strong>. It expires in 1 hour.</p>`,
  }),
  passwordChangeNotification: (email) => ({
    from: `"Breast Beacon" <${process.env.EMAIL_FROM || "no-reply@breastbeacon.com"}>`,
    to: email,
    subject: "Password Changed Successfully",
    text: "Your password has been changed successfully.",
    html: "<p>Your password has been changed successfully.</p>",
  }),
};

/**
 * @desc    Send email directly using Nodemailer (fallback if queue is unavailable)
 * @param {Object} mailOptions - Nodemailer mail options
 * @param {string} email - Recipient email address
 * @param {string} action - Audit log action type
 * @param {Object} [req] - Express request object for audit logging (optional)
 * @returns {Promise<void>}
 */
const sendEmailDirectly = async (mailOptions, email, action, req = null) => {
  try {
    await transporter.sendMail(mailOptions);
    logger.info(`${action} email sent directly`, {
      email,
      userId: req?.user?._id || "unknown",
    });

    // Create audit log for successful email send
    await AuditLog.create({
      userId: req?.user?._id || null,
      action: `${action}_sent`,
      details: { email, method: "direct" },
      ipAddress: req?.ip || "unknown",
      deviceInfo: req?.headers?.["user-agent"] || "Unknown",
    });
  } catch (error) {
    logger.error(`Failed to send ${action} email directly`, {
      email,
      error: error.message,
      userId: req?.user?._id || "unknown",
    });

    // Create audit log for failure
    await AuditLog.create({
      userId: req?.user?._id || null,
      action: `${action}_send_failed`,
      details: { email, error: error.message, method: "direct" },
      ipAddress: req?.ip || "unknown",
      deviceInfo: req?.headers?.["user-agent"] || "Unknown",
    });

    throw new Error(`Email send error: ${error.message}`);
  }
};

/**
 * @desc    Add email job to queue for verification email or send directly if queue is unavailable
 * @param {string} email - Recipient email address
 * @param {string} token - Email verification token
 * @param {Object} [req] - Express request object for audit logging (optional)
 * @returns {Promise<void>}
 */
const sendVerificationEmail = async (email, token, req = null) => {
  try {
    if (isRedisConnected && emailQueue) {
      const job = await emailQueue.add("send-verification-email", {
        email,
        token,
        userId: req?.user?._id || null,
        ipAddress: req?.ip || "unknown",
        deviceInfo: req?.headers?.["user-agent"] || "Unknown",
      });

      logger.info("Verification email job added to queue", {
        email,
        jobId: job.id,
        userId: req?.user?._id || "unknown",
      });

      // Create audit log for email queue addition
      await AuditLog.create({
        userId: req?.user?._id || null,
        action: "email_verification_queued",
        details: { email, jobId: job.id },
        ipAddress: req?.ip || "unknown",
        deviceInfo: req?.headers?.["user-agent"] || "Unknown",
      });
    } else {
      logger.warn("Redis unavailable, sending verification email directly", {
        email,
        userId: req?.user?._id || "unknown",
      });

      // Create audit log for Redis failure
      await AuditLog.create({
        userId: req?.user?._id || null,
        action: "email_verification_queue_failed",
        details: { email, error: "Redis unavailable" },
        ipAddress: req?.ip || "unknown",
        deviceInfo: req?.headers?.["user-agent"] || "Unknown",
      });

      // Send email directly
      const mailOptions = emailTemplates.verification(email, token);
      await sendEmailDirectly(mailOptions, email, "email_verification", req);
    }
  } catch (error) {
    logger.error("Failed to process verification email", {
      email,
      error: error.message,
      userId: req?.user?._id || "unknown",
    });

    // Create audit log for failure
    await AuditLog.create({
      userId: req?.user?._id || null,
      action: "email_verification_failed",
      details: { email, error: error.message },
      ipAddress: req?.ip || "unknown",
      deviceInfo: req?.headers?.["user-agent"] || "Unknown",
    });
  }
};

/**
 * @desc    Add email job to queue for password reset email or send directly if queue is unavailable
 * @param {string} email - Recipient email address
 * @param {string} token - Password reset token
 * @param {Object} [req] - Express request object for audit logging (optional)
 * @returns {Promise<void>}
 */
const sendPasswordResetEmail = async (email, token, req = null) => {
  try {
    if (isRedisConnected && emailQueue) {
      const job = await emailQueue.add("send-password-reset-email", {
        email,
        token,
        userId: req?.user?._id || null,
        ipAddress: req?.ip || "unknown",
        deviceInfo: req?.headers?.["user-agent"] || "Unknown",
      });

      logger.info("Password reset email job added to queue", {
        email,
        jobId: job.id,
        userId: req?.user?._id || "unknown",
      });

      // Create audit log for email queue addition
      await AuditLog.create({
        userId: req?.user?._id || null,
        action: "password_reset_email_queued",
        details: { email, jobId: job.id },
        ipAddress: req?.ip || "unknown",
        deviceInfo: req?.headers?.["user-agent"] || "Unknown",
      });
    } else {
      logger.warn("Redis unavailable, sending password reset email directly", {
        email,
        userId: req?.user?._id || "unknown",
      });

      // Create audit log for Redis failure
      await AuditLog.create({
        userId: req?.user?._id || null,
        action: "password_reset_email_queue_failed",
        details: { email, error: "Redis unavailable" },
        ipAddress: req?.ip || "unknown",
        deviceInfo: req?.headers?.["user-agent"] || "Unknown",
      });

      // Send email directly
      const mailOptions = emailTemplates.passwordReset(email, token);
      await sendEmailDirectly(mailOptions, email, "password_reset_email", req);
    }
  } catch (error) {
    logger.error("Failed to process password reset email", {
      email,
      error: error.message,
      userId: req?.user?._id || "unknown",
    });

    // Create audit log for failure
    await AuditLog.create({
      userId: req?.user?._id || null,
      action: "password_reset_email_failed",
      details: { email, error: error.message },
      ipAddress: req?.ip || "unknown",
      deviceInfo: req?.headers?.["user-agent"] || "Unknown",
    });
  }
};

/**
 * @desc    Add email job to queue for password change notification or send directly if queue is unavailable
 * @param {string} email - Recipient email address
 * @param {Object} [req] - Express request object for audit logging (optional)
 * @returns {Promise<void>}
 */
const sendPasswordChangeNotification = async (email, req = null) => {
  try {
    if (isRedisConnected && emailQueue) {
      const job = await emailQueue.add("send-password-change-notification", {
        email,
        userId: req?.user?._id || null,
        ipAddress: req?.ip || "unknown",
        deviceInfo: req?.headers?.["user-agent"] || "Unknown",
      });

      logger.info("Password change notification email job added to queue", {
        email,
        jobId: job.id,
        userId: req?.user?._id || "unknown",
      });

      // Create audit log for email queue addition
      await AuditLog.create({
        userId: req?.user?._id || null,
        action: "password_change_notification_queued",
        details: { email, jobId: job.id },
        ipAddress: req?.ip || "unknown",
        deviceInfo: req?.headers?.["user-agent"] || "Unknown",
      });
    } else {
      logger.warn(
        "Redis unavailable, sending password change notification email directly",
        {
          email,
          userId: req?.user?._id || "unknown",
        }
      );

      // Create audit log for Redis failure
      await AuditLog.create({
        userId: req?.user?._id || null,
        action: "password_change_notification_queue_failed",
        details: { email, error: "Redis unavailable" },
        ipAddress: req?.ip || "unknown",
        deviceInfo: req?.headers?.["user-agent"] || "Unknown",
      });

      // Send email directly
      const mailOptions = emailTemplates.passwordChangeNotification(email);
      await sendEmailDirectly(
        mailOptions,
        email,
        "password_change_notification",
        req
      );
    }
  } catch (error) {
    logger.error("Failed to process password change notification email", {
      email,
      error: error.message,
      userId: req?.user?._id || "unknown",
    });

    // Create audit log for failure
    await AuditLog.create({
      userId: req?.user?._id || null,
      action: "password_change_notification_failed",
      details: { email, error: error.message },
      ipAddress: req?.ip || "unknown",
      deviceInfo: req?.headers?.["user-agent"] || "Unknown",
    });
  }
};

// Process email queue jobs (if Redis is connected)
if (emailQueue) {
  emailQueue.process("send-verification-email", async (job) => {
    try {
      const { email, token, userId, ipAddress, deviceInfo } = job.data;
      const mailOptions = emailTemplates.verification(email, token);
      await transporter.sendMail(mailOptions);

      logger.info("Verification email sent", { email, jobId: job.id, userId });

      // Create audit log for successful email send
      await AuditLog.create({
        userId,
        action: "email_verification_sent",
        details: { email, jobId: job.id },
        ipAddress,
        deviceInfo,
      });
    } catch (error) {
      logger.error("Failed to send verification email", {
        email: job.data.email,
        jobId: job.id,
        userId: job.data.userId,
        error: error.message,
      });

      // Create audit log for failure
      await AuditLog.create({
        userId: job.data.userId,
        action: "email_verification_send_failed",
        details: { email: job.data.email, jobId: job.id, error: error.message },
        ipAddress: job.data.ipAddress,
        deviceInfo: job.data.deviceInfo,
      });

      throw new Error(`Email send error: ${error.message}`);
    }
  });

  emailQueue.process("send-password-reset-email", async (job) => {
    try {
      const { email, token, userId, ipAddress, deviceInfo } = job.data;
      const mailOptions = emailTemplates.passwordReset(email, token);
      await transporter.sendMail(mailOptions);

      logger.info("Password reset email sent", {
        email,
        jobId: job.id,
        userId,
      });

      // Create audit log for successful email send
      await AuditLog.create({
        userId,
        action: "password_reset_email_sent",
        details: { email, jobId: job.id },
        ipAddress,
        deviceInfo,
      });
    } catch (error) {
      logger.error("Failed to send password reset email", {
        email: job.data.email,
        jobId: job.id,
        userId: job.data.userId,
        error: error.message,
      });

      // Create audit log for failure
      await AuditLog.create({
        userId: job.data.userId,
        action: "password_reset_email_send_failed",
        details: { email: job.data.email, jobId: job.id, error: error.message },
        ipAddress: job.data.ipAddress,
        deviceInfo: job.data.deviceInfo,
      });

      throw new Error(`Email send error: ${error.message}`);
    }
  });

  emailQueue.process("send-password-change-notification", async (job) => {
    try {
      const { email, userId, ipAddress, deviceInfo } = job.data;
      const mailOptions = emailTemplates.passwordChangeNotification(email);
      await transporter.sendMail(mailOptions);

      logger.info("Password change notification email sent", {
        email,
        jobId: job.id,
        userId,
      });

      // Create audit log for successful email send
      await AuditLog.create({
        userId,
        action: "password_change_notification_sent",
        details: { email, jobId: job.id },
        ipAddress,
        deviceInfo,
      });
    } catch (error) {
      logger.error("Failed to send password change notification email", {
        email: job.data.email,
        jobId: job.id,
        userId: job.data.userId,
        error: error.message,
      });

      // Create audit log for failure
      await AuditLog.create({
        userId: job.data.userId,
        action: "password_change_notification_send_failed",
        details: { email: job.data.email, jobId: job.id, error: error.message },
        ipAddress: job.data.ipAddress,
        deviceInfo: job.data.deviceInfo,
      });

      throw new Error(`Email send error: ${error.message}`);
    }
  });

  // Handle queue errors
  emailQueue.on("error", (error) => {
    logger.error("Email queue error", { error: error.message });
  });

  // Handle failed jobs
  emailQueue.on("failed", async (job, error) => {
    logger.error("Email queue job failed", {
      jobId: job.id,
      email: job.data.email,
      userId: job.data.userId,
      error: error.message,
    });

    // Create audit log for job failure
    await AuditLog.create({
      userId: job.data.userId || null,
      action: `${job.name}_failed`,
      details: { email: job.data.email, jobId: job.id, error: error.message },
      ipAddress: job.data.ipAddress || "unknown",
      deviceInfo: job.data.deviceInfo || "Unknown",
    });
  });
}

export {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangeNotification,
};
