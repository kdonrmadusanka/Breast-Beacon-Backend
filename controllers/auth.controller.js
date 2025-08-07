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

    // Basic validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
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
    }

    // Generate JWT token
    const token = newUser.generateAuthToken();

    // IMPORTANT: Save the token to the user's tokens array
    await newUser.saveToken(token);

    console.log(token);

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
      await sendWelcomeEmail({
        email: newUser.email,
        name: `${newUser.firstName} ${newUser.lastName}`,
        role: "patient",
      });
    } else {
      // Create verification token for medical professionals
      const verificationToken = crypto.randomBytes(32).toString("hex");
      newUser.emailVerificationToken = crypto
        .createHash("sha256")
        .update(verificationToken)
        .digest("hex");
      await newUser.save();

      await sendVerificationEmail({
        email: newUser.email,
        name: `${newUser.firstName} ${newUser.lastName}`,
        verificationToken,
        role: newUser.role,
      });
    }

    // Set secure HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      sameSite: "strict",
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

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // Find user with password field
    const user = await User.findOne({ email }).select("+password");

    console.log("User document from DB:", user);
    console.log("Active status:", user.active, typeof user.active);

    if (!user || !(await user.correctPassword(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if account is active
    if (user.active === false) {
      console.log("Login blocked - account inactive:", {
        userId: user._id,
        dbActiveStatus: user.active,
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
      return res.status(401).json({
        success: false,
        message:
          "Account not verified. Please check your email for verification instructions.",
      });
    }

    // Generate token
    const token = await user.generateAuthToken();

    // IMPORTANT: Save the token to the user's tokens array
    await user.saveToken(token);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

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

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: userData,
      token, // Also return token for API clients
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
