import { sendEmailVerificationSuccessEmail } from '../utils/emailService.js';

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required',
      });
    }

    const User = mongoose.model('User');

    // Find user by email verification token
    const user = await User.findOne({
      'tokens.name': 'email_verification',
      'tokens.token': token,
      'tokens.expiresAt': { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token',
      });
    }

    // Verify the token
    try {
      jwt.verify(token, process.env.JWT_EMAIL_SECRET || process.env.JWT_SECRET);
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
