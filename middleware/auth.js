// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * HTTP request authentication middleware with enhanced security
 */
export const auth = async (req, res, next) => {
  try {
    // Extract token from multiple sources
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No authentication token provided.',
        code: 'NO_TOKEN',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Optional: Fetch fresh user data from database
    const user = await User.findById(decoded.id).select('-password').lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found. Token may be invalid.',
        code: 'USER_NOT_FOUND',
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated. Please contact administrator.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    // Attach user to request
    req.user = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
    };

    // Update last activity (optional, can be done in separate middleware)
    await User.findByIdAndUpdate(user._id, {
      lastActiveAt: new Date(),
    });

    next();
  } catch (error) {
    console.error('Authentication error:', error);

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token.',
        code: 'INVALID_TOKEN',
      });
    }

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        success: false,
        error: 'Authentication token has expired.',
        code: 'TOKEN_EXPIRED',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Authentication failed.',
      code: 'AUTH_FAILED',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
        code: 'UNAUTHENTICATED',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions to access this resource.',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredRoles: allowedRoles,
        userRole: req.user.role,
      });
    }

    next();
  };
};

/**
 * Permission-based authorization middleware
 */
export const requirePermission = (requiredPermissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required.',
          code: 'UNAUTHENTICATED',
        });
      }

      // Fetch fresh user permissions from database
      const user = await User.findById(req.user.id)
        .select('permissions role')
        .lean();

      const userPermissions = user?.permissions || [];

      // Check if user has all required permissions
      const hasAllPermissions = requiredPermissions.every((permission) =>
        userPermissions.includes(permission),
      );

      if (!hasAllPermissions) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions to perform this action.',
          code: 'INSUFFICIENT_PERMISSIONS',
          requiredPermissions,
          userPermissions,
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Permission verification failed.',
        code: 'PERMISSION_CHECK_FAILED',
      });
    }
  };
};

/**
 * Socket.io connection authentication with enhanced security
 */
export const authenticateSocket = async (socket, next) => {
  try {
    const token = extractSocketToken(socket);

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify user exists and is active
    const user = await User.findById(decoded.id).select('-password').lean();

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    if (!user.isActive) {
      return next(new Error('Authentication error: Account deactivated'));
    }

    // Attach user to socket
    socket.user = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
    };

    // Update user's socket connection status
    socket.join(`user:${user._id}`);

    next();
  } catch (error) {
    console.error('Socket authentication error:', error);

    if (error instanceof jwt.JsonWebTokenError) {
      return next(new Error('Authentication error: Invalid token'));
    }

    if (error instanceof jwt.TokenExpiredError) {
      return next(new Error('Authentication error: Token expired'));
    }

    next(new Error('Authentication error: Failed to authenticate'));
  }
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password').lean();

      if (user && user.isActive) {
        req.user = {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: user.permissions,
        };
      }
    }

    next();
  } catch (error) {
    // Continue without authentication for optional auth
    next();
  }
};

/**
 * Extract token from various sources (Header, Query, Body)
 */
const extractToken = (req) => {
  // From Authorization header
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }

  // From query parameter
  if (req.query.token) {
    return req.query.token;
  }

  // From cookies
  if (req.cookies?.token) {
    return req.cookies.token;
  }

  return null;
};

/**
 * Extract token from socket connection
 */
const extractSocketToken = (socket) => {
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

  return null;
};

/**
 * Rate limiting wrapper for authentication
 */
export const withRateLimit = (authMiddleware, options = {}) => {
  const { windowMs = 15 * 60 * 1000, maxAttempts = 5 } = options;
  const attempts = new Map();

  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old attempts
    for (const [key, timestamps] of attempts.entries()) {
      attempts.set(
        key,
        timestamps.filter((time) => time > windowStart),
      );
      if (attempts.get(key).length === 0) {
        attempts.delete(key);
      }
    }

    const userAttempts = attempts.get(ip) || [];

    if (userAttempts.length >= maxAttempts) {
      return res.status(429).json({
        success: false,
        error: 'Too many authentication attempts. Please try again later.',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((userAttempts[0] + windowMs - now) / 1000),
      });
    }

    // Add current attempt
    userAttempts.push(now);
    attempts.set(ip, userAttempts);

    // Proceed with authentication
    authMiddleware(req, res, (err) => {
      if (err) {
        next(err);
      } else {
        // Clear attempts on successful authentication
        attempts.delete(ip);
        next();
      }
    });
  };
};

export default {
  auth,
  authenticateSocket,
  requireRole,
  requirePermission,
  optionalAuth,
  withRateLimit,
};
