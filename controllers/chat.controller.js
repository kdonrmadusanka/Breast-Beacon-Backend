import { AuditLog } from "../models/User.model.js";
import Chat from "../models/Chat.model.js";
import User from "../models/User.model.js";
import { successResponse } from "../utils/responseHandler.js";
import { AppError } from "../utils/errorHandler.js";
import winston from "winston";
import pkg from "express-validator";
const { sanitize } = pkg;

// Configure Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/chat.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

/**
 * @desc    Initialize WebSocket for real-time chat
 * @param {Object} io - Socket.io instance
 */
const initializeChatSocket = (io) => {
  io.on("connection", (socket) => {
    logger.info("New WebSocket connection", { socketId: socket.id });

    // Authenticate socket connection using JWT
    socket.use((packet, next) => {
      const token = socket.handshake.auth.token;
      if (!token) {
        logger.warn("Socket connection attempt without token", {
          socketId: socket.id,
        });
        return next(new AppError("Authentication required", 401));
      }

      // Verify JWT (assuming auth middleware sets req.user)
      import("../middlewares/auth.middleware.js").then(({ verifyToken }) => {
        verifyToken(token)
          .then((user) => {
            socket.user = user;
            next();
          })
          .catch((err) => {
            logger.error("Socket authentication failed", {
              socketId: socket.id,
              error: err.message,
            });
            next(new AppError("Invalid token", 401));
          });
      });
    });

    // Handle send-message event
    socket.on("send-message", async (data, callback) => {
      try {
        const { recipientId, content } = data;
        if (!recipientId || !content) {
          throw new AppError(
            "Recipient ID and message content are required",
            400
          );
        }

        // Sanitize message content
        const sanitizedContent = sanitize(content).trim();
        if (!sanitizedContent) {
          throw new AppError("Message content cannot be empty", 400);
        }

        // Validate sender and recipient roles
        const sender = await User.findById(socket.user._id)
          .select("role")
          .lean();
        const recipient = await User.findById(recipientId)
          .select("role email")
          .lean();
        if (!sender || !recipient) {
          throw new AppError("Sender or recipient not found", 404);
        }

        const validRoles =
          (sender.role === "patient" && recipient.role === "clinician") ||
          (sender.role === "clinician" && recipient.role === "patient");
        if (!validRoles) {
          throw new AppError(
            "Messages can only be sent between patients and clinicians",
            403
          );
        }

        // Save message to Chat model
        const message = await Chat.create({
          senderId: socket.user._id,
          recipientId,
          content: sanitizedContent,
          timestamp: new Date(),
        });

        // Create audit log for message sent
        await AuditLog.create({
          userId: socket.user._id,
          action: "message_sent",
          details: {
            recipientId,
            recipientEmail: recipient.email,
            messageId: message._id,
          },
          ipAddress: socket.handshake.address,
          deviceInfo: socket.handshake.headers["user-agent"] || "Unknown",
        });
        logger.info("Audit log created for message sent", {
          userId: socket.user._id,
          messageId: message._id,
        });

        // Emit message to recipient
        socket.to(recipientId).emit("receive-message", {
          messageId: message._id,
          senderId: socket.user._id,
          content: sanitizedContent,
          timestamp: message.timestamp,
        });

        logger.info("Message sent successfully", {
          userId: socket.user._id,
          recipientId,
          messageId: message._id,
        });

        // Acknowledge to sender
        callback({ status: "success", messageId: message._id });
      } catch (error) {
        logger.error("Failed to send message", {
          userId: socket.user._id,
          recipientId: data.recipientId,
          error: error.message,
        });
        callback({ status: "error", message: error.message });
      }
    });

    // Join user to their own room (for receiving messages)
    socket.join(socket.user._id.toString());

    socket.on("disconnect", () => {
      logger.info("WebSocket disconnected", {
        socketId: socket.id,
        userId: socket.user._id,
      });
    });
  });
};

/**
 * @desc    Get all conversations for the current user
 * @route   GET /api/chats/conversations
 * @access  Private (patient or clinician)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getConversations = async (req, res, next) => {
  try {
    if (!["patient", "clinician"].includes(req.user.role)) {
      throw new AppError(
        "Only patients and clinicians can access conversations",
        403
      );
    }

    // Find unique conversation partners
    const conversations = await Chat.aggregate([
      {
        $match: {
          $or: [{ senderId: req.user._id }, { recipientId: req.user._id }],
        },
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$senderId", req.user._id] },
              "$recipientId",
              "$senderId",
            ],
          },
          lastMessage: { $last: "$$ROOT" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          userId: "$_id",
          userEmail: "$user.email",
          userRole: "$user.role",
          lastMessage: {
            content: "$lastMessage.content",
            timestamp: "$lastMessage.timestamp",
          },
        },
      },
      { $sort: { "lastMessage.timestamp": -1 } },
    ]);

    // Create audit log for conversation retrieval
    await AuditLog.create({
      userId: req.user._id,
      action: "conversations_retrieved",
      details: {
        email: req.user.email,
        conversationCount: conversations.length,
      },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for conversation retrieval", {
      userId: req.user._id,
      conversationCount: conversations.length,
    });

    logger.info("Conversations retrieved successfully", {
      userId: req.user._id,
      conversationCount: conversations.length,
    });

    return successResponse(
      res,
      { conversations },
      "Conversations retrieved successfully",
      200,
      req,
      "conversations_retrieved"
    );
  } catch (error) {
    logger.error("Failed to retrieve conversations", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
};

/**
 * @desc    Get messages between current user and a specific user
 * @route   GET /api/chats/messages/:recipientId
 * @access  Private (patient or clinician)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getMessages = async (req, res, next) => {
  try {
    if (!["patient", "clinician"].includes(req.user.role)) {
      throw new AppError(
        "Only patients and clinicians can access messages",
        403
      );
    }

    const recipientId = req.params.recipientId;
    const recipient = await User.findById(recipientId)
      .select("role email")
      .lean();
    if (!recipient) {
      throw new AppError("Recipient not found", 404);
    }

    const validRoles =
      (req.user.role === "patient" && recipient.role === "clinician") ||
      (req.user.role === "clinician" && recipient.role === "patient");
    if (!validRoles) {
      throw new AppError(
        "Messages can only be retrieved between patients and clinicians",
        403
      );
    }

    const messages = await Chat.find({
      $or: [
        { senderId: req.user._id, recipientId },
        { senderId: recipientId, recipientId: req.user._id },
      ],
    })
      .select("senderId recipientId content timestamp")
      .sort({ timestamp: 1 })
      .lean();

    // Create audit log for message retrieval
    await AuditLog.create({
      userId: req.user._id,
      action: "messages_retrieved",
      details: {
        email: req.user.email,
        recipientId,
        recipientEmail: recipient.email,
        messageCount: messages.length,
      },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for message retrieval", {
      userId: req.user._id,
      recipientId,
      messageCount: messages.length,
    });

    logger.info("Messages retrieved successfully", {
      userId: req.user._id,
      recipientId,
      messageCount: messages.length,
    });

    return successResponse(
      res,
      { messages },
      "Messages retrieved successfully",
      200,
      req,
      "messages_retrieved"
    );
  } catch (error) {
    logger.error("Failed to retrieve messages", {
      userId: req.user._id,
      recipientId: req.params.recipientId,
      error: error.message,
    });
    next(error);
  }
};

export { initializeChatSocket, getConversations, getMessages };
