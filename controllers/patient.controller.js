const Patient = require("../models/patient.model");

const bcrypt = require("bcrypt");
const saltRounds = 10; // Standard secure value for bcrypt

// Create a patient with email existence check and auto-increment ID
exports.createPatient = async (req, res) => {
  try {
    const { email, name, dateOfBirth, password } = req.body;

    // Input validation - more comprehensive
    if (!email || !name || !dateOfBirth || !password) {
      return res.status(400).json({
        error: "Invalid input",
        message: "All fields are required",
        fields: {
          email: !email ? "Email is required" : null,
          name: !name ? "Name is required" : null,
          dateOfBirth: !dateOfBirth ? "Date of birth is required" : null,
          password: !password ? "Password is required" : null,
        },
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Invalid email",
        message: "Please provide a valid email address",
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        error: "Weak password",
        message: "Password must be at least 8 characters long",
      });
    }

    // Check if email already exists (case insensitive)
    const existingPatient = await Patient.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") },
    });
    if (existingPatient) {
      return res.status(409).json({
        // 409 Conflict is more appropriate for duplicate resources
        error: "Registration failed",
        message: "Email already exists",
        suggestion: "Try logging in or use a different email",
      });
    }

    // Hash password with proper error handling
    let hashedPassword;
    try {
      hashedPassword = await bcrypt.hash(password, saltRounds);
    } catch (hashError) {
      console.error("Password hashing failed:", hashError);
      return res.status(500).json({
        error: "Registration failed",
        message: "Could not secure password",
      });
    }

    // Create new patient
    const patient = new Patient({
      email: email.toLowerCase(), // Store email in lowercase
      name,
      dateOfBirth,
      password: hashedPassword,
    });

    await patient.save();

    // Return sanitized patient data
    const patientData = patient.toObject();
    delete patientData.password;
    delete patientData.__v; // Remove version key

    res.status(201).json({
      success: true,
      message: "Patient registered successfully",
      patient: patientData,
      patientId: patientData.patientId, // Include the auto-generated ID
    });
  } catch (error) {
    console.error("Error creating patient:", error);

    // Handle duplicate key errors separately
    if (error.code === 11000) {
      return res.status(409).json({
        error: "Duplicate key",
        message: "Email already exists",
        details: error.keyValue,
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation failed",
        message: error.message,
        details: error.errors,
      });
    }

    // Generic error handler
    res.status(500).json({
      error: "Server error",
      message: "An unexpected error occurred",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get patient by patientId (e.g., P-0001)
exports.getPatientById = async (req, res) => {
  try {
    const patientId = req.params.patientId;
    const patient = await Patient.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }
    // Exclude password from response
    const patientData = patient.toObject();
    delete patientData.password;
    res.status(200).json(patientData);
  } catch (error) {
    console.error("Error fetching patient:", error);
    res.status(500).json({ error: "Server error", message: error.message });
  }
};

// Get all patients
exports.getAllPatients = async (req, res) => {
  try {
    const patients = await Patient.find({}, "-password"); // Exclude password
    res.status(200).json(patients);
  } catch (error) {
    console.error("Error fetching patients:", error);
    res.status(500).json({ error: "Server error", message: error.message });
  }
};

// Update patient
exports.updatePatient = async (req, res) => {
  try {
    const { email, name, dateOfBirth, password } = req.body;
    const patient = await Patient.findOneAndUpdate(
      { patientId: req.params.patientId },
      { email, name, dateOfBirth, password },
      { new: true, runValidators: true, select: "-password" }
    );
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }
    res.status(200).json(patient);
  } catch (error) {
    console.error("Error updating patient:", error);
    res.status(500).json({ error: "Server error", message: error.message });
  }
};

// Delete patient
exports.deletePatient = async (req, res) => {
  try {
    const patient = await Patient.findOneAndDelete({
      patientId: req.params.patientId,
    });
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }
    res.status(200).json({ message: "Patient deleted" });
  } catch (error) {
    console.error("Error deleting patient:", error);
    res.status(500).json({ error: "Server error", message: error.message });
  }
};
