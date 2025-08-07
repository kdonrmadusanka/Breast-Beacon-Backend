// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { setupSwagger } from "./config/swagger.js"; // Import Swagger setup
import mammogramRoutes from "./routes/mammogram.routes.js";
import authRoutes from "./routes/auth.rotes.js";
import { setupCronJobs } from "./utils/cronJobs.js";

// Load environment variables from .env file
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "20mb" })); // Increased limit for file uploads
app.use(bodyParser.urlencoded({ extended: true, limit: "20mb" }));

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Setup Swagger documentation
if (process.env.NODE_ENV !== "production") {
  setupSwagger(app);
}

// API Routes
app.use("/api/v1/mammograms", mammogramRoutes);
app.use("/api/v1/auth", authRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.stack);

  // Handle file upload errors specifically
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "File too large",
      details: `Maximum file size is ${process.env.MAX_FILE_SIZE_MB || 20}MB`,
    });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation Error",
      details: err.message,
    });
  }

  res.status(500).json({
    error: "Internal Server Error",
    details: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`📚 API docs available at http://localhost:${PORT}/api-docs`);
  }
  // Initialize cron jobs after server starts
  setupCronJobs();
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
  server.close(() => process.exit(1));
});

export default app;
