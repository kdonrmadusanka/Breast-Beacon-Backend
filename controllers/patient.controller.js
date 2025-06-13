const Patient = require("../models/patient.model");

// Create a patient
exports.createPatient = async (req, res) => {
  try {
    const { email, name, dateOfBirth, password } = req.body;
    const patient = new Patient({ email, name, dateOfBirth, password });
    await patient.save();
    res.status(201).json(patient);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Get patient by ID
exports.getPatientById = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }
    res.status(200).json(patient);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Get all patients
exports.getAllPatients = async (req, res) => {
  try {
    const patients = await Patient.find();
    res.status(200).json(patients);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Update patient
exports.updatePatient = async (req, res) => {
  try {
    const { email, name, dateOfBirth, password } = req.body;
    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      { email, name, dateOfBirth, password },
      { new: true, runValidators: true }
    );
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }
    res.status(200).json(patient);
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};

// Delete patient
exports.deletePatient = async (req, res) => {
  try {
    const patient = await Patient.findByIdAndDelete(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }
    res.status(200).json({ message: "Patient deleted" });
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
};
