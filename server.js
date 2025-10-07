import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js'

// Load environment variables from .env file
dotenv.config();

// Initialize express app
const app = express();

// Middleware to parse incoming JSON
app.use(express.json());

// Enable CORS for cross-origin requests
app.use(cors());

// Connect to MongoDB
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

// Default route
app.get('/', (req, res) => {
  res.send('API is running...');
});

// Global error handling middleware (optional but good practice)
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Define PORT and start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
