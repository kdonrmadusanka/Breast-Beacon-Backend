const express = require("express");
const router = express.Router();
const multer = require("multer");
const mammogramController = require("../controllers/mammogram.controller");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

router.post(
  "/",
  upload.single("mammogram"),
  mammogramController.uploadMammogram
);
router.get("/:id", mammogramController.getMammogramById);
router.get("/patient/:patientId", mammogramController.getMammogramsByPatientId);
router.delete("/:id", mammogramController.deleteMammogram);

module.exports = router;
