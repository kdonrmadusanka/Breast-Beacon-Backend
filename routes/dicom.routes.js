const express = require("express");
const router = express.Router();
const { checkUserStatus, checkRole } = require("../middleware/authMiddleware");
const {
  uploadDICOM,
  getImage,
  getMetadata,
} = require("../controllers/dicom.controller");
const upload = require("../config/multer.config");

router.post(
  "/upload",
  checkUserStatus,
  checkRole(["patient"]),
  upload.single("dicomFile"),
  uploadDICOM
);
router.get(
  "/:id/image",
  checkUserStatus,
  checkRole(["patient", "clinician"]),
  getImage
);
router.get(
  "/:id/metadata",
  checkUserStatus,
  checkRole(["patient", "clinician"]),
  getMetadata
);

module.exports = router;
