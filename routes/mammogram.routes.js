const express = require("express");
const router = express.Router();
const mammogramController = require("../controllers/mammogram.controller");
const authMiddleware = require("../middleware/auth");

router.post(
  "/upload",
  authMiddleware(["patient"]),
  mammogramController.uploadMammogram
);
router.get(
  "/:id",
  authMiddleware(["patient", "doctor", "clinician"]),
  mammogramController.getMammogramById
);
router.get(
  "/patient/:patientId",
  authMiddleware(["patient", "doctor", "clinician"]),
  mammogramController.getMammogramsByPatientId
);
router.delete(
  "/:id",
  authMiddleware(["patient", "admin"]),
  mammogramController.deleteMammogram
);

module.exports = router;
