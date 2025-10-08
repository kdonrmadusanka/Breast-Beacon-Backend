import mongoose from 'mongoose';
import validator from 'validator';
import User from '../models/User.js';
import jwt from 'jsonwebtoken'; // Add this import
import {
  sendWelcomeEmail,
  testEmailConnection,
} from '../utils/emailService.js';
import { sendEmailVerificationSuccessEmail } from '../utils/emailService.js';

export const verifyEmail = async (req, res) => {
  try {
    let { token } = req.query;
    token = token.toString().trim();
    token = decodeURIComponent(token);
    console.log('🔍 Received token:', token);
    console.log('🔍 Token length:', token?.length);
    console.log('🔍 Token type:', typeof token);

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required',
      });
    }

    const User = mongoose.model('User');

    // First, let's find ALL users with email_verification tokens to debug
    const allUsersWithVerificationTokens = await User.find({
      'tokens.name': 'email_verification',
    });

    console.log(
      '🔍 Users with verification tokens:',
      allUsersWithVerificationTokens.length,
    );

    allUsersWithVerificationTokens.forEach((user) => {
      user.tokens.forEach((t) => {
        if (t.name === 'email_verification') {
          console.log('🔍 Stored token:', t.token);
          console.log('🔍 Stored token length:', t.token.length);
          console.log('🔍 Token matches?', t.token === token);
          console.log('🔍 Expires at:', t.expiresAt);
          console.log('🔍 Is expired?', t.expiresAt < new Date());
        }
      });
    });

    // Then try the actual query
    let user = await User.findOne({
      // Changed from const to let
      'tokens.name': 'email_verification',
      'tokens.token': token,
      'tokens.expiresAt': { $gt: new Date() },
    });

    console.log('🔍 Found user:', user ? 'Yes' : 'No');

    if (!user) {
      console.log('🔍 Exact match failed, trying JWT verification...');

      // Find all users with valid email verification tokens
      const potentialUsers = await User.find({
        'tokens.name': 'email_verification',
        'tokens.expiresAt': { $gt: new Date() },
      });

      for (const potentialUser of potentialUsers) {
        const tokenObj = potentialUser.getTokenObject('email_verification');
        if (tokenObj) {
          try {
            // Try to verify the stored token JWT
            const decodedStored = jwt.verify(
              tokenObj.token,
              process.env.JWT_EMAIL_SECRET || process.env.JWT_SECRET,
            );
            // Try to verify the received token JWT
            const decodedReceived = jwt.verify(
              token,
              process.env.JWT_EMAIL_SECRET || process.env.JWT_SECRET,
            );

            // If both tokens have the same payload, they're the same token
            if (
              decodedStored.userId.toString() ===
              decodedReceived.userId.toString()
            ) {
              user = potentialUser;
              console.log('🔍 Found user via JWT payload match');
              break;
            }
          } catch (jwtError) {
            // Continue to next user
            continue;
          }
        }
      }
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token',
      });
    }

    // Verify the token
    try {
      jwt.verify(token, process.env.JWT_EMAIL_SECRET || process.env.JWT_SECRET); // Fixed this line
    } catch (jwtError) {
      // Remove invalid token
      await user.removeToken('email_verification');

      if (jwtError.name === 'TokenExpiredError') {
        return res.status(400).json({
          success: false,
          message: 'Verification token has expired',
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid verification token',
      });
    }

    // Mark user as verified and remove verification token
    user.isVerified = true;
    await user.removeToken('email_verification');
    await user.save();

    console.log('✅ Email verified successfully for:', user.email);

    // Send verification success email
    try {
      await sendEmailVerificationSuccessEmail(user);
    } catch (emailError) {
      console.error(
        'Failed to send verification success email:',
        emailError.message,
      );
      // Continue even if email fails
    }

    return res.status(200).json({
      success: true,
      message:
        'Email verified successfully! You can now log in to your account.',
      data: {
        userId: user.userId,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Email verification error:', error);

    return res.status(500).json({
      success: false,
      message: 'Email verification failed',
      ...(process.env.NODE_ENV === 'development' && {
        error: error.message,
      }),
    });
  }
};

/**
 * Resend verification email for unverified users
 */
export const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required',
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address',
      });
    }

    // Check if user is already verified
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified. You can log in to your account.',
      });
    }

    // Check if user has a valid verification token already
    const hasValidToken = user.hasValidToken('email_verification');

    if (hasValidToken) {
      const tokenObj = user.getTokenObject('email_verification');
      const tokenExpiresIn = Math.ceil(
        (tokenObj.expiresAt - new Date()) / (1000 * 60),
      ); // minutes

      // if (tokenExpiresIn > 10) {
      //   // If token has more than 10 minutes left
      //   return res.status(429).json({
      //     success: false,
      //     message: `Verification email was recently sent. Please check your email or wait ${tokenExpiresIn} minutes to request a new one.`,
      //     retryAfter: tokenExpiresIn,
      //   });
      // }
    }

    // Resend verification email
    const verificationToken = await user.resendVerificationEmail();

    // Try to send email, but don't fail the request if email fails
    let emailSent = false;
    let emailError = null;

    try {
      // Test connection first
      await testEmailConnection();
      await sendWelcomeEmail(user, verificationToken);
      emailSent = true;
      console.log('✅ Verification email sent successfully to:', user.email);
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError.message);
      emailError = emailError.message;
      // Continue with the response even if email fails
    }

    // Get token expiration for response
    const tokenObj = user.getTokenObject('email_verification');
    const expiresIn = Math.ceil(
      (tokenObj.expiresAt - new Date()) / (1000 * 60 * 60),
    ); // hours

    // Prepare response based on email success
    if (emailSent) {
      return res.status(200).json({
        success: true,
        message: `Verification email sent successfully! Please check your inbox (and spam folder). The link will expire in ${expiresIn} hours.`,
        data: {
          email: user.email,
          expiresIn: `${expiresIn} hours`,
          retryAllowedAfter: 10, // minutes
        },
      });
    } else {
      return res.status(200).json({
        success: true,
        message: `Verification token generated successfully but email delivery failed. Please try again later or contact support.`,
        data: {
          email: user.email,
          expiresIn: `${expiresIn} hours`,
          emailDeliveryFailed: true,
          emailError:
            process.env.NODE_ENV === 'development' ? emailError : undefined,
        },
      });
    }
  } catch (error) {
    console.error('Resend verification error:', error);

    let statusCode = 500;
    let message = 'Failed to process verification request';

    if (error.message.includes('already verified')) {
      statusCode = 400;
      message = error.message;
    } else if (error.message.includes('JWT_EMAIL_SECRET')) {
      statusCode = 500;
      message = 'Server configuration error - please contact support';
    }

    return res.status(statusCode).json({
      success: false,
      message: message,
      ...(process.env.NODE_ENV === 'development' && {
        error: error.message,
      }),
    });
  }
};
