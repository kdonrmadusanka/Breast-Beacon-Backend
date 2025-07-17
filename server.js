require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { initSocketIO, getIO } = require("./services/websocket.service");

const app = express();
const httpServer = http.createServer(app);

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
const authRoutes = require("./routes/auth.routes");
const dicomRoutes = require("./routes/dicom.routes");
const analysisRoutes = require("./routes/analysis.routes");
const userRoutes = require("./routes/user.routes");

app.use("/api/auth", authRoutes);
app.use("/api/dicom", dicomRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/user", userRoutes);

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Initialize Socket.IO (ONLY HERE)
initSocketIO(httpServer);

// Health Check Endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date(),
    services: {
      database:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      socketio: getIO() ? "active" : "inactive",
    },
  });
});

// Root Endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Breast Cancer Analysis Platform API",
    status: "operational",
    documentation: process.env.API_DOCS_URL || "https://docs.example.com",
    socketio: `http://localhost:${process.env.PORT || 5000}`,
  });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("❗ Server error:", err.stack);
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? "Internal server error" : err.message;
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Graceful Shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully");
  httpServer.close(() => {
    console.log("✅ HTTP server closed");
    mongoose.connection.close(false, () => {
      console.log("✅ MongoDB connection closed");
      process.exit(0);
    });
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`🔌 Socket.IO: http://localhost:${PORT}`);
});
