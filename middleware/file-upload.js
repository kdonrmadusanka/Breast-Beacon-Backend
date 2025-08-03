import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure upload directory exists
const ensureUploadDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const uploadDir = process.env.UPLOAD_DIR || './uploads';
ensureUploadDir(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create patient-specific directory if ID is provided
    if (req.params.patientId) {
      const patientDir = path.join(uploadDir, req.params.patientId);
      ensureUploadDir(patientDir);
      cb(null, patientDir);
    } else {
      cb(null, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `upload_${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/dicom'];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, or DICOM images are allowed'), false);
  }
  cb(null, true);
};

const limits = {
  fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '20') * 1024 * 1024,
  files: 1
};

// Option 1: Export the multer instance to use .single() in routes
export const multerInstance = multer({
  storage,
  fileFilter,
  limits
});

// Option 2: Export pre-configured single upload middleware
export const uploadSingleMammogram = multer({
  storage,
  fileFilter,
  limits
}).single('mammogram');

// Middleware wrapper for better error handling (use with Option 2)
export const handleFileUpload = (req, res, next) => {
  uploadSingleMammogram(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        error: 'File upload error',
        details: err.code === 'LIMIT_FILE_SIZE' 
          ? 'File too large' 
          : err.message
      });
    } else if (err) {
      return res.status(500).json({
        error: 'File upload failed',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
    next();
  });
};