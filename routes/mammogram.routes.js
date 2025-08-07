import express from "express";
import { multerInstance } from "../middleware/file-upload.js";
import { uploadMammogram } from "../controllers/mammogram.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

router.post(
  "/upload",
  authenticate,
  authorize("radiologist", "technician", "admin", "patient"),
  multerInstance.single("mammogram"),
  uploadMammogram
);

export default router;
