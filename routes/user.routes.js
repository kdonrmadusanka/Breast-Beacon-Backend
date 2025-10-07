import express from 'express';
import { verifyEmail } from '../controllers/user.controller.js';

const router = express.Router();

// Email verification route
router.get('/verify-email', verifyEmail);

export default router;
