import mongoose from 'mongoose';
import validator from 'validator';
import User from '../models/User.js';
import Patient from '../models/Patient.js';
import { sendWelcomeEmail } from '../utils/emailService.js';

export const registerUser = async (req, res) => {
  // Validate critical dependencies first
  if (!mongoose.connection.readyState) {
    return res.status(500).json({
      success: false,
      message: 'Database connection not available',
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { firstName, lastName, email, password, role = 'patient' } = req.body;

    // Input validation
    if (!firstName || !lastName || !email || !password) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided',
        requiredFields: ['firstName', 'lastName', 'email', 'password'],
      });
    }

    // Sanitize inputs
    const sanitizedData = {
      firstName: firstName.toString().trim(),
      lastName: lastName.toString().trim(),
      email: email.toString().toLowerCase().trim(),
      password: password.toString(),
      role: role.toString(),
    };

    // Email validation
    if (!validator.isEmail(sanitizedData.email)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Password strength validation
    if (password.length < 8) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }

    // Check for existing user
    const User = mongoose.model('User');
    const existingUser = await User.findOne({
      email: sanitizedData.email,
    }).session(session);

    if (existingUser) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: 'Email address is already registered',
      });
    }

    // Handle medical professional fields
    const medicalFields = {};
    const MEDICAL_ROLES = ['radiologist', 'physician', 'technician', 'admin'];
    const isMedicalProfessional = MEDICAL_ROLES.includes(sanitizedData.role);

    if (isMedicalProfessional) {
      const { licenseNumber, specialization, institution } = req.body;

      if (!licenseNumber || !specialization) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message:
            'Medical professionals must provide license number and specialization',
        });
      }

      Object.assign(medicalFields, {
        licenseNumber: licenseNumber.toString().trim(),
        specialization: specialization.toString().trim(),
        ...(institution && { institution: institution.toString().trim() }),
      });
    }

    // Create user
    const newUser = await User.create(
      [
        {
          firstName: sanitizedData.firstName,
          lastName: sanitizedData.lastName,
          email: sanitizedData.email,
          password: sanitizedData.password,
          role: sanitizedData.role,
          ...medicalFields,
          // Patients are auto-verified, medical professionals need email verification
          isVerified: sanitizedData.role === 'patient',
          active: true,
        },
      ],
      { session },
    );

    const user = newUser[0];

    // Handle patient-specific creation
    if (sanitizedData.role === 'patient') {
      try {
        const Patient = mongoose.model('Patient');
        const { dateOfBirth, gender, phoneNumber, address } = req.body;

        await Patient.create(
          [
            {
              user: user._id,
              dateOfBirth: dateOfBirth || null,
              gender: gender || null,
              phoneNumber: phoneNumber || null,
              address: address || null,
            },
          ],
          { session },
        );
      } catch (patientError) {
        console.error('Patient record creation failed:', patientError.message);
        // Continue with user creation even if patient record fails
      }
    }

    // Generate and save auth token using named token system
    const authToken = await user.generateAndSaveAuthToken();

    // Generate email verification token for non-patient roles
    let emailVerificationToken = null;
    if (sanitizedData.role !== 'patient') {
      emailVerificationToken =
        await user.generateAndSaveEmailVerificationToken();
    }

    // Prepare response data
    const userData = {
      _id: user._id,
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    };

    if (isMedicalProfessional) {
      userData.specialization = user.specialization;
      userData.licenseNumber = user.licenseNumber;
      if (user.institution) {
        userData.institution = user.institution;
      }
    }

    // Send emails based on role
    try {
      if (sanitizedData.role === 'patient') {
        // Patients get welcome email (no verification needed)
        await sendWelcomeEmail(user, 'patient_welcome_token_placeholder');
      } else {
        // Medical professionals get welcome email with verification link
        await sendWelcomeEmail(user, emailVerificationToken);
      }
    } catch (emailError) {
      console.error('Email sending failed:', emailError.message);
      // Don't fail registration if email fails
    }

    // Commit transaction
    await session.commitTransaction();

    // Set HTTP-only cookie
    res.cookie('token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'strict',
      path: '/',
    });

    // Prepare success response
    let successMessage = '';
    if (sanitizedData.role === 'patient') {
      successMessage =
        'Patient registration completed successfully! You can now access your account.';
    } else {
      successMessage =
        'Registration submitted successfully! Please check your email to verify your account before logging in.';
    }

    return res.status(201).json({
      success: true,
      message: successMessage,
      data: userData,
      requiresVerification: sanitizedData.role !== 'patient',
      token: authToken, // Still return token for mobile apps, but cookie for web
    });
  } catch (error) {
    await session.abortTransaction();

    console.error('Registration process error:', error);

    // User-friendly error messages
    let statusCode = 500;
    let message = 'Registration failed due to system error';

    if (error.name === 'ValidationError') {
      statusCode = 400;
      message = 'Invalid input data provided';

      // Extract validation errors
      const validationErrors = {};
      if (error.errors) {
        Object.keys(error.errors).forEach((field) => {
          validationErrors[field] = error.errors[field].message;
        });
      }

      return res.status(statusCode).json({
        success: false,
        message: message,
        errors: validationErrors,
      });
    } else if (error.code === 11000) {
      statusCode = 409;
      message = 'Email address already exists';
    } else if (error.name === 'CastError') {
      statusCode = 400;
      message = 'Invalid data format';
    } else if (
      error.message.includes('JWT_SECRET') ||
      error.message.includes('JWT_EMAIL_SECRET')
    ) {
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
  } finally {
    session.endSession();
  }
};
