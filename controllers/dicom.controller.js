const Study = require("../models/Study.model");
const path = require("path");
const fs = require("fs");
const { parseDicom } = require("../utils/dicomParser");
const { queueAnalysis } = require("../services/ai.service");

const uploadDICOM = async (req, res) => {
  try {
    console.log("User in uploadDICOM:", req.user);
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const filePath = path.join(
      process.env.UPLOADS_DIR || "Uploads",
      req.file.filename
    );

    if (!fs.existsSync(filePath)) {
      return res.status(500).json({
        success: false,
        message: "Uploaded file not found",
      });
    }

    let metadata;
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const { metadata: parsedMetadata } = await parseDicom(fileBuffer);
      metadata = parsedMetadata;
    } catch (dicomError) {
      console.error("DICOM parsing error:", dicomError);
      metadata = {
        patientName: "Unknown",
        patientId: "Unknown",
        studyDate: "N/A",
        modality: req.file.mimetype.startsWith("image/") ? "IMAGE" : "DICOM",
        fileSize: req.file.size,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      };
    }

    const study = new Study({
      userId: req.user.id,
      filePath,
      metadata,
      status: "uploaded",
    });

    await study.save();

    try {
      console.log("Queuing analysis for study:", study._id);
      await queueAnalysis(study._id, filePath);
    } catch (analysisError) {
      console.error("Analysis queue error:", analysisError);
    }

    res.json({
      success: true,
      data: {
        id: study._id,
        filePath: `/Uploads/${req.file.filename}`,
        metadata,
      },
    });
  } catch (error) {
    console.error("Error in uploadDICOM:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const getImage = async (req, res) => {
  try {
    const study = await Study.findById(req.params.id);
    if (!study) {
      return res.status(404).json({ message: "Study not found" });
    }
    if (
      study.userId.toString() !== req.user.id &&
      req.user.role !== "clinician"
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!fs.existsSync(study.filePath)) {
      return res.status(404).json({ message: "File not found" });
    }

    res.sendFile(path.resolve(study.filePath));
  } catch (error) {
    console.error("Error in getImage:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getMetadata = async (req, res) => {
  try {
    const study = await Study.findById(req.params.id);
    if (!study) {
      return res.status(404).json({ message: "Study not found" });
    }
    if (
      study.userId.toString() !== req.user.id &&
      req.user.role !== "clinician"
    ) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.json({
      success: true,
      data: study.metadata,
    });
  } catch (error) {
    console.error("Error in getMetadata:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  uploadDICOM,
  getImage,
  getMetadata,
};
