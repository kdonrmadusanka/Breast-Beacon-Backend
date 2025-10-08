import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['radiologist', 'technician', 'admin', 'physician', 'patient'],
      default: 'patient',
    },
    specialization: {
      type: String,
      required: function () {
        return this.role === 'radiologist' || this.role === 'physician';
      },
      enum: [
        'breast-imaging',
        'general-radiology',
        'oncology',
        'gynecology',
        null,
      ],
    },
    licenseNumber: {
      type: String,
      required: function () {
        return this.role === 'radiologist' || this.role === 'physician';
      },
    },
    institution: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: false,
    },
    // Updated tokens array with named tokens
    tokens: [
      {
        name: {
          type: String,
          required: true,
          enum: [
            'auth',
            'email_verification',
            'password_reset',
            'api',
            'other',
          ],
        },
        token: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        expiresAt: {
          type: Date,
          required: true,
        },
        metadata: {
          type: Map,
          of: mongoose.Schema.Types.Mixed,
          default: {},
        },
      },
    ],
    isVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
    },
    passwordChangedAt: Date,
    active: {
      type: Boolean,
      default: true,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for mammograms uploaded by this user
userSchema.virtual('mammograms', {
  ref: 'Mammogram',
  localField: '_id',
  foreignField: 'uploadedBy',
});

// Pre-save hook to generate user ID
userSchema.pre('save', async function (next) {
  if (this.isNew && !this.userId) {
    try {
      const { generateUserId } = await import('../utils/userIdGenerator.js');
      this.userId = await generateUserId(this.role);
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

// Pre-save hook to hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Pre-save hook to set passwordChangedAt
userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;
  next();
});

// Pre-save hook to cleanup expired tokens
userSchema.pre('save', function (next) {
  const now = new Date();
  this.tokens = this.tokens.filter((tokenObj) => tokenObj.expiresAt > now);
  next();
});

// Method to generate JWT token
userSchema.methods.generateAuthToken = function () {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not defined');
  }

  const payload = {
    _id: this._id,
    userId: this.userId,
    role: this.role,
    email: this.email,
    isVerified: this.isVerified,
    ...(this.role !== 'patient' && { specialization: this.specialization }),
    ...(this.institution && { institution: this.institution }),
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// Method to generate email verification token
userSchema.methods.generateEmailVerificationToken = function () {
  if (!process.env.JWT_EMAIL_SECRET) {
    throw new Error('JWT_EMAIL_SECRET environment variable is not defined');
  }

  const payload = {
    userId: this._id,
    email: this.email,
    purpose: 'email_verification',
  };

  return jwt.sign(payload, process.env.JWT_EMAIL_SECRET, {
    expiresIn: '24h',
  });
};

// Method to save token with name and expiration
userSchema.methods.saveToken = async function (
  name,
  token,
  expiresIn = '7d',
  metadata = {},
) {
  const expiresInMs = this._convertExpiresToMs(expiresIn);
  const expiresAt = new Date(Date.now() + expiresInMs);

  const tokenObj = {
    name,
    token,
    expiresAt,
    metadata,
  };

  // Remove existing tokens with same name
  this.tokens = this.tokens.filter((t) => t.name !== name);

  // Add new token
  this.tokens.push(tokenObj);
  await this.save();

  return token;
};

// Method to get token by name
userSchema.methods.getToken = function (name) {
  const tokenObj = this.tokens.find(
    (t) => t.name === name && t.expiresAt > new Date(),
  );
  return tokenObj ? tokenObj.token : null;
};

// Method to get token object by name
userSchema.methods.getTokenObject = function (name) {
  return this.tokens.find((t) => t.name === name && t.expiresAt > new Date());
};

// Method to remove token by name
userSchema.methods.removeToken = async function (name) {
  this.tokens = this.tokens.filter((tokenObj) => tokenObj.name !== name);
  await this.save();
};

// Method to remove token by value
userSchema.methods.removeTokenByValue = async function (token) {
  this.tokens = this.tokens.filter((tokenObj) => tokenObj.token !== token);
  await this.save();
};

// Method to remove all tokens (for logout from all devices)
userSchema.methods.removeAllTokens = async function () {
  this.tokens = [];
  await this.save();
};

// Method to remove all tokens of specific type
userSchema.methods.removeAllTokensOfType = async function (name) {
  this.tokens = this.tokens.filter((tokenObj) => tokenObj.name !== name);
  await this.save();
};

// Method to check if token exists and is valid
userSchema.methods.hasValidToken = function (name) {
  const tokenObj = this.tokens.find((t) => t.name === name);
  return tokenObj ? tokenObj.expiresAt > new Date() : false;
};

// Method to get all valid tokens
userSchema.methods.getValidTokens = function () {
  const now = new Date();
  return this.tokens.filter((tokenObj) => tokenObj.expiresAt > now);
};

// Method to cleanup expired tokens
userSchema.methods.cleanupExpiredTokens = async function () {
  const now = new Date();
  const initialLength = this.tokens.length;
  this.tokens = this.tokens.filter((tokenObj) => tokenObj.expiresAt > now);

  if (this.tokens.length !== initialLength) {
    await this.save();
  }

  return initialLength - this.tokens.length;
};

// Save auth token (combines generate and save)
userSchema.methods.generateAndSaveAuthToken = async function () {
  const token = this.generateAuthToken();
  return await this.saveToken(
    'auth',
    token,
    process.env.JWT_EXPIRES_IN || '7d',
    {
      device: 'web',
      createdAt: new Date(),
    },
  );
};

// Save email verification token
userSchema.methods.generateAndSaveEmailVerificationToken = async function () {
  let token = this.generateEmailVerificationToken();
  token = token.trim();
  return await this.saveToken('email_verification', token, '24h', {
    purpose: 'verify_email',
    generatedAt: new Date(),
  });
};

// Method to verify email using token
userSchema.methods.verifyEmailWithToken = async function () {
  const tokenObj = this.getTokenObject('email_verification');
  if (!tokenObj) {
    throw new Error('No valid email verification token found');
  }

  try {
    const decoded = jwt.verify(tokenObj.token, process.env.JWT_EMAIL_SECRET);
    if (decoded.userId.toString() !== this._id.toString()) {
      throw new Error('Invalid token for this user');
    }

    this.isVerified = true;
    await this.removeToken('email_verification');
    await this.save();

    return true;
  } catch (error) {
    await this.removeToken('email_verification');
    throw error;
  }
};

// Method to create password reset token
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Save as named token
  this.saveToken('password_reset', hashedToken, '10m', {
    purpose: 'password_reset',
    createdAt: new Date(),
  });

  return resetToken;
};

// Method to verify password reset token
userSchema.methods.verifyPasswordResetToken = function (token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const tokenObj = this.getTokenObject('password_reset');
  if (!tokenObj) {
    return false;
  }

  return tokenObj.token === hashedToken;
};

// Method to remove password reset token after use
userSchema.methods.removePasswordResetToken = async function () {
  await this.removeToken('password_reset');
};

// Helper method to convert expiresIn to milliseconds
userSchema.methods._convertExpiresToMs = function (expiresIn) {
  if (typeof expiresIn === 'number') {
    return expiresIn * 1000; // Convert seconds to milliseconds
  }

  const units = {
    s: 1000, // seconds
    m: 60 * 1000, // minutes
    h: 60 * 60 * 1000, // hours
    d: 24 * 60 * 60 * 1000, // days
    w: 7 * 24 * 60 * 60 * 1000, // weeks
  };

  const match = expiresIn.match(/^(\d+)([smhdw])$/);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2];
    return value * units[unit];
  }

  // Default to 7 days if invalid format
  return 7 * 24 * 60 * 60 * 1000;
};

// Method to compare passwords
userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword,
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Method to check if password was changed after token was issued
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10,
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Method to resend verification email
userSchema.methods.resendVerificationEmail = async function () {
  // Check if user is already verified
  if (this.isVerified) {
    throw new Error('Email is already verified');
  }

  // Remove any existing email verification tokens
  await this.removeToken('email_verification');

  // Generate new verification token
  const verificationToken = await this.generateAndSaveEmailVerificationToken();

  return verificationToken;
};

// Query middleware to filter out inactive users
userSchema.pre(/^find/, function (next) {
  this.find({ active: { $ne: false } });
  next();
});

const User = mongoose.model('User', userSchema);

export default User;
