const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir =
      process.env.UPLOADS_DIR || path.join(__dirname, "../uploads");
    require("fs").mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || ".dcm";
    cb(null, `dicom-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/dicom",
    "application/octet-stream",
    "image/dicom",
    "image/x-dicom",
    "image/dcm",
    "image/x-dcm",
  ];

  if (allowedTypes.some((type) => file.mimetype.includes(type))) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only DICOM files are allowed."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for DICOM files
  },
});

module.exports = upload;
