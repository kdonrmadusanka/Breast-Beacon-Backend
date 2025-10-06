import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js'

dotenv.config();

const app = express();

app.use(express.json());

connectDB();

app.use(cors());

app.use('/api/auth', authRoutes);
