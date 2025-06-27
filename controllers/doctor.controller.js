const Doctor = require("../models/doctor.model");

// Create a doctor with enhanced validation and security
exports.createDoctor = async (req, res) => {
  try {
    const { email, name, specialty, password } = req.body;

    // Input validation
    if (!email || !name || !specialty || !password) {
      return res.status(400).json({
        success: false,
        error: "ValidationError",
        message: "All fields are required",
        fields: {
          email: !email ? "Email is required" : null,
          name: !name ? "Name is required" : null,
          specialty: !specialty ? "Specialty is required" : null,
          password: !password ? "Password is required" : null,
        },
      });
    }

    // Check if email already exists (case insensitive)
    const existingDoctor = await Doctor.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") },
    });

    if (existingDoctor) {
      return res.status(409).json({
        success: false,
        error: "DuplicateEmail",
        message: "Email already exists",
        suggestion: "Please use a different email or login",
      });
    }

    // Create new doctor - pre-save hook will handle ID and password hashing
    const doctor = new Doctor({
      email: email.toLowerCase(),
      name,
      specialty,
      password,
    });

    await doctor.save();

    // Return sanitized doctor data
    const doctorData = doctor.toObject();
    delete doctorData.password;
    delete doctorData.__v;

    res.status(201).json({
      success: true,
      message: "Doctor registered successfully",
      doctor: doctorData,
      doctorId: doctorData.doctorId,
    });
  } catch (error) {
    console.error("Error creating doctor:", error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "DuplicateKey",
        message: "Doctor with this email already exists",
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((el) => el.message);
      return res.status(400).json({
        success: false,
        error: "ValidationError",
        message: "Validation failed",
        details: errors,
      });
    }

    // Generic error handler
    res.status(500).json({
      success: false,
      error: "ServerError",
      message: "An unexpected error occurred",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get doctor by ID
exports.getDoctorById = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found" });
    }
    res.status(200).json(doctor);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Get all doctors
exports.getAllDoctors = async (req, res) => {
  try {
    const doctors = await Doctor.find();
    res.status(200).json(doctors);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Update doctor
exports.updateDoctor = async (req, res) => {
  try {
    const { email, name, specialty, password } = req.body;
    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { email, name, specialty, password },
      { new: true, runValidators: true }
    );
    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found" });
    }
    res.status(200).json(doctor);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Delete doctor
exports.deleteDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findByIdAndDelete(req.params.id);
    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found" });
    }
    res.status(200).json({ message: "Doctor deleted" });
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};
