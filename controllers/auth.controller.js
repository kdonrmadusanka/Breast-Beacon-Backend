import User from "../models/User.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  sendWelcomeEmail,
  sendVerificationEmail,
} from "../services/email_notification.service.js";

export const registerUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    // Log registration attempt
    await logEvent({
      eventType: "security",
      action: "user_registration_attempt",
      status: "success",
      metadata: {
        email,
        role,
        ip: req.clientIpAddress,
      },
      req,
    });

    // Basic validation
    if (!firstName || !lastName || !email || !password) {
      await logEvent({
        eventType: "security",
        action: "user_registration_failed",
        status: "failure",
        metadata: {
          reason: "missing_fields",
          fields: { firstName, lastName, email, password: !!password },
        },
        req,
      });
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      await logEvent({
        eventType: "security",
        action: "user_registration_failed",
        status: "failure",
        metadata: {
          reason: "email_in_use",
          email,
        },
        req,
      });
      return res.status(409).json({
        success: false,
        message: "Email already in use",
      });
    }

    // Handle medical professional specific fields
    const isMedicalProfessional = [
      "radiologist",
      "physician",
      "technician",
      "admin",
    ].includes(role);
    const medicalFields = {};

    if (isMedicalProfessional) {
      const { licenseNumber, specialization, institution } = req.body;

      if (!licenseNumber || !specialization || !institution) {
        await logEvent({
          eventType: "security",
          action: "medical_registration_failed",
          status: "failure",
          metadata: {
            reason: "missing_medical_fields",
            fields: { licenseNumber, specialization, institution },
          },
          req,
        });
        return res.status(400).json({
          success: false,
          message:
            "Medical professionals must provide license number, specialization, and institution",
        });
      }

      medicalFields.licenseNumber = licenseNumber;
      medicalFields.specialization = specialization;
      medicalFields.institution = institution;
    }

    // Create new user
    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password,
      role: role || "patient",
      ...medicalFields,
      isVerified: role === "patient", // Auto-verify patients
    });

    newUser.active = true;

    // Log user creation
    await logEvent({
      eventType: "security",
      action: "user_created",
      status: "success",
      userId: newUser._id,
      userRole: newUser.role,
      metadata: {
        isVerified: newUser.isVerified,
        isMedicalProfessional,
      },
      req,
    });

    // If the user is a patient, create a patient record with generated ID
    if (newUser.role === "patient") {
      const patientId = await generatePatientId();

      // Extract patient-specific fields from request body
      const { dateOfBirth, gender, phoneNumber, address } = req.body;

      await Patient.create({
        user: newUser._id,
        patientId,
        dateOfBirth,
        gender,
        phoneNumber,
        address,
      });

      // Log patient record creation
      await logEvent({
        eventType: "system",
        action: "patient_record_created",
        status: "success",
        userId: newUser._id,
        metadata: {
          patientId,
          hasDemographics: !!(dateOfBirth && gender),
        },
        req,
      });
    }

    // Generate JWT token
    const token = newUser.generateAuthToken();

    // Save the token to the user's tokens array
    await newUser.saveToken(token);

    // Log token generation
    await logEvent({
      eventType: "security",
      action: "auth_token_generated",
      status: "success",
      userId: newUser._id,
      metadata: {
        tokenType: "jwt",
        tokenLength: token.length, // Don't log actual token
      },
      req,
    });

    // Prepare user data for response (without password)
    const userData = {
      _id: newUser._id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      role: newUser.role,
      isVerified: newUser.isVerified,
      createdAt: newUser.createdAt,
    };

    // Add medical fields to response if applicable
    if (isMedicalProfessional) {
      userData.specialization = newUser.specialization;
      userData.institution = newUser.institution;
    }

    // Send appropriate email based on user type
    if (newUser.role === "patient") {
      try {
        await sendWelcomeEmail({
          email: newUser.email,
          name: `${newUser.firstName} ${newUser.lastName}`,
          role: "patient",
        });
        await logEvent({
          eventType: "system",
          action: "welcome_email_sent",
          status: "success",
          userId: newUser._id,
          metadata: {
            emailType: "welcome",
            recipient: newUser.email,
          },
          req,
        });
      } catch (emailError) {
        await logEvent({
          eventType: "system",
          action: "welcome_email_failed",
          status: "failure",
          userId: newUser._id,
          metadata: {
            error: emailError.message,
            recipient: newUser.email,
          },
          req,
        });
      }
    } else {
      // Create verification token for medical professionals
      const verificationToken = crypto.randomBytes(32).toString("hex");
      newUser.emailVerificationToken = crypto
        .createHash("sha256")
        .update(verificationToken)
        .digest("hex");
      await newUser.save();

      try {
        await sendVerificationEmail({
          email: newUser.email,
          name: `${newUser.firstName} ${newUser.lastName}`,
          verificationToken,
          role: newUser.role,
        });
        await logEvent({
          eventType: "security",
          action: "verification_email_sent",
          status: "success",
          userId: newUser._id,
          metadata: {
            emailType: "verification",
            recipient: newUser.email,
            verificationTokenLength: verificationToken.length, // Don't log actual token
          },
          req,
        });
      } catch (emailError) {
        await logEvent({
          eventType: "security",
          action: "verification_email_failed",
          status: "failure",
          userId: newUser._id,
          metadata: {
            error: emailError.message,
            recipient: newUser.email,
          },
          req,
        });
      }
    }

    // Set secure HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      sameSite: "strict",
    });

    // Log successful registration completion
    await logEvent({
      eventType: "security",
      action: "user_registration_completed",
      status: "success",
      userId: newUser._id,
      userRole: newUser.role,
      metadata: {
        registrationMethod: "standard",
        verificationStatus: newUser.isVerified,
      },
      req,
    });

    return res.status(201).json({
      success: true,
      message:
        newUser.role === "patient"
          ? "Patient registration successful!"
          : "Registration submitted! Please check your email to verify your account.",
      data: userData,
      token: token, // Include the token in the response
    });
  } catch (error) {
    console.error("Registration error:", error);

    // Log registration failure
    await logEvent({
      eventType: "security",
      action: "user_registration_failed",
      status: "failure",
      metadata: {
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        requestBody: {
          email: req.body.email,
          role: req.body.role,
        },
      },
      req,
    });

    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Helper function to generate patient ID
const generatePatientId = async () => {
  try {
    // Find and increment the patient counter
    const counter = await Counter.findOneAndUpdate(
      { name: "patientId" },
      { $inc: { value: 1 } },
      { new: true, upsert: true }
    );

    // Format the ID with leading zeros
    const paddedNumber = String(counter.value).padStart(4, "0");
    return `P-${paddedNumber}`;
  } catch (error) {
    console.error("Error generating patient ID:", error);
    throw new Error("Failed to generate patient ID");
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Log login attempt
    await logEvent({
      eventType: "security",
      action: "login_attempt",
      status: "success",
      metadata: {
        email,
        ip: req.clientIpAddress,
        userAgent: req.headers["user-agent"],
      },
      req,
    });

    // Validate input
    if (!email || !password) {
      await logEvent({
        eventType: "security",
        action: "login_failed",
        status: "failure",
        metadata: {
          reason: "missing_credentials",
          fields: { email: !!email, password: !!password },
        },
        req,
      });
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // Find user with password field
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.correctPassword(password, user.password))) {
      await logEvent({
        eventType: "security",
        action: "login_failed",
        status: "failure",
        metadata: {
          reason: "invalid_credentials",
          email,
          accountExists: !!user,
        },
        req,
      });
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if account is active
    if (user.active === false) {
      await logSecurityEvent({
        action: "login_blocked_inactive",
        user,
        status: "failure",
        metadata: {
          reason: "account_inactive",
          lastActive: user.lastLogin,
        },
        req,
      });
      return res.status(401).json({
        success: false,
        message: "Account has been deactivated",
      });
    }

    // Check verification for medical professionals
    if (
      ["radiologist", "physician", "technician", "admin"].includes(user.role) &&
      !user.isVerified
    ) {
      await logSecurityEvent({
        action: "login_blocked_unverified",
        user,
        status: "failure",
        metadata: {
          reason: "account_unverified",
          role: user.role,
          verificationRequested: !!user.emailVerificationToken,
        },
        req,
      });
      return res.status(401).json({
        success: false,
        message:
          "Account not verified. Please check your email for verification instructions.",
      });
    }

    // Generate token
    const token = await user.generateAuthToken();

    // Save the token to the user's tokens array
    await user.saveToken(token);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Log successful authentication
    await logSecurityEvent({
      action: "user_authenticated",
      user,
      status: "success",
      metadata: {
        authMethod: "password",
        tokenGenerationTime: new Date(),
        tokenLength: token.length, // Don't log actual token
      },
      req,
    });

    // Prepare user data for response
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      lastLogin: user.lastLogin,
    };

    // Add medical fields if applicable
    if (
      ["radiologist", "physician", "technician", "admin"].includes(user.role)
    ) {
      userData.specialization = user.specialization;
      userData.institution = user.institution;
    }

    // Set secure HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: "strict",
    });

    // Log successful login completion
    await logEvent({
      eventType: "security",
      action: "login_success",
      user,
      status: "success",
      metadata: {
        sessionDuration: "7 days",
        cookieSecure: process.env.NODE_ENV === "production",
      },
      req,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: userData,
      token, // Also return token for API clients
    });
  } catch (error) {
    console.error("Login error:", error);

    // Log login failure
    await logEvent({
      eventType: "security",
      action: "login_error",
      status: "failure",
      metadata: {
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        attemptedEmail: req.body.email,
      },
      req,
    });

    res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
