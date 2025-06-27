const Clinician = require("..//models/clinician.model");

// Create clinician with comprehensive validation
exports.createClinician = async (req, res) => {
  try {
    const { email, name, role, department, licenseNumber, password } = req.body;

    // Basic validation
    const requiredFields = { email, name, role, department, password };
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: "ValidationError",
        message: "Missing required fields",
        missingFields,
      });
    }

    // Check for existing email or license number
    const existingClinician = await Clinician.findOne({
      $or: [
        { email: { $regex: new RegExp(`^${email}$`, "i") } },
        ...(licenseNumber ? [{ licenseNumber }] : []),
      ],
    });

    if (existingClinician) {
      const conflictField =
        existingClinician.email.toLowerCase() === email.toLowerCase()
          ? "email"
          : "licenseNumber";

      return res.status(409).json({
        success: false,
        error: "DuplicateEntry",
        message: `${conflictField} already exists`,
        conflictField,
        [conflictField]: existingClinician[conflictField],
      });
    }

    // Create new clinician
    const clinician = new Clinician({
      email: email.toLowerCase(),
      name,
      role,
      department,
      ...(licenseNumber && { licenseNumber }),
      password,
    });

    await clinician.save();

    // Return response (password automatically removed by toJSON transform)
    res.status(201).json({
      success: true,
      message: "Clinician registered successfully",
      clinician,
      clinicianId: clinician.clinicianId,
    });
  } catch (error) {
    console.error("Error creating clinician:", error);

    // Handle specific error types
    if (error.code === 11000) {
      const key = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        error: "DuplicateKey",
        message: `${key} already exists`,
        key,
        value: error.keyValue[key],
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).reduce(
        (acc, { path, message }) => {
          acc[path] = message;
          return acc;
        },
        {}
      );

      return res.status(400).json({
        success: false,
        error: "ValidationError",
        message: "Validation failed",
        errors,
      });
    }

    // Generic error handler
    res.status(500).json({
      success: false,
      error: "ServerError",
      message: "An unexpected error occurred",
      ...(process.env.NODE_ENV === "development" && {
        details: error.message,
        stack: error.stack,
      }),
    });
  }
};

// Additional clinician controller methods could include:
// - updateClinician
// - deactivateClinician
// - getClinicianById
// - listClinicians
