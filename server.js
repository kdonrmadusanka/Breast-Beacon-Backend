const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const mammogramRoutes = require("./routes/mammogram.routes");
const chatMessageRoutes = require("./routes/chatMessage.routes");
const patientRoutes = require("./routes/patient.routes");
const doctorRoutes = require("./routes/doctor.routes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose
  .connect("mongodb://localhost/breastcancer_db", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"));

// Routes
app.use("/api/mammograms", mammogramRoutes);
app.use("/api/chatMessages", chatMessageRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/doctors", doctorRoutes);

// Server Start
app.listen(5000, () => console.log("Server running on port 5000"));
