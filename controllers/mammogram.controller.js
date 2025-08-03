import Mammogram from '../models/Mammogram.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp'; // For image processing
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import mammogramMetadataParser from '../utils/mammogram-metadata-parser.js'; // Hypothetical DICOM parser
import crypto from 'crypto';

// Configure S3 if using cloud storage
const s3Client = process.env.STORAGE_TYPE === 's3' ? new S3Client({ 
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
  }
}) : null;

export const uploadMammogram = async (req, res) => {
  try {
    // Validate required fields
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { patientId, notes, laterality, viewPosition } = req.body;
    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/dicom'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only JPEG, PNG, or DICOM images are allowed' });
    }

    // Validate file size (e.g., 20MB max for DICOM)
    const maxSize = req.file.mimetype === 'image/dicom' ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    if (req.file.size > maxSize) {
      return res.status(400).json({ error: `File size exceeds ${maxSize/(1024*1024)}MB limit` });
    }

    // Generate secure filename and paths
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const uniqueId = uuidv4();
    const sanitizedFilename = `mammo_${patientId}_${laterality || 'unknown'}_${viewPosition || 'unknown'}_${uniqueId}${fileExtension}`;
    
    // Create directory structure if using local storage
    const uploadDate = new Date();
    const yearMonth = `${uploadDate.getFullYear()}-${(uploadDate.getMonth()+1).toString().padStart(2, '0')}`;
    const patientFolder = `patient_${patientId}`;
    const localBasePath = path.join(process.env.UPLOAD_DIR, 'mammograms', yearMonth, patientFolder);
    
    // Ensure directories exist
    if (process.env.STORAGE_TYPE === 'local') {
      fs.mkdirSync(localBasePath, { recursive: true });
    }

    // Process the image based on type
    let processedFilePath;
    let metadata = {};
    
    if (req.file.mimetype === 'image/dicom') {
      // Special handling for DICOM files
      metadata = await mammogramMetadataParser(req.file.path);
      processedFilePath = path.join(localBasePath, sanitizedFilename);
      fs.renameSync(req.file.path, processedFilePath);
    } else {
      // Process standard images (convert to consistent format, optimize)
      processedFilePath = path.join(localBasePath, sanitizedFilename);
      await sharp(req.file.path)
        .jpeg({ quality: 90, mozjpeg: true }) // Convert to high-quality JPEG
        .resize(3000, 4000, { fit: 'inside', withoutEnlargement: true }) // Standardize size
        .toFile(processedFilePath);
      fs.unlinkSync(req.file.path); // Remove original
    }

    // If using S3, upload to cloud storage
    let storagePath = processedFilePath;
    if (process.env.STORAGE_TYPE === 's3') {
      const s3Key = `mammograms/${yearMonth}/${patientFolder}/${sanitizedFilename}`;
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
        Body: fs.createReadStream(processedFilePath),
        ContentType: req.file.mimetype,
        Metadata: metadata
      }));
      storagePath = s3Key;
      
      // Optionally remove local file after S3 upload
      if (process.env.CLEAN_LOCAL_UPLOADS === 'true') {
        fs.unlinkSync(processedFilePath);
      }
    }

    // Create database record
    const newMammogram = new Mammogram({
      patientId,
      originalFilename: req.file.originalname,
      storagePath,
      storageType: process.env.STORAGE_TYPE || 'local',
      notes: notes || '',
      uploadedBy: user.id,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      metadata: {
        laterality,
        viewPosition,
        ...metadata
      },
      uploadDate,
      checksum: await calculateFileChecksum(processedFilePath) // For data integrity
    });

    await newMammogram.save();
    
    // Return enriched response
    res.status(201).json({
      success: true,
      mammogram: newMammogram,
      previewUrl: generatePreviewUrl(newMammogram) // Helper function to generate access URL
    });

  } catch (err) {
    console.error('Error uploading mammogram:', err);
    
    // Clean up files if error occurred
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Failed to upload mammogram',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Helper function to calculate file checksum
async function calculateFileChecksum(filePath) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Helper function to generate access URL based on storage type
function generatePreviewUrl(mammogram) {
  if (mammogram.storageType === 's3') {
    return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${mammogram.storagePath}`;
  }
  return `${process.env.APP_URL}/api/mammograms/${mammogram._id}/preview`;
}

// Get all mammograms (with pagination)
export const getMammograms = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const mammograms = await Mammogram.find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.json(mammograms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Other controller functions...
export const getMammogramById = async (req, res) => { /* ... */ };
export const deleteMammogram = async (req, res) => { /* ... */ };