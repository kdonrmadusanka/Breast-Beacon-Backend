/**
 * @swagger
 * components:
 *   schemas:
 *     AuditLog:
 *       type: object
 *       properties:
 *         timestamp:
 *           type: string
 *           format: date-time
 *         eventType:
 *           type: string
 *           enum: [login, access, modification, system, security, api]
 *         action:
 *           type: string
 *         userId:
 *           type: string
 *         userRole:
 *           type: string
 *         entityType:
 *           type: string
 *         entityId:
 *           type: string
 *         ipAddress:
 *           type: string
 *         userAgent:
 *           type: string
 *         metadata:
 *           type: object
 *         status:
 *           type: string
 *           enum: [success, failure, warning]
 *         changes:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *               oldValue:
 *                 type: string
 *               newValue:
 *                 type: string
 */

import Audit from "../models/Audit.js";
import { maskSensitiveData } from "../utils/dataProtection.js";

// Event type categories
const EVENT_TYPES = {
  ACCESS: "access",
  MODIFICATION: "modification",
  SYSTEM: "system",
  SECURITY: "security",
  API: "api",
  LOGIN: "login",
};

/**
 * Log an audit event
 * @param {Object} params
 * @param {string} params.eventType - Type of event
 * @param {string} params.action - Description of action
 * @param {Object} params.user - User document
 * @param {string} [params.entityType] - Entity type affected
 * @param {string} [params.entityId] - Entity ID affected
 * @param {Object} [params.metadata] - Additional context data
 * @param {string} [params.status] - Event status
 * @param {Array} [params.changes] - Field changes for modifications
 * @param {Object} [params.req] - Express request object
 * @returns {Promise<Object>} Created audit log
 */
export const logEvent = async ({
  eventType,
  action,
  user,
  entityType,
  entityId,
  metadata = {},
  status = "success",
  changes = [],
  req,
}) => {
  try {
    // Sanitize and mask sensitive data
    const sanitizedMetadata = maskSensitiveData(metadata);
    const sanitizedChanges = changes.map((change) => ({
      field: change.field,
      oldValue: maskSensitiveData(change.oldValue),
      newValue: maskSensitiveData(change.newValue),
    }));

    // Get client info from request if available
    const clientInfo = req
      ? {
          ipAddress: req.clientIpAddress,
          userAgent: req.headers["user-agent"],
          endpoint: req.originalUrl,
          method: req.method,
        }
      : {};

    // Create audit record
    const audit = new Audit({
      timestamp: new Date(),
      eventType,
      action,
      userId: user?._id,
      userRole: user?.role,
      entityType,
      entityId,
      status,
      changes: sanitizedChanges,
      metadata: {
        ...sanitizedMetadata,
        ...clientInfo,
      },
    });

    await audit.save();
    return audit;
  } catch (error) {
    console.error("Audit logging failed:", error);

    // Fallback to console logging if database fails
    console.log("AUDIT FALLBACK:", {
      timestamp: new Date(),
      eventType,
      action,
      userId: user?._id,
      entityType,
      entityId,
      status,
    });

    throw error;
  }
};

/**
 * Middleware to log API requests
 * @returns {Function} Express middleware
 */
export const apiAuditMiddleware = () => {
  return async (req, res, next) => {
    const startTime = Date.now();

    // Capture response details
    res.on("finish", async () => {
      try {
        const duration = Date.now() - startTime;

        await logEvent({
          eventType: EVENT_TYPES.API,
          action: `${req.method} ${req.originalUrl}`,
          user: req.user,
          status: res.statusCode < 400 ? "success" : "failure",
          metadata: {
            statusCode: res.statusCode,
            durationMs: duration,
            params: req.params,
            query: req.query,
          },
          req,
        });
      } catch (error) {
        console.error("API audit logging failed:", error);
      }
    });

    next();
  };
};

/**
 * Log data access events
 * @param {Object} params
 * @param {string} params.resourceType - Type of resource accessed
 * @param {string} params.resourceId - ID of resource accessed
 * @param {Object} params.user - User making the access
 * @param {string} [params.action] - Specific access action
 * @param {Object} [params.req] - Express request
 * @returns {Promise<Object>} Audit log
 */
export const logAccess = async ({
  resourceType,
  resourceId,
  user,
  action = "read",
  req,
}) => {
  return logEvent({
    eventType: EVENT_TYPES.ACCESS,
    action: `${action} ${resourceType}`,
    user,
    entityType: resourceType,
    entityId: resourceId,
    req,
  });
};

/**
 * Log data modifications
 * @param {Object} params
 * @param {string} params.entityType - Type of entity modified
 * @param {string} params.entityId - ID of entity modified
 * @param {Object} params.user - User making changes
 * @param {Array} params.changes - Array of field changes
 * @param {Object} [params.req] - Express request
 * @returns {Promise<Object>} Audit log
 */
export const logModification = async ({
  entityType,
  entityId,
  user,
  changes,
  req,
}) => {
  return logEvent({
    eventType: EVENT_TYPES.MODIFICATION,
    action: `modified ${entityType}`,
    user,
    entityType,
    entityId,
    changes,
    req,
  });
};

/**
 * Log security events
 * @param {Object} params
 * @param {string} params.action - Security action
 * @param {Object} [params.user] - Related user
 * @param {string} [params.status] - Event status
 * @param {Object} [params.metadata] - Additional context
 * @param {Object} [params.req] - Express request
 * @returns {Promise<Object>} Audit log
 */
export const logSecurityEvent = async ({
  action,
  user,
  status = "success",
  metadata = {},
  req,
}) => {
  return logEvent({
    eventType: EVENT_TYPES.SECURITY,
    action,
    user,
    status,
    metadata,
    req,
  });
};

/**
 * Query audit logs
 * @param {Object} filters - Query filters
 * @param {Date} [filters.startDate] - Start date range
 * @param {Date} [filters.endDate] - End date range
 * @param {string} [filters.eventType] - Event type to filter
 * @param {string} [filters.userId] - User ID to filter
 * @param {string} [filters.entityType] - Entity type to filter
 * @param {string} [filters.entityId] - Entity ID to filter
 * @param {string} [filters.action] - Action text search
 * @param {number} [limit=100] - Maximum results to return
 * @returns {Promise<Array>} Matching audit logs
 */
export const queryAuditLogs = async (filters = {}, limit = 100) => {
  const query = {};

  // Date range
  if (filters.startDate || filters.endDate) {
    query.timestamp = {};
    if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate);
    if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate);
  }

  // Other filters
  if (filters.eventType) query.eventType = filters.eventType;
  if (filters.userId) query.userId = filters.userId;
  if (filters.entityType) query.entityType = filters.entityType;
  if (filters.entityId) query.entityId = filters.entityId;
  if (filters.action) query.action = { $regex: filters.action, $options: "i" };
  if (filters.status) query.status = filters.status;

  return Audit.find(query).sort({ timestamp: -1 }).limit(limit).lean();
};

/**
 * @swagger
 * /api/audit/logs:
 *   get:
 *     summary: Query audit logs
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date filter
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date filter
 *       - in: query
 *         name: eventType
 *         schema:
 *           type: string
 *           enum: [login, access, modification, system, security, api]
 *         description: Event type filter
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: User ID filter
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *         description: Entity type filter
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Action text search
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum results to return
 *     responses:
 *       200:
 *         description: Audit log results
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AuditLog'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export const getAuditLogs = async (req, res) => {
  try {
    // Only allow admins and auditors to query logs
    if (!["admin", "auditor"].includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const logs = await queryAuditLogs(
      {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        eventType: req.query.eventType,
        userId: req.query.userId,
        entityType: req.query.entityType,
        entityId: req.query.entityId,
        action: req.query.action,
        status: req.query.status,
      },
      parseInt(req.query.limit) || 100
    );

    res.json(logs);
  } catch (error) {
    console.error("Failed to query audit logs:", error);
    res.status(500).json({ error: "Failed to retrieve audit logs" });
  }
};

// Example usage in other services:

// In authentication controller:
// await logSecurityEvent({
//   action: 'user_login',
//   user,
//   status: 'success',
//   metadata: { authMethod: 'password' },
//   req
// });

// In data access:
// await logAccess({
//   resourceType: 'mammogram',
//   resourceId: mammogram._id,
//   user: req.user,
//   req
// });

// In data modification:
// await logModification({
//   entityType: 'patient',
//   entityId: patient._id,
//   user: req.user,
//   changes: [
//     { field: 'email', oldValue: oldEmail, newValue: newEmail }
//   ],
//   req
// });
