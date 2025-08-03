import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Authentication middleware
export const authenticate = async (req, res, next) => {
  try {
    // 1. Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 3. Find user and attach to request
    const user = await User.findOne({
      _id: decoded.id,
      'tokens.token': token
    }).select('-password');

    if (!user) {
      throw new Error();
    }

    // Attach user and token to request
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Please authenticate' });
  }
};

// Authorization middleware
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access denied. Requires role: ${roles.join(', ')}`
      });
    }
    next();
  };
};