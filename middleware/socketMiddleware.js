// middleware/socketMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import RateLimit from '../utils/RateLimit.js';

/**
 * Socket.io authentication and middleware handlers
 */
export class SocketMiddleware {
  constructor() {
    this.rateLimiter = new RateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxAttempts: 10, // Maximum connection attempts per window
    });
  }

  /**
   * Main authentication middleware for Socket.io
   */
  authenticateSocket = async (socket, next) => {
    try {
      // Extract token from various sources
      const token = this.extractToken(socket);

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Rate limiting check
      const clientId = socket.handshake.address;
      if (!this.rateLimiter.check(clientId)) {
        return next(
          new Error('Authentication error: Too many connection attempts'),
        );
      }

      // Verify JWT token
      const decoded = await this.verifyJWTToken(token);
      if (!decoded) {
        this.rateLimiter.increment(clientId);
        return next(new Error('Authentication error: Invalid token'));
      }

      // Fetch fresh user data from database
      const user = await this.fetchUserData(decoded.id);
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      // Check if user account is active
      if (!user.isActive) {
        return next(new Error('Authentication error: Account deactivated'));
      }

      // Attach user to socket with comprehensive data
      socket.user = {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions || [],
        department: user.department,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        preferences: user.preferences || {},
        loginTime: new Date(),
      };

      // Log successful authentication
      this.logAuthentication(socket, 'SUCCESS');

      next();
    } catch (error) {
      this.logAuthentication(socket, 'FAILED', error.message);
      next(new Error('Authentication error: ' + error.message));
    }
  };

  /**
   * Role-based authorization middleware
   */
  requireRoles = (allowedRoles) => {
    return (socket, next) => {
      if (!socket.user) {
        return next(new Error('Authorization error: Authentication required'));
      }

      if (!allowedRoles.includes(socket.user.role)) {
        this.logAuthorization(socket, 'ROLE_DENIED', allowedRoles);
        return next(
          new Error('Authorization error: Insufficient role privileges'),
        );
      }

      this.logAuthorization(socket, 'ROLE_GRANTED', allowedRoles);
      next();
    };
  };

  /**
   * Permission-based authorization middleware
   */
  requirePermissions = (requiredPermissions) => {
    return async (socket, next) => {
      try {
        if (!socket.user) {
          return next(
            new Error('Authorization error: Authentication required'),
          );
        }

        // Fetch fresh permissions from database
        const user = await User.findById(socket.user.id)
          .select('permissions role')
          .lean();

        const userPermissions = user?.permissions || [];

        // Check if user has all required permissions
        const hasAllPermissions = requiredPermissions.every((permission) =>
          userPermissions.includes(permission),
        );

        if (!hasAllPermissions) {
          this.logAuthorization(
            socket,
            'PERMISSION_DENIED',
            requiredPermissions,
          );
          return next(
            new Error('Authorization error: Insufficient permissions'),
          );
        }

        this.logAuthorization(
          socket,
          'PERMISSION_GRANTED',
          requiredPermissions,
        );
        next();
      } catch (error) {
        next(new Error('Authorization error: Permission check failed'));
      }
    };
  };

  /**
   * Department-based authorization middleware
   */
  requireDepartmentAccess = (departmentField = 'department') => {
    return (socket, next) => {
      if (!socket.user) {
        return next(new Error('Authorization error: Authentication required'));
      }

      // Admins have access to all departments
      if (socket.user.role === 'admin') {
        return next();
      }

      const targetDepartment =
        socket.handshake.query[departmentField] ||
        socket.handshake.auth[departmentField];

      if (!targetDepartment) {
        return next(new Error('Authorization error: Department not specified'));
      }

      if (socket.user.department !== targetDepartment) {
        this.logAuthorization(socket, 'DEPARTMENT_DENIED', targetDepartment);
        return next(new Error('Authorization error: Department access denied'));
      }

      this.logAuthorization(socket, 'DEPARTMENT_GRANTED', targetDepartment);
      next();
    };
  };

  /**
   * Case-specific authorization middleware
   */
  requireCaseAccess = () => {
    return async (socket, next) => {
      try {
        if (!socket.user) {
          return next(
            new Error('Authorization error: Authentication required'),
          );
        }

        const caseId =
          socket.handshake.query.caseId || socket.handshake.auth.caseId;

        if (!caseId) {
          return next(new Error('Authorization error: Case ID not specified'));
        }

        // Add your case access validation logic here
        const hasAccess = await this.validateCaseAccess(socket.user, caseId);

        if (!hasAccess) {
          this.logAuthorization(socket, 'CASE_ACCESS_DENIED', caseId);
          return next(new Error('Authorization error: Case access denied'));
        }

        this.logAuthorization(socket, 'CASE_ACCESS_GRANTED', caseId);
        next();
      } catch (error) {
        next(new Error('Authorization error: Case access check failed'));
      }
    };
  };

  /**
   * Rate limiting middleware for specific events
   */
  rateLimitEvent = (eventName, maxRequests = 60, windowMs = 60000) => {
    const eventRateLimiter = new RateLimit({
      windowMs,
      maxAttempts: maxRequests,
    });

    return (socket, next) => {
      const key = `${socket.user.id}:${eventName}`;

      if (!eventRateLimiter.check(key)) {
        socket.emit('error', {
          type: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests for event: ${eventName}`,
          retryAfter: eventRateLimiter.getTimeUntilReset(key),
        });
        return next(new Error(`Rate limit exceeded for event: ${eventName}`));
      }

      eventRateLimiter.increment(key);
      next();
    };
  };

  /**
   * Input validation middleware
   */
  validateInput = (schema) => {
    return (socket, next, data) => {
      try {
        const { error, value } = schema.validate(data, {
          abortEarly: false,
          stripUnknown: true,
        });

        if (error) {
          const validationErrors = error.details.map((detail) => ({
            field: detail.path.join('.'),
            message: detail.message,
          }));

          socket.emit('validation-error', {
            event: socket.event,
            errors: validationErrors,
          });

          return next(new Error('Input validation failed'));
        }

        // Replace data with validated values
        socket.data = value;
        next();
      } catch (error) {
        next(new Error('Input validation error'));
      }
    };
  };

  /**
   * Session validation middleware
   */
  validateSession = async (socket, next) => {
    try {
      if (!socket.user) {
        return next(new Error('Session validation error: No user data'));
      }

      // Check if user session is still valid
      const user = await User.findById(socket.user.id)
        .select('isActive lastLogout sessionExpires')
        .lean();

      if (!user || !user.isActive) {
        return next(
          new Error('Session validation error: User account is inactive'),
        );
      }

      // Check if user was forcibly logged out
      if (
        user.lastLogout &&
        socket.user.loginTime < new Date(user.lastLogout)
      ) {
        return next(
          new Error(
            'Session validation error: User logged out from another device',
          ),
        );
      }

      // Check session expiration
      if (user.sessionExpires && new Date() > new Date(user.sessionExpires)) {
        return next(new Error('Session validation error: Session expired'));
      }

      next();
    } catch (error) {
      next(new Error('Session validation error: ' + error.message));
    }
  };

  /**
   * Connection logging middleware
   */
  logConnection = (socket, next) => {
    const connectionInfo = {
      socketId: socket.id,
      userId: socket.user?.id,
      userAgent: socket.handshake.headers['user-agent'],
      ipAddress: socket.handshake.address,
      timestamp: new Date(),
    };

    console.log('Socket connection established:', connectionInfo);

    // Emit connection info for admin monitoring
    if (socket.user?.role === 'admin') {
      socket.broadcast
        .to('admin-monitoring')
        .emit('connection-log', connectionInfo);
    }

    next();
  };

  /**
   * Error handling middleware
   */
  errorHandler = (error, socket, next) => {
    console.error('Socket error:', {
      socketId: socket.id,
      userId: socket.user?.id,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date(),
    });

    // Send structured error to client
    socket.emit('socket-error', {
      type: 'MIDDLEWARE_ERROR',
      message: error.message,
      timestamp: new Date(),
      code: this.getErrorCode(error.message),
    });

    // Don't propagate error to prevent connection drop in some cases
    next();
  };

  /**
   * Extract token from socket handshake
   */
  extractToken(socket) {
    // From auth object
    if (socket.handshake.auth?.token) {
      return socket.handshake.auth.token;
    }

    // From query parameters
    if (socket.handshake.query?.token) {
      return socket.handshake.query.token;
    }

    // From headers
    const authHeader = socket.handshake.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.replace('Bearer ', '');
    }

    // From cookies
    if (socket.request?.cookies?.token) {
      return socket.request.cookies.token;
    }

    return null;
  }

  /**
   * Verify JWT token
   */
  async verifyJWTToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Fetch user data from database
   */
  async fetchUserData(userId) {
    try {
      const user = await User.findById(userId)
        .select(
          'email name role permissions department isActive lastLogin preferences',
        )
        .lean();

      return user;
    } catch (error) {
      throw new Error('Failed to fetch user data');
    }
  }

  /**
   * Validate case access (implement based on your business logic)
   */
  async validateCaseAccess(user, caseId) {
    // Implement your case access validation logic
    // This could check if user is assigned to the case, has department access, etc.

    // Placeholder implementation
    const Case = await import('../models/PatientCase.js');
    const patientCase = await Case.default
      .findById(caseId)
      .select('assignedRadiologist department status')
      .lean();

    if (!patientCase) return false;

    // Admin has access to all cases
    if (user.role === 'admin') return true;

    // Radiologist has access to assigned cases
    if (
      user.role === 'radiologist' &&
      patientCase.assignedRadiologist?.toString() === user.id
    ) {
      return true;
    }

    // Department-based access
    if (user.department && patientCase.department === user.department) {
      return true;
    }

    return false;
  }

  /**
   * Authentication logging
   */
  logAuthentication(socket, status, errorMessage = null) {
    const logEntry = {
      timestamp: new Date(),
      socketId: socket.id,
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'],
      status,
      errorMessage,
      userId: socket.user?.id,
    };

    console.log('Socket authentication:', logEntry);

    // Emit to admin monitoring room
    if (process.env.NODE_ENV === 'production') {
      socket.broadcast.to('admin-monitoring').emit('auth-log', logEntry);
    }
  }

  /**
   * Authorization logging
   */
  logAuthorization(socket, action, resource) {
    const logEntry = {
      timestamp: new Date(),
      socketId: socket.id,
      userId: socket.user.id,
      userRole: socket.user.role,
      action,
      resource,
      ip: socket.handshake.address,
    };

    console.log('Socket authorization:', logEntry);

    // Emit to admin monitoring room
    socket.broadcast.to('admin-monitoring').emit('authz-log', logEntry);
  }

  /**
   * Get error code from error message
   */
  getErrorCode(errorMessage) {
    const errorCodes = {
      'No token': 'NO_TOKEN',
      'Invalid token': 'INVALID_TOKEN',
      'Token expired': 'TOKEN_EXPIRED',
      'User not found': 'USER_NOT_FOUND',
      'Account deactivated': 'ACCOUNT_DEACTIVATED',
      'Insufficient role': 'INSUFFICIENT_ROLE',
      'Insufficient permissions': 'INSUFFICIENT_PERMISSIONS',
      'Department access denied': 'DEPARTMENT_ACCESS_DENIED',
      'Case access denied': 'CASE_ACCESS_DENIED',
      'Rate limit exceeded': 'RATE_LIMIT_EXCEEDED',
      'Too many connection attempts': 'TOO_MANY_CONNECTIONS',
    };

    for (const [key, code] of Object.entries(errorCodes)) {
      if (errorMessage.includes(key)) {
        return code;
      }
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Cleanup method
   */
  cleanup() {
    this.rateLimiter.cleanup();
  }
}

// Create singleton instance
const socketMiddleware = new SocketMiddleware();

export default socketMiddleware;
