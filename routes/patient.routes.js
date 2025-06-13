const express = require("express");
const router = express.Router();
const patientController = require("../controllers/patient.controller");

router.post("/", patientController.createPatient);
router.get("/:id", patientController.getPatientById);
router.get("/", patientController.getAllPatients);
router.put("/:id", patientController.updatePatient);
router.delete("/:id", patientController.deletePatient);

module.exports = router;
