const express = require("express");
const router = express.Router();
const doctorController = require("../controllers/doctor.controller");

router.post("/", doctorController.createDoctor);
router.get("/:id", doctorController.getDoctorById);
router.get("/", doctorController.getAllDoctors);
router.put("/:id", doctorController.updateDoctor);
router.delete("/:id", doctorController.deleteDoctor);

module.exports = router;
