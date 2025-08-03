import express from 'express';
import { multerInstance } from '../middleware/file-upload.js';
import { uploadMammogram } from '../controllers/mammogram.controller.js';

const router = express.Router();

router.post('/upload', 
  multerInstance.single('mammogram'), 
  uploadMammogram
);

export default router;