const Doctor = require("../models/doctor.model");

// Create a doctor
exports.createDoctor = async (req, res) => {
  try {
    const { email, name, specialty, password } = req.body;
    const doctor = new Doctor({ email, name, specialty, password });
    await doctor.save();
    res.status(201).json(doctor);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
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
